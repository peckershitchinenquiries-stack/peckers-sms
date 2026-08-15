'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase/server'
import { requireSession, requireWriteSite } from '@/lib/auth'
import { type DateOnly, sealedExpiryFor, today } from '@/lib/date'
import { fail, ok, type ActionResult } from './types'

/** Validates a `{ sizeMl: count }` pack and returns its totals. */
function validatePack(pack: Record<number, number>): { totalBags: number; totalMl: number } {
  let totalBags = 0
  let totalMl = 0

  for (const [sizeKey, count] of Object.entries(pack)) {
    const size = Number(sizeKey)
    if (count === 0) continue
    if (!Number.isInteger(count) || count < 0) {
      throw new Error('Bag counts must be whole numbers, zero or more.')
    }
    if (!Number.isFinite(size) || size <= 0) {
      throw new Error(`Unsupported bag size: ${sizeKey}.`)
    }
    totalBags += count
    totalMl += size * count
  }

  if (totalBags < 1 || totalBags > 500) {
    throw new Error('Enter between 1 and 500 bags in total.')
  }

  return { totalBags, totalMl }
}

/**
 * Logs the bags actually produced for one sauce and creates one bag record per
 * physical bag, each with its own 5-day sealed expiry.
 *
 * `pack` is a `{ sizeMl: count }` breakdown — e.g. `{ 2000: 2, 500: 1 }` for
 * 2×2000ml + 1×500ml. Quantities are recorded as *additional* bags, so
 * logging then logging again adds to the total — staff often pack in waves.
 */
export async function logBatch(input: {
  sauceId: string
  siteId?: string
  sessionId?: string | null
  prepDate?: DateOnly
  pack: Record<number, number>
}): Promise<ActionResult<{ created: number; createdMl: number; sealedExpiry: DateOnly }>> {
  try {
    const context = await requireSession()
    const siteId = requireWriteSite(context, input.siteId ?? context.profile.site_id)
    const prepDate = input.prepDate ?? today()
    const { totalBags, totalMl } = validatePack(input.pack)

    const supabase = createServerSupabase()
    const { error } = await supabase.rpc('create_batch_bags', {
      p_site_id: siteId,
      p_sauce_id: input.sauceId,
      p_session_id: input.sessionId ?? null,
      p_prep_date: prepDate,
      p_pack: input.pack,
    })
    if (error) throw new Error(error.message)

    // The trigger is the source of truth for the actual shelf life; this
    // mirrors it so the returned estimate matches the sauce's own days.
    const { data: sauce } = await supabase
      .from('sauces')
      .select('sealed_shelf_life_days')
      .eq('id', input.sauceId)
      .maybeSingle<{ sealed_shelf_life_days: number }>()

    revalidatePath('/batches')
    revalidatePath('/expiry')
    revalidatePath('/prep')
    revalidatePath('/dashboard')
    revalidatePath('/today')

    return ok({
      created: totalBags,
      createdMl: totalMl,
      sealedExpiry: sealedExpiryFor(prepDate, sauce?.sealed_shelf_life_days),
    })
  } catch (error) {
    return fail(error, 'Could not log the batch.')
  }
}

/**
 * Completes the vacuum-pack step and creates the bags in one go — the action
 * behind the big "Pack" button on the prep checklist.
 */
