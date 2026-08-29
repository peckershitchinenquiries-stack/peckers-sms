'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase/server'
import { requireSession, requireWriteSite } from '@/lib/auth'
import { type DateOnly, today } from '@/lib/date'
import type { ConsumeStockResult, UndoUsageLogResult } from '@/lib/types/database'
import { fail, ok, UNDO_WINDOW_MINUTES, type ActionResult } from './types'

/**
 * Records the volume (ml) used for one sauce on one day.
 *
 * The RPC does two things atomically: adds to the day's usage total, and draws
 * that volume out of the bags on the shelf, oldest expiry first. A bag emptied
 * this way is marked used; one part-emptied stays open with its remainder
 * intact, and that remainder is what becomes waste if it expires.
 */
export async function recordUsage(input: {
  sauceId: string
  ml: number
  siteId?: string
  usageDate?: DateOnly
  notes?: string
}): Promise<ActionResult<ConsumeStockResult>> {
  try {
    const context = await requireSession()
    const siteId = requireWriteSite(context, input.siteId ?? context.profile.site_id)

    if (!Number.isInteger(input.ml) || input.ml < 1 || input.ml > 100_000) {
      return fail(new Error('Enter between 1 and 100,000 ml.'))
    }

    const supabase = createServerSupabase()
    const { data, error } = await supabase.rpc('record_usage', {
      p_site_id: siteId,
      p_sauce_id: input.sauceId,
      p_usage_date: input.usageDate ?? today(),
      p_ml: input.ml,
      p_notes: input.notes ?? null,
    })
    if (error) throw new Error(error.message)

    revalidatePath('/usage')
    revalidatePath('/expiry')
    revalidatePath('/today')
    revalidatePath('/dashboard')

    return ok(data as ConsumeStockResult)
  } catch (error) {
    return fail(error, 'Could not log that usage.')
  }
}

/** Corrects a mis-typed figure. Does not re-open or re-seal any bags. */
export async function correctUsageLog(input: {
  usageLogId: string
  ml: number
}): Promise<ActionResult> {
  try {
    const context = await requireSession()
    if (!context.isManager) {
      return fail(new Error('Ask a manager to correct a usage log.'))
    }
    if (!Number.isInteger(input.ml) || input.ml < 0 || input.ml > 200_000) {
      return fail(new Error('Enter between 0 and 200,000 ml.'))
    }

    const supabase = createServerSupabase()
    const { error } = await supabase
      .from('usage_logs')
      .update({ ml_used: input.ml })
      .eq('id', input.usageLogId)
    if (error) throw new Error(error.message)

    revalidatePath('/usage')
    return ok()
  } catch (error) {
    return fail(error, 'Could not correct that log.')
  }
}

/**
 * Reverses a mistaken log: removes it and puts the volume back on the shelf
 * (best effort — see undo_usage_log() for why it can't always be exact).
 *
 * Anyone can undo their own entry within UNDO_WINDOW_MINUTES of logging it —
 * this is for the "hit the wrong sauce" moment, not a general delete.
 * Managers can undo anything, any time, same as correctUsageLog above.
 */
export async function undoUsageLog(input: {
  usageLogId: string
  loggedBy: string | null
  createdAt: string
}): Promise<ActionResult<UndoUsageLogResult>> {
  try {
    const context = await requireSession()

    const isOwnRecentEntry =
      input.loggedBy === context.profile.id &&
      Date.now() - new Date(input.createdAt).getTime() < UNDO_WINDOW_MINUTES * 60_000

    if (!context.isManager && !isOwnRecentEntry) {
      return fail(
        new Error(
          `You can only undo your own entry within ${UNDO_WINDOW_MINUTES} minutes of logging it. Ask a manager to remove older entries.`,
        ),
      )
    }

    const supabase = createServerSupabase()
    const { data, error } = await supabase.rpc('undo_usage_log', {
      p_usage_log_id: input.usageLogId,
    })
    if (error) throw new Error(error.message)

    revalidatePath('/usage')
    revalidatePath('/expiry')
    revalidatePath('/today')
    revalidatePath('/dashboard')

    return ok(data as UndoUsageLogResult)
  } catch (error) {
    return fail(error, 'Could not undo that entry.')
  }
}
