'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase/server'
import { requirePrepAccess, type SessionContext } from '@/lib/auth'
import { type DateOnly, isPrepDay, sealedExpiryFor, today, upcomingPrepDay } from '@/lib/date'
import type { Site } from '@/lib/types/database'
import { fail, ok, type ActionResult } from './types'

const MAX_ML = 100_000

function revalidatePrep(): void {
  revalidatePath('/prep')
  revalidatePath('/dispatch')
  revalidatePath('/batches')
  revalidatePath('/expiry')
  revalidatePath('/overtime')
  revalidatePath('/dashboard')
  revalidatePath('/today')
}

/**
 * The prep session doubles as the overtime clock, so it must record when work
 * genuinely started. It is created on the first real action of the day — either
 * an explicit "Start prep" or the first sauce logged — and never on a page
 * view, which would silently inflate someone's hours.
 */
async function ensureSession(
  context: SessionContext & { prepSite: Site },
  prepDate: DateOnly,
): Promise<string> {
  const supabase = createServerSupabase()

  const { data: existing } = await supabase
    .from('prep_sessions')
    .select('id')
    .eq('site_id', context.prepSite.id)
    .eq('prep_date', prepDate)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>()

  if (existing) return existing.id

  const { data: plan } = await supabase
    .from('prep_plans')
    .select('id')
    .eq('site_id', context.prepSite.id)
    .eq('prep_date', prepDate)
    .maybeSingle<{ id: string }>()

  const { data: session, error } = await supabase
    .from('prep_sessions')
    .insert({
      site_id: context.prepSite.id,
      plan_id: plan?.id ?? null,
      staff_id: context.profile.id,
      prep_date: prepDate,
    })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(error.message)

  return session.id
}

/** Clocks in. Optional — logging a sauce starts the clock too. */
export async function startPrepSession(input: {
  prepDate?: DateOnly
}): Promise<ActionResult<{ sessionId: string }>> {
  try {
    const context = await requirePrepAccess()
    const prepDate = input.prepDate ?? today()

    if (!isPrepDay(prepDate, context.prepWeekdays)) {
      return fail(new Error('That date is not a prep day.'))
    }

    const sessionId = await ensureSession(context, prepDate)

    revalidatePrep()
    return ok({ sessionId })
  } catch (error) {
    return fail(error, 'Could not start prep.')
  }
}

/** Clocks out — this is what turns the session into an overtime record. */
export async function endPrepSession(sessionId: string): Promise<ActionResult> {
  try {
    await requirePrepAccess()
    const supabase = createServerSupabase()

    const { error } = await supabase
      .from('prep_sessions')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', sessionId)
      .is('ended_at', null)
    if (error) throw new Error(error.message)

    revalidatePrep()
    return ok()
  } catch (error) {
    return fail(error, 'Could not finish prep.')
  }
}

/**
 * Records one sauce as made: the volume produced and the bags it went into.
 *
 * This is the whole prep flow now — one action per sauce. It creates the bag
 * records (each with its own 5-day clock) and stamps the checklist line in a
 * single step, so there is no state where the sauce is "packed" but its stock
 * doesn't exist, or vice versa.
 */
export async function completePrepLine(input: {
  sauceId: string
  prepDate: DateOnly
  pack: Record<number, number>
}): Promise<ActionResult<{ madeMl: number; bags: number; sealedExpiry: DateOnly }>> {
  try {
    const context = await requirePrepAccess()

    if (!isPrepDay(input.prepDate, context.prepWeekdays)) {
      return fail(new Error('That date is not a prep day.'))
    }

    let bags = 0
    let madeMl = 0
    for (const [sizeKey, count] of Object.entries(input.pack)) {
      const size = Number(sizeKey)
      if (!Number.isInteger(count) || count < 0) {
        return fail(new Error('Bag counts must be whole numbers.'))
      }
      if (count === 0) continue
      if (!Number.isFinite(size) || size <= 0) {
        return fail(new Error(`Unsupported bag size: ${sizeKey}.`))
      }
      bags += count
      madeMl += size * count
    }

    if (bags < 1) return fail(new Error('Add at least one bag before marking this done.'))
    if (bags > 500) return fail(new Error('That is more than 500 bags — check the numbers.'))
    if (madeMl > MAX_ML) return fail(new Error('That is over 100,000 ml — check the numbers.'))

    const siteId = context.prepSite.id
    const supabase = createServerSupabase()
    const sessionId = await ensureSession(context, input.prepDate)

    const { error: bagError } = await supabase.rpc('create_batch_bags', {
      p_site_id: siteId,
      p_sauce_id: input.sauceId,
      p_session_id: sessionId,
      p_prep_date: input.prepDate,
      p_pack: input.pack,
    })
    if (bagError) throw new Error(bagError.message)

    // Carry the planned quantity across so "made vs planned" stays answerable
    // even for a sauce that was never in the plan (planned stays 0 there).
    const { data: planned } = await supabase
      .from('prep_plan_items')
      .select('suggested_ml, override_ml, prep_plans!inner(site_id, prep_date)')
      .eq('sauce_id', input.sauceId)
      .eq('prep_plans.site_id', siteId)
      .eq('prep_plans.prep_date', input.prepDate)
      .maybeSingle<{ suggested_ml: number; override_ml: number | null }>()

    const { error: lineError } = await supabase.from('prep_checklist').upsert(
      {
        site_id: siteId,
        prep_date: input.prepDate,
        session_id: sessionId,
        sauce_id: input.sauceId,
        planned_ml: planned ? (planned.override_ml ?? planned.suggested_ml) : 0,
        actual_ml: madeMl,
        completed_at: new Date().toISOString(),
      },
      { onConflict: 'site_id,prep_date,sauce_id' },
    )
    if (lineError) throw new Error(lineError.message)

    // The trigger is the source of truth for the actual shelf life; this
    // mirrors it so the returned estimate matches the sauce's own days.
    const { data: sauce } = await supabase
      .from('sauces')
      .select('sealed_shelf_life_days')
      .eq('id', input.sauceId)
      .maybeSingle<{ sealed_shelf_life_days: number }>()

    revalidatePrep()
    return ok({
      madeMl,
      bags,
      sealedExpiry: sealedExpiryFor(input.prepDate, sauce?.sealed_shelf_life_days),
    })
  } catch (error) {
    return fail(error, 'Could not save that.')
  }
}

