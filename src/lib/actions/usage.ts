'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase/server'
import { requireSession, requireWriteSite } from '@/lib/auth'
import { type DateOnly, today } from '@/lib/date'
import type { OpenBagsResult } from '@/lib/types/database'
import { fail, ok, type ActionResult } from './types'

/**
 * Records the bags opened for one sauce on one day.
 *
 * The RPC does two things atomically: adds to the day's usage total, and flips
 * that many sealed bags to `opened` (oldest expiry first), which starts each
 * bag's 2-day opened countdown.
 */
export async function recordUsage(input: {
  sauceId: string
  bags: number
  siteId?: string
  usageDate?: DateOnly
  notes?: string
}): Promise<ActionResult<OpenBagsResult>> {
  try {
    const context = await requireSession()
    const siteId = requireWriteSite(context, input.siteId ?? context.profile.site_id)

    if (!Number.isInteger(input.bags) || input.bags < 1 || input.bags > 200) {
      return fail(new Error('Enter between 1 and 200 bags.'))
    }

    const supabase = createServerSupabase()
    const { data, error } = await supabase.rpc('record_usage', {
      p_site_id: siteId,
      p_sauce_id: input.sauceId,
      p_usage_date: input.usageDate ?? today(),
      p_bags: input.bags,
      p_notes: input.notes ?? null,
    })
    if (error) throw new Error(error.message)

    revalidatePath('/usage')
    revalidatePath('/expiry')
    revalidatePath('/today')
    revalidatePath('/dashboard')

    return ok(data as OpenBagsResult)
  } catch (error) {
    return fail(error, 'Could not log that usage.')
  }
}

/** Corrects a mis-typed figure. Does not re-open or re-seal any bags. */
export async function correctUsageLog(input: {
  usageLogId: string
  bags: number
}): Promise<ActionResult> {
  try {
    const context = await requireSession()
    if (!context.isManager) {
      return fail(new Error('Ask a manager to correct a usage log.'))
    }
    if (!Number.isInteger(input.bags) || input.bags < 0 || input.bags > 500) {
      return fail(new Error('Enter between 0 and 500 bags.'))
    }

    const supabase = createServerSupabase()
    const { error } = await supabase
      .from('usage_logs')
      .update({ bags_opened: input.bags })
      .eq('id', input.usageLogId)
    if (error) throw new Error(error.message)

    revalidatePath('/usage')
    return ok()
  } catch (error) {
    return fail(error, 'Could not correct that log.')
  }
}
