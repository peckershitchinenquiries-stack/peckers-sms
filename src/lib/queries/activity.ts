import 'server-only'

import { createServerSupabase } from '@/lib/supabase/server'
import { type DateOnly, addDaysTo, today } from '@/lib/date'
import type { Alert, Bag, OvertimeRow, UsageLog } from '@/lib/types/database'

/* -------------------------------------------------------------------------- */
/* Usage                                                                      */
/* -------------------------------------------------------------------------- */

export interface UsageEntry extends UsageLog {
  sauceName: string
  siteName: string
  loggedByName: string | null
}

export async function getUsageLogs(options: {
  siteId: string | null
  from?: DateOnly
  to?: DateOnly
  sauceId?: string | null
  limit?: number
}): Promise<UsageEntry[]> {
  const supabase = createServerSupabase()
  let query = supabase
    .from('usage_logs')
    .select('*, sauces(name), sites(name), profiles(full_name)')
    .order('usage_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 500)

  if (options.siteId) query = query.eq('site_id', options.siteId)
  if (options.sauceId) query = query.eq('sauce_id', options.sauceId)
  if (options.from) query = query.gte('usage_date', options.from)
  if (options.to) query = query.lte('usage_date', options.to)

  const { data, error } = await query.returns<
    Array<
      UsageLog & {
        sauces: { name: string } | null
        sites: { name: string } | null
        profiles: { full_name: string } | null
      }
    >
  >()
  if (error) throw new Error(`Loading usage logs: ${error.message}`)

  return (data ?? []).map(({ sauces, sites, profiles, ...row }) => ({
    ...row,
    sauceName: sauces?.name ?? 'Unknown sauce',
    siteName: sites?.name ?? 'Unknown site',
    loggedByName: profiles?.full_name ?? null,
  }))
}

/** Today's logged usage keyed by sauce, for the "already logged" indicator. */
export async function getUsageForDate(
  siteId: string,
  date: DateOnly = today(),
): Promise<Map<string, number>> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('usage_logs')
    .select('sauce_id, bags_opened')
    .eq('site_id', siteId)
    .eq('usage_date', date)
    .returns<Array<{ sauce_id: string; bags_opened: number }>>()
  if (error) throw new Error(`Loading today's usage: ${error.message}`)

  return new Map((data ?? []).map((row) => [row.sauce_id, row.bags_opened]))
}

/** Daily totals across a window — powers the usage sparkline. */
export async function getDailyUsageTotals(
  siteId: string | null,
  windowDays = 14,
): Promise<Array<{ date: DateOnly; bags: number }>> {
  const supabase = createServerSupabase()
  const asOf = today()
  const from = addDaysTo(asOf, -(windowDays - 1))

  let query = supabase
    .from('usage_logs')
    .select('usage_date, bags_opened')
    .gte('usage_date', from)
    .lte('usage_date', asOf)

  if (siteId) query = query.eq('site_id', siteId)

  const { data, error } = await query.returns<
    Array<{ usage_date: string; bags_opened: number }>
  >()
  if (error) throw new Error(`Loading usage totals: ${error.message}`)

  const totals = new Map<string, number>()
  for (let offset = 0; offset < windowDays; offset += 1) {
    totals.set(addDaysTo(from, offset), 0)
  }
  for (const row of data ?? []) {
    totals.set(row.usage_date, (totals.get(row.usage_date) ?? 0) + row.bags_opened)
  }

  return Array.from(totals.entries()).map(([date, bags]) => ({ date, bags }))
}

/* -------------------------------------------------------------------------- */
/* Batches                                                                    */
/* -------------------------------------------------------------------------- */

export interface BatchRow {
  sauceId: string
  sauceName: string
  siteId: string
  siteName: string
  bagSize: '1L' | '2L'
  prepDate: DateOnly
  sessionId: string | null
  totalBags: number
  sealed: number
  opened: number
  used: number
  discarded: number
  sealedExpiry: DateOnly
}

/**
 * Batch history grouped by sauce / site / prep date.
 *
 * Bags are stored individually (one row per physical bag) but nobody wants to
 * read 400 rows — this rolls them up into the batches they were made in.
 */
