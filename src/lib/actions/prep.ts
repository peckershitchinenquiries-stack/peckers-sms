'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase/server'
import { requireSession, requireWriteSite } from '@/lib/auth'
import { type DateOnly, isPrepDay, today, upcomingPrepDay } from '@/lib/date'
import type { PrepStepColumn } from '@/lib/constants/catalogue'
import { fail, ok, type ActionResult } from './types'

/**
 * Starts (or resumes) a prep session and seeds its checklist from the plan.
 *
 * `started_at` is the clock-in for overtime, so this must be pressed when prep
 * actually begins rather than back-filled later.
 */
export async function startPrepSession(input: {
  siteId?: string
  prepDate?: DateOnly
}): Promise<ActionResult<{ sessionId: string }>> {
  try {
    const context = await requireSession()
    const siteId = requireWriteSite(context, input.siteId ?? context.profile.site_id)
    const prepDate = input.prepDate ?? today()

    if (!isPrepDay(prepDate)) {
      return fail(new Error('Prep sessions run on Tuesdays and Fridays.'))
    }

    const supabase = createServerSupabase()

    // Resume rather than duplicate if someone already clocked in today.
    const { data: existing } = await supabase
      .from('prep_sessions')
      .select('id')
      .eq('site_id', siteId)
      .eq('prep_date', prepDate)
      .maybeSingle<{ id: string }>()

    if (existing) {
      return ok({ sessionId: existing.id })
    }

    const { data: plan } = await supabase
      .from('prep_plans')
      .select('id')
      .eq('site_id', siteId)
      .eq('prep_date', prepDate)
      .maybeSingle<{ id: string }>()

    const { data: session, error } = await supabase
      .from('prep_sessions')
      .insert({
        site_id: siteId,
        plan_id: plan?.id ?? null,
        staff_id: context.profile.id,
        prep_date: prepDate,
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(error.message)

    // Seed the checklist from the plan so staff see quantities immediately.
    if (plan) {
      const { data: items } = await supabase
        .from('prep_plan_items')
        .select('sauce_id, suggested_bags, override_bags')
        .eq('plan_id', plan.id)
        .returns<
          Array<{ sauce_id: string; suggested_bags: number; override_bags: number | null }>
        >()

      const rows = (items ?? [])
        .map((item) => ({
          session_id: session.id,
          sauce_id: item.sauce_id,
          planned_bags: item.override_bags ?? item.suggested_bags,
        }))
        .filter((row) => row.planned_bags > 0)

      if (rows.length > 0) {
        const { error: checklistError } = await supabase.from('prep_checklist').insert(rows)
        if (checklistError) throw new Error(checklistError.message)
      }
    }

    revalidatePath('/prep')
    revalidatePath('/overtime')
    return ok({ sessionId: session.id })
  } catch (error) {
    return fail(error, 'Could not start the prep session.')
  }
}

/** Clocks out — this is what turns the session into an overtime record. */
export async function endPrepSession(sessionId: string): Promise<ActionResult> {
  try {
    await requireSession()
    const supabase = createServerSupabase()

    const { error } = await supabase
      .from('prep_sessions')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', sessionId)
      .is('ended_at', null)
    if (error) throw new Error(error.message)

    revalidatePath('/prep')
    revalidatePath('/overtime')
    return ok()
  } catch (error) {
    return fail(error, 'Could not end the session.')
  }
}

/**
 * Ticks or unticks one of the three prep steps.
 *
 * Blast chill is the interesting one: its timestamp is what the 1.5 hour
 * countdown is derived from, so it survives refreshes and device handovers.
 */
export async function setChecklistStep(input: {
  checklistId: string
  step: PrepStepColumn
  done: boolean
}): Promise<ActionResult<{ timestamp: string | null }>> {
  try {
    await requireSession()
    const supabase = createServerSupabase()

    const timestamp = input.done ? new Date().toISOString() : null

    const { error } = await supabase
      .from('prep_checklist')
      .update({ [input.step]: timestamp })
      .eq('id', input.checklistId)
    if (error) throw new Error(error.message)

    revalidatePath('/prep')
    return ok({ timestamp })
  } catch (error) {
    return fail(error, 'Could not update the checklist.')
  }
}

/** Adjusts the planned quantity for one sauce mid-session. */
export async function setChecklistQuantity(input: {
  checklistId: string
  plannedBags: number
}): Promise<ActionResult> {
  try {
    await requireSession()

    if (input.plannedBags < 0 || input.plannedBags > 999) {
      return fail(new Error('Enter between 0 and 999 bags.'))
    }

    const supabase = createServerSupabase()
    const { error } = await supabase
      .from('prep_checklist')
      .update({ planned_bags: input.plannedBags })
      .eq('id', input.checklistId)
    if (error) throw new Error(error.message)

    revalidatePath('/prep')
    return ok()
  } catch (error) {
    return fail(error, 'Could not update the quantity.')
  }
}

/** Adds a sauce to an in-progress session that wasn't in the plan. */
export async function addChecklistSauce(input: {
  sessionId: string
  sauceId: string
  plannedBags: number
}): Promise<ActionResult> {
  try {
    await requireSession()
    const supabase = createServerSupabase()

    const { error } = await supabase.from('prep_checklist').upsert(
      {
        session_id: input.sessionId,
        sauce_id: input.sauceId,
        planned_bags: input.plannedBags,
      },
      { onConflict: 'session_id,sauce_id' },
    )
    if (error) throw new Error(error.message)

    revalidatePath('/prep')
    return ok()
  } catch (error) {
    return fail(error, 'Could not add that sauce.')
  }
}

/** The prep day the checklist screen should open on. */
export async function resolvePrepDate(): Promise<DateOnly> {
  const now = today()
  return isPrepDay(now) ? now : upcomingPrepDay(now).date
}