export async function completeVacuumPack(input: {
  checklistId: string
  sessionId: string
  sauceId: string
  siteId: string
  prepDate: DateOnly
  pack: Record<number, number>
}): Promise<ActionResult<{ created: number; createdMl: number }>> {
  try {
    const context = await requireSession()
    const siteId = requireWriteSite(context, input.siteId)
    const { totalBags, totalMl } = validatePack(input.pack)
    const supabase = createServerSupabase()

    const { error: rpcError } = await supabase.rpc('create_batch_bags', {
      p_site_id: siteId,
      p_sauce_id: input.sauceId,
      p_session_id: input.sessionId,
      p_prep_date: input.prepDate,
      p_pack: input.pack,
    })
    if (rpcError) throw new Error(rpcError.message)

    const { error: stepError } = await supabase
      .from('prep_checklist')
      .update({ vacuum_packed_at: new Date().toISOString(), planned_ml: totalMl })
      .eq('id', input.checklistId)
    if (stepError) throw new Error(stepError.message)

    revalidatePath('/prep')
    revalidatePath('/batches')
    revalidatePath('/expiry')
    return ok({ created: totalBags, createdMl: totalMl })
  } catch (error) {
    return fail(error, 'Could not record the vacuum pack.')
  }
}

/** Marks a single bag used or discarded from the expiry tracker. */
export async function setBagStatus(input: {
  bagId: string
  status: 'used' | 'discarded' | 'opened'
  reason?: string
}): Promise<ActionResult> {
  try {
    await requireSession()
    const supabase = createServerSupabase()

    const patch: Record<string, unknown> = { status: input.status }
    if (input.status === 'discarded') patch.discard_reason = input.reason ?? null

    const { error } = await supabase.from('bags').update(patch).eq('id', input.bagId)
    if (error) throw new Error(error.message)

    revalidatePath('/expiry')
    revalidatePath('/today')
    revalidatePath('/dashboard')
    return ok()
  } catch (error) {
    return fail(error, 'Could not update the bag.')
  }
}

/** Bulk version — "discard everything that expired" in one tap. */
export async function setManyBagStatuses(input: {
  bagIds: string[]
  status: 'used' | 'discarded'
  reason?: string
}): Promise<ActionResult<{ updated: number }>> {
  try {
    await requireSession()
    if (input.bagIds.length === 0) return ok({ updated: 0 })

    const supabase = createServerSupabase()
    const patch: Record<string, unknown> = { status: input.status }
    if (input.status === 'discarded') patch.discard_reason = input.reason ?? 'Expired'

    const { error } = await supabase.from('bags').update(patch).in('id', input.bagIds)
    if (error) throw new Error(error.message)

    revalidatePath('/expiry')
    revalidatePath('/today')
    revalidatePath('/dashboard')
    return ok({ updated: input.bagIds.length })
  } catch (error) {
    return fail(error, 'Could not update those bags.')
  }
}

/**
 * Moves sealed bags between sites — the "pull from the other site" action
 * offered on a low-stock alert.
 */
export async function transferBags(input: {
  sauceId: string
  fromSiteId: string
  toSiteId: string
  quantity: number
}): Promise<ActionResult<{ moved: number }>> {
  try {
    const context = await requireSession()
    if (!context.isManager) {
      return fail(new Error('Only a manager can move stock between sites.'))
    }
    if (input.fromSiteId === input.toSiteId) {
      return fail(new Error('Pick two different sites.'))
    }

    const supabase = createServerSupabase()

    // Move the freshest bags — the ones most likely to survive the journey and
    // still be usable at the receiving site.
    const { data: candidates, error: selectError } = await supabase
      .from('bags')
      .select('id')
      .eq('sauce_id', input.sauceId)
      .eq('site_id', input.fromSiteId)
      .eq('status', 'sealed')
      .order('sealed_expiry', { ascending: false })
      .limit(input.quantity)
      .returns<Array<{ id: string }>>()
    if (selectError) throw new Error(selectError.message)

    const ids = (candidates ?? []).map((row) => row.id)
    if (ids.length === 0) {
      return fail(new Error('No sealed bags available to move.'))
    }

    const { error } = await supabase
      .from('bags')
      .update({ site_id: input.toSiteId })
      .in('id', ids)
    if (error) throw new Error(error.message)

    revalidatePath('/expiry')
    revalidatePath('/dashboard')
    revalidatePath('/alerts')
    return ok({ moved: ids.length })
  } catch (error) {
    return fail(error, 'Could not move the stock.')
  }
}