export async function getBatchHistory(options: {
  siteId: string | null
  sauceId?: string | null
  from?: DateOnly
  to?: DateOnly
  limit?: number
}): Promise<BatchRow[]> {
  const supabase = createServerSupabase()
  let query = supabase
    .from('bags')
    .select(
      'id, sauce_id, site_id, bag_size, prep_date, sealed_expiry, status, prep_session_id, sauces(name), sites(name)',
    )
    .order('prep_date', { ascending: false })
    .limit(options.limit ?? 4000)

  if (options.siteId) query = query.eq('site_id', options.siteId)
  if (options.sauceId) query = query.eq('sauce_id', options.sauceId)
  if (options.from) query = query.gte('prep_date', options.from)
  if (options.to) query = query.lte('prep_date', options.to)

  const { data, error } = await query.returns<
    Array<
      Pick<
        Bag,
        | 'id'
        | 'sauce_id'
        | 'site_id'
        | 'bag_size'
        | 'prep_date'
        | 'sealed_expiry'
        | 'status'
        | 'prep_session_id'
      > & { sauces: { name: string } | null; sites: { name: string } | null }
    >
  >()
  if (error) throw new Error(`Loading batch history: ${error.message}`)

  const grouped = new Map<string, BatchRow>()

  for (const bag of data ?? []) {
    const key = `${bag.prep_date}:${bag.site_id}:${bag.sauce_id}`
    let row = grouped.get(key)

    if (!row) {
      row = {
        sauceId: bag.sauce_id,
        sauceName: bag.sauces?.name ?? 'Unknown sauce',
        siteId: bag.site_id,
        siteName: bag.sites?.name ?? 'Unknown site',
        bagSize: bag.bag_size,
        prepDate: bag.prep_date,
        sessionId: bag.prep_session_id,
        totalBags: 0,
        sealed: 0,
        opened: 0,
        used: 0,
        discarded: 0,
        sealedExpiry: bag.sealed_expiry,
      }
      grouped.set(key, row)
    }

    row.totalBags += 1
    if (bag.status === 'sealed') row.sealed += 1
    else if (bag.status === 'opened') row.opened += 1
    else if (bag.status === 'used') row.used += 1
    else row.discarded += 1
  }

  return Array.from(grouped.values()).sort((a, b) =>
    a.prepDate === b.prepDate
      ? a.sauceName.localeCompare(b.sauceName)
      : a.prepDate < b.prepDate
        ? 1
        : -1,
  )
}

/* -------------------------------------------------------------------------- */
/* Alerts                                                                     */
/* -------------------------------------------------------------------------- */

export interface AlertView extends Alert {
  sauceName: string | null
  siteName: string | null
}

export async function getAlerts(options: {
  siteId: string | null
  includeResolved?: boolean
  limit?: number
}): Promise<AlertView[]> {
  const supabase = createServerSupabase()
  let query = supabase
    .from('alerts')
    .select('*, sauces(name), sites(name)')
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 100)

  if (options.siteId) query = query.eq('site_id', options.siteId)
  if (!options.includeResolved) query = query.eq('resolved', false)

  const { data, error } = await query.returns<
    Array<Alert & { sauces: { name: string } | null; sites: { name: string } | null }>
  >()
  if (error) throw new Error(`Loading alerts: ${error.message}`)

  return (data ?? []).map(({ sauces, sites, ...alert }) => ({
    ...alert,
    sauceName: sauces?.name ?? null,
    siteName: sites?.name ?? null,
  }))
}

/* -------------------------------------------------------------------------- */
/* Overtime                                                                   */
/* -------------------------------------------------------------------------- */

export async function getOvertime(options: {
  siteId: string | null
  staffId?: string | null
  from?: DateOnly
  to?: DateOnly
}): Promise<OvertimeRow[]> {
  const supabase = createServerSupabase()
  let query = supabase
    .from('overtime_logs')
    .select('*')
    .order('prep_date', { ascending: false })

  if (options.siteId) query = query.eq('site_id', options.siteId)
  if (options.staffId) query = query.eq('staff_id', options.staffId)
  if (options.from) query = query.gte('prep_date', options.from)
  if (options.to) query = query.lte('prep_date', options.to)

  const { data, error } = await query.returns<OvertimeRow[]>()
  if (error) throw new Error(`Loading overtime: ${error.message}`)
  return data ?? []
}

export interface OvertimeSummary {
  staffId: string
  staffName: string
  siteName: string
  month: string
  sessions: number
  hours: number
}

/** Monthly totals per staff member, newest month first. */
export function summariseOvertime(rows: OvertimeRow[]): OvertimeSummary[] {
  const grouped = new Map<string, OvertimeSummary>()

  for (const row of rows) {
    const key = `${row.staff_id}:${row.month}`
    let summary = grouped.get(key)
    if (!summary) {
      summary = {
        staffId: row.staff_id,
        staffName: row.staff_name,
        siteName: row.site_name,
        month: row.month,
        sessions: 0,
        hours: 0,
      }
      grouped.set(key, summary)
    }
    summary.sessions += 1
    summary.hours = Math.round((summary.hours + Number(row.hours_worked)) * 100) / 100
  }

  return Array.from(grouped.values()).sort(
    (a, b) => b.month.localeCompare(a.month) || a.staffName.localeCompare(b.staffName),
  )
}
