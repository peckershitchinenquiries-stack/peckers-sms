'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase/server'
import { requirePrepAccess } from '@/lib/auth'
import { type DateOnly, today } from '@/lib/date'
import type { TransferStockResult } from '@/lib/types/database'
import { fail, ok, type ActionResult } from './types'

function revalidateDispatch(): void {
  revalidatePath('/dispatch')
  revalidatePath('/expiry')
  revalidatePath('/usage')
  revalidatePath('/dashboard')
  revalidatePath('/today')
}

/**
 * Sends sauce from the prep kitchen to another restaurant.
 *
 * Whole sealed bags move — sauce is never decanted — so the volume actually
 * sent may land slightly above the amount asked for. That overshoot is real
 * stock at the receiving end, not waste, and the result reports it honestly.
 */
export async function sendStock(input: {
  sauceId: string
  toSiteId: string
  ml: number
  date?: DateOnly
}): Promise<ActionResult<TransferStockResult>> {
  try {
    const context = await requirePrepAccess()
    const fromSiteId = context.prepSite.id

    if (input.toSiteId === fromSiteId) {
      return fail(new Error('That sauce is already at the prep kitchen.'))
    }
    if (!context.sites.some((site) => site.id === input.toSiteId)) {
      return fail(new Error('You do not have access to that restaurant.'))
    }
    if (!Number.isFinite(input.ml) || input.ml <= 0) {
      return fail(new Error('Enter how much to send.'))
    }

    const supabase = createServerSupabase()
    const { data, error } = await supabase.rpc('transfer_stock', {
      p_sauce_id: input.sauceId,
      p_from_site: fromSiteId,
      p_to_site: input.toSiteId,
      p_ml: Math.round(input.ml),
      p_date: input.date ?? today(),
    })
    if (error) throw new Error(error.message)

    const result = data as TransferStockResult

    if (result.moved_bags === 0) {
      return fail(new Error('There is no sealed stock of that sauce left to send.'))
    }

    revalidateDispatch()
    return ok(result)
  } catch (error) {
    return fail(error, 'Could not send that stock.')
  }
}

/** Sends everything still outstanding in one go — the whole delivery run. */
export async function sendAllStock(input: {
  toSiteId: string
  lines: Array<{ sauceId: string; ml: number }>
  date?: DateOnly
}): Promise<ActionResult<{ sauces: number; movedMl: number; shortfalls: number }>> {
  try {
    const context = await requirePrepAccess()
    const fromSiteId = context.prepSite.id

    if (input.toSiteId === fromSiteId) {
      return fail(new Error('Pick a different restaurant.'))
    }
    if (!context.sites.some((site) => site.id === input.toSiteId)) {
      return fail(new Error('You do not have access to that restaurant.'))
    }

    const pending = input.lines.filter((line) => line.ml > 0)
    if (pending.length === 0) return fail(new Error('Nothing left to send.'))

    const supabase = createServerSupabase()
    const date = input.date ?? today()

    let sauces = 0
    let movedMl = 0
    let shortfalls = 0

    // Sequential rather than parallel: each call locks bag rows, and running
    // them at once against the same shelf invites needless lock contention.
    for (const line of pending) {
      const { data, error } = await supabase.rpc('transfer_stock', {
        p_sauce_id: line.sauceId,
        p_from_site: fromSiteId,
        p_to_site: input.toSiteId,
        p_ml: Math.round(line.ml),
        p_date: date,
      })
      if (error) throw new Error(error.message)

      const result = data as TransferStockResult
      if (result.moved_bags > 0) {
        sauces += 1
        movedMl += result.moved_ml
      }
      if (result.shortfall_ml > 0) shortfalls += 1
    }

    revalidateDispatch()
    return ok({ sauces, movedMl, shortfalls })
  } catch (error) {
    return fail(error, 'Could not send the delivery.')
  }
}