/**
 * Undoes a completed line — for the "wrong sauce, wrong number" moment.
 *
 * Removes the bags it created as well as the tick, otherwise the stock count
 * would keep phantom volume that nobody can find in the fridge.
 */
export async function undoPrepLine(input: {
  sauceId: string
  prepDate: DateOnly
}): Promise<ActionResult> {
  try {
    const context = await requirePrepAccess()
    const siteId = context.prepSite.id
    const supabase = createServerSupabase()

    // Bags are matched through the session that produced them, not by site:
    // once a delivery has gone out, some of this batch physically sits at
    // another restaurant and would otherwise be missed.
    const { data: session } = await supabase
      .from('prep_sessions')
      .select('id')
      .eq('site_id', siteId)
      .eq('prep_date', input.prepDate)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>()

    if (session) {
      const { data: made } = await supabase
        .from('bags')
        .select('id, status')
        .eq('prep_session_id', session.id)
        .eq('sauce_id', input.sauceId)
        .returns<Array<{ id: string; status: string }>>()

      // Once a bag has been opened or used, the kitchen has physically
      // committed to it and the record must stand.
      if ((made ?? []).some((bag) => bag.status !== 'sealed')) {
        return fail(
          new Error(
            'Some of this batch has already been opened or used, so it cannot be undone. Log a correction on the batch history instead.',
          ),
        )
      }

      if (made && made.length > 0) {
        const { error } = await supabase
          .from('bags')
          .delete()
          .in(
            'id',
            made.map((bag) => bag.id),
          )
        if (error) throw new Error(error.message)
      }
    }

    const { error: lineError } = await supabase
      .from('prep_checklist')
      .update({ completed_at: null, actual_ml: 0 })
      .eq('site_id', siteId)
      .eq('prep_date', input.prepDate)
      .eq('sauce_id', input.sauceId)
    if (lineError) throw new Error(lineError.message)

    revalidatePrep()
    return ok()
  } catch (error) {
    return fail(error, 'Could not undo that.')
  }
}

/** Adds a sauce that wasn't in the plan to today's list. */
export async function addPrepLine(input: {
  sauceId: string
  prepDate: DateOnly
  plannedMl: number
}): Promise<ActionResult> {
  try {
    const context = await requirePrepAccess()

    if (input.plannedMl < 0 || input.plannedMl > MAX_ML) {
      return fail(new Error('Enter between 0 and 100,000 ml.'))
    }

    const supabase = createServerSupabase()
    const { error } = await supabase.from('prep_checklist').upsert(
      {
        site_id: context.prepSite.id,
        prep_date: input.prepDate,
        sauce_id: input.sauceId,
        planned_ml: input.plannedMl,
      },
      { onConflict: 'site_id,prep_date,sauce_id', ignoreDuplicates: false },
    )
    if (error) throw new Error(error.message)

    revalidatePrep()
    return ok()
  } catch (error) {
    return fail(error, 'Could not add that sauce.')
  }
}

/** The prep day the checklist screen should open on. */
export async function resolvePrepDate(): Promise<DateOnly> {
  const context = await requirePrepAccess()
  const now = today()
  return isPrepDay(now, context.prepWeekdays)
    ? now
    : upcomingPrepDay(now, context.prepWeekdays).date
}
