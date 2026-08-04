'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase/server'
import { requireManager, requireSession } from '@/lib/auth'
import { runAlertScan } from '@/lib/alerts/engine'
import { fail, ok, type ActionResult } from './types'

/** Runs the low-stock, expiry and pattern scans on demand. */
export async function scanForAlerts(): Promise<
  ActionResult<{ created: number; skipped: number }>
> {
  try {
    const context = await requireManager()
    const supabase = createServerSupabase()

    const report = await runAlertScan(supabase, {
      sites: context.sites.map((site) => ({ id: site.id, name: site.name })),
      windowDays: context.settings.forecast_window_days,
    })

    revalidatePath('/alerts')
    revalidatePath('/dashboard')
    return ok({ created: report.created, skipped: report.skipped })
  } catch (error) {
    return fail(error, 'Could not run the alert scan.')
  }
}

export async function resolveAlert(alertId: string): Promise<ActionResult> {
  try {
    await requireSession()
    const supabase = createServerSupabase()

    const { error } = await supabase.rpc('resolve_alert', { p_alert_id: alertId })
    if (error) throw new Error(error.message)

    revalidatePath('/alerts')
    revalidatePath('/dashboard')
    return ok()
  } catch (error) {
    return fail(error, 'Could not resolve that alert.')
  }
}

export async function resolveAllAlerts(siteId: string | null): Promise<ActionResult> {
  try {
    await requireManager()
    const supabase = createServerSupabase()

    let query = supabase
      .from('alerts')
      .update({ resolved: true, resolved_at: new Date().toISOString() })
      .eq('resolved', false)

    if (siteId) query = query.eq('site_id', siteId)

    const { error } = await query
    if (error) throw new Error(error.message)

    revalidatePath('/alerts')
    revalidatePath('/dashboard')
    return ok()
  } catch (error) {
    return fail(error, 'Could not clear the alerts.')
  }
}
