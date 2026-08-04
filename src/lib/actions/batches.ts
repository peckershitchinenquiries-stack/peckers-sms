'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase/server'
import { requireSession, requireWriteSite } from '@/lib/auth'
import { type DateOnly, sealedExpiryFor, today } from '@/lib/date'
import { fail, ok, type ActionResult } from './types'

/**
 * Logs the bags actually produced for one sauce and creates one bag record per
 * physical bag, each with its own 5-day sealed expiry.
 *
 * Quantities are recorded as *additional* bags, so logging 6 then 4 gives 10 —
 * staff often pack in waves.
 */
export async function logBatch(input: {
  sauceId: string
  siteId?: string
  sessionId?: string | null
  prepDate?: DateOnly
  quantity: number
}): Promise<ActionResult<{ created: number; sealedExpiry: DateOnly }>> {
  try {
    const context = await requireSession()
    const siteId = requireWriteSite(context, input.siteId ?? context.profile.site_id)
    const prepDate = input.prepDate ?? today()

    if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 500) {
      return fail(new Error('Enter between 1 and 500 bags.'))
    }

    const supabase = createServerSupabase()
    const { error } = await supabase.rpc('create_batch_bags', {
      p_site_id: siteId,
      p_sauce_id: input.sauceId,
      p_session_id: input.sessionId ?? null,
      p_prep_date: prepDate,
      p_quantity: input.quantity,
    })
    if (error) throw new Error(error.message)

    revalidatePath('/batches')
    revalidatePath('/expiry')
    revalidatePath('/prep')
    revalidatePath('/dashboard')
    revalidatePath('/today')

    return ok({ created: input.quantity, sealedExpiry: sealedExpiryFor(prepDate) })
  } catch (error) {
    return fail(error, 'Could not log the batch.')
  }
}

/**
 * Completes the vacuum-pack step and creates the bags in one go — the action
 * behind the big "Pack N bags" button on the prep checklist.
 */
export async function completeVacuumPack(input: {
  checklistId: string
  sessionId: string
  sauceId: string
  siteId: string
  prepDate: DateOnly
  quantity: number
}): Promise<ActionResult<{ created: number }>> {
  try {
    const context = await requireSession()
    const siteId = requireWriteSite(context, input.siteId)
    const supabase = createServerSupabase()

    const { error: rpcError } = await supabase.rpc('create_batch_bags', {
      p_site_id: siteId,
      p_sauce_id: input.sauceId,
      p_session_id: input.sessionId,
      p_prep_date: input.prepDate,
      p_quantity: input.quantity,
    })
    if (rpcError) throw new Error(rpcError.message)

    const { error: stepError } = await supabase
      .from('prep_checklist')
      .update({ vacuum_packed_at: new Date().toISOString(), planned_bags: input.quantity })
      .eq('id', input.checklistId)
    if (stepError) throw new Error(stepError.message)

    revalidatePath('/prep')
    revalidatePath('/batches')
    revalidatePath('/expiry')
    return ok({ created: input.quantity })
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
