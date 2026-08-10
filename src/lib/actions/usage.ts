'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase/server'
import { requireSession, requireWriteSite } from '@/lib/auth'
import { type DateOnly, today } from '@/lib/date'
import type { OpenStockResult } from '@/lib/types/database'
import { fail, ok, type ActionResult } from './types'

/**
 * Records the volume (ml) used for one sauce on one day.
 *
 * The RPC does two things atomically: adds to the day's usage total, and
 * opens sealed bags (oldest expiry first) until their combined volume covers
 * it, which starts each opened bag's 2-day countdown.
 */
export async function recordUsage(input: {
  sauceId: string
  ml: number
  siteId?: string
  usageDate?: DateOnly
  notes?: string
}): Promise<ActionResult<OpenStockResult>> {
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

    return ok(data as OpenStockResult)
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
