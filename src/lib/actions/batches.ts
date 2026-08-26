'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase/server'
import { requireSession, requireWriteSite } from '@/lib/auth'
import { type DateOnly, sealedExpiryFor, today } from '@/lib/date'
import type { ExpireStockResult, TransferStockResult } from '@/lib/types/database'
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
 * Writes off everything past its shelf life.
 *
 * The kitchen's rule is that a batch is used until its last day and whatever
 * is left that night goes in the bin, so this is the software equivalent of
 * the Saturday-night chuck. Each bag's leftover volume lands in `waste_logs`
 * via a database trigger, which is what the dashboard's waste figures read.
 *
 * Runs nightly from the digest cron, and on demand from the expiry tracker
 * for anyone who'd rather not wait.
 */
export async function sweepExpiredStock(input: { siteId?: string | null } = {}): Promise<
  ActionResult<ExpireStockResult>
> {
  try {
    const context = await requireSession()
    // Staff sweep their own restaurant; a manager may sweep one or all.
    const siteId = context.isManager ? (input.siteId ?? null) : context.profile.site_id

    const supabase = createServerSupabase()
    const { data, error } = await supabase.rpc('expire_stock', {
      p_as_of: today(),
      p_site_id: siteId,
    })
    if (error) throw new Error(error.message)

    revalidatePath('/expiry')
    revalidatePath('/waste')
    revalidatePath('/today')
    revalidatePath('/dashboard')
    revalidatePath('/batches')
    return ok(data as ExpireStockResult)
  } catch (error) {
    return fail(error, 'Could not write off the expired stock.')
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

    // The alert asks in bags, but stock moves by volume, so price the request
    // first: the freshest N sealed bags — exactly the ones `transfer_stock`
    // will pick, since it orders the same way.
    const { data: candidates, error: selectError } = await supabase
      .from('bags')
      .select('remaining_ml')
      .eq('sauce_id', input.sauceId)
      .eq('site_id', input.fromSiteId)
      .eq('status', 'sealed')
      .gt('remaining_ml', 0)
      .order('sealed_expiry', { ascending: false })
      .order('prep_date', { ascending: false })
      .limit(input.quantity)
      .returns<Array<{ remaining_ml: number }>>()
    if (selectError) throw new Error(selectError.message)

    const ml = (candidates ?? []).reduce((sum, bag) => sum + bag.remaining_ml, 0)
    if (ml === 0) {
      return fail(new Error('No sealed bags available to move.'))
    }

    // Through the RPC rather than a bare `update bags set site_id`, so the move
    // is written to `stock_transfers` and shows up in the delivery history and
    // in "sent today" on the dashboard.
    const { data, error } = await supabase.rpc('transfer_stock', {
      p_sauce_id: input.sauceId,
      p_from_site: input.fromSiteId,
      p_to_site: input.toSiteId,
      p_ml: ml,
      p_date: today(),
    })
    if (error) throw new Error(error.message)

    const result = data as TransferStockResult

    revalidatePath('/expiry')
    revalidatePath('/dashboard')
    revalidatePath('/alerts')
    revalidatePath('/dispatch', 'layout')
    return ok({ moved: result.moved_bags })
  } catch (error) {
    return fail(error, 'Could not move the stock.')
  }
}
