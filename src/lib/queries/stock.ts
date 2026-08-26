import 'server-only'

import { createServerSupabase } from '@/lib/supabase/server'
import {
  type DateOnly,
  type ExpiryLevel,
  addDaysTo,
  daysBetween,
  expiryStatus,
  today,
} from '@/lib/date'
import type { BagStatus, LiveStockRow } from '@/lib/types/database'

/** Live stock per sauce per site. `siteId = null` returns every store. */
export async function getLiveStock(siteId: string | null): Promise<LiveStockRow[]> {
  const supabase = createServerSupabase()
  let query = supabase
    .from('live_stock')
    .select(
      'sauce_id, site_id, sauce_name, site_name, par_level_ml, sealed_bags, opened_bags, usable_bags, sealed_ml, opened_ml, usable_ml, expiring_today, expiring_soon',
    )
    .order('sauce_name')

  if (siteId) query = query.eq('site_id', siteId)

  const { data, error } = await query.returns<LiveStockRow[]>()
  if (error) throw new Error(`Loading live stock: ${error.message}`)
  return data ?? []
}

export interface TrackedBag {
  id: string
  sauceId: string
  sauceName: string
  siteId: string
  siteName: string
  sizeMl: number
  /** How much is actually left in the bag — what gets binned if it expires. */
  remainingMl: number
  prepDate: DateOnly
  status: BagStatus
  sealedExpiry: DateOnly
  openedAt: string | null
  openedExpiry: DateOnly | null
  effectiveExpiry: DateOnly
  daysRemaining: number
  level: ExpiryLevel
  label: string
}

interface BagJoinRow {
  id: string
  sauce_id: string
  site_id: string
  size_ml: number
  remaining_ml: number
  prep_date: string
  status: BagStatus
  sealed_expiry: string
  opened_at: string | null
  opened_expiry: string | null
  used_at: string | null
  discarded_at: string | null
  sauces: { name: string } | null
  sites: { name: string } | null
}

export interface BagQueryOptions {
  siteId: string | null
  /** Defaults to live stock only (sealed + opened). */
  statuses?: BagStatus[]
  sauceId?: string | null
  /** Only bags expiring on or before this date. */
  expiringBy?: DateOnly | null
  prepDate?: DateOnly | null
  limit?: number
}

/**
 * Bags with their effective expiry and semantic status resolved.
 *
 * The expiry level is computed in TypeScript rather than SQL so that "today"
 * always means today in the business timezone, whatever the database server
 * thinks the date is.
 */
export async function getTrackedBags(options: BagQueryOptions): Promise<TrackedBag[]> {
  const {
    siteId,
    statuses = ['sealed', 'opened'],
    sauceId,
    expiringBy,
    prepDate,
    limit = 2000,
  } = options

  const supabase = createServerSupabase()
  let query = supabase
    .from('bags')
    .select(
      'id, sauce_id, site_id, size_ml, remaining_ml, prep_date, status, sealed_expiry, opened_at, opened_expiry, used_at, discarded_at, sauces(name), sites(name)',
    )
    .in('status', statuses)
    .order('prep_date', { ascending: false })
    .limit(limit)

  if (siteId) query = query.eq('site_id', siteId)
  if (sauceId) query = query.eq('sauce_id', sauceId)
  if (prepDate) query = query.eq('prep_date', prepDate)
  // Push the expiry cutoff into SQL so "use it today" style queries don't
  // have to pull every live bag just to throw most of them away in JS.
  if (expiringBy) {
    query = query.or(
      `and(opened_expiry.not.is.null,opened_expiry.lte.${expiringBy}),and(opened_expiry.is.null,sealed_expiry.lte.${expiringBy})`,
    )
  }

  const { data, error } = await query.returns<BagJoinRow[]>()
  if (error) throw new Error(`Loading bags: ${error.message}`)

  const asOf = today()

  const bags = (data ?? []).map((row) => {
    const effectiveExpiry = row.opened_expiry ?? row.sealed_expiry
    const status = expiryStatus(effectiveExpiry, asOf)

    return {
      id: row.id,
      sauceId: row.sauce_id,
      sauceName: row.sauces?.name ?? 'Unknown sauce',
      siteId: row.site_id,
      siteName: row.sites?.name ?? 'Unknown site',
      sizeMl: row.size_ml,
      remainingMl: row.remaining_ml,
      prepDate: row.prep_date,
      status: row.status,
      sealedExpiry: row.sealed_expiry,
      openedAt: row.opened_at,
      openedExpiry: row.opened_expiry,
      effectiveExpiry,
      daysRemaining: status.daysRemaining,
      level: status.level,
      label: status.label,
    } satisfies TrackedBag
  })

  const filtered = expiringBy
    ? bags.filter((bag) => daysBetween(bag.effectiveExpiry, expiringBy) >= 0)
    : bags

  // Soonest to expire first — that's the order the kitchen should work in.
  return filtered.sort((a, b) => a.daysRemaining - b.daysRemaining)
}

export interface ExpirySummary {
  expired: number
  today: number
  soon: number
  healthy: number
  total: number
}

export function summariseExpiry(bags: TrackedBag[]): ExpirySummary {
  return bags.reduce<ExpirySummary>(
    (summary, bag) => {
      summary.total += 1
      if (bag.level === 'expired') summary.expired += 1
      else if (bag.level === 'critical') summary.today += 1
      else if (bag.level === 'warning') summary.soon += 1
      else summary.healthy += 1
      return summary
    },
    { expired: 0, today: 0, soon: 0, healthy: 0, total: 0 },
  )
}

/** Bags that need attention today — the "use it up" list for kitchen staff. */
export async function getUseTodayBags(siteId: string | null): Promise<TrackedBag[]> {
  const bags = await getTrackedBags({ siteId, expiringBy: addDaysTo(today(), 2) })
  return bags.filter((bag) => bag.daysRemaining <= 2)
}

/** Rolling daily burn rate (ml/day) per sauce, for the dashboard and alerts. */
export async function getBurnRates(
  siteId: string | null,
  windowDays = 28,
): Promise<Map<string, number>> {
  const supabase = createServerSupabase()
  const asOf = today()

  let query = supabase
    .from('usage_logs')
    .select('sauce_id, ml_used, usage_date')
    .gte('usage_date', addDaysTo(asOf, -(windowDays - 1)))
    .lte('usage_date', asOf)

  if (siteId) query = query.eq('site_id', siteId)

  const { data, error } = await query.returns<
    Array<{ sauce_id: string; ml_used: number; usage_date: string }>
  >()
  if (error) throw new Error(`Loading burn rates: ${error.message}`)

  const totals = new Map<string, number>()
  for (const row of data ?? []) {
    totals.set(row.sauce_id, (totals.get(row.sauce_id) ?? 0) + row.ml_used)
  }

  const rates = new Map<string, number>()
  totals.forEach((total, sauceId) => {
    rates.set(sauceId, Math.round((total / windowDays) * 100) / 100)
  })
  return rates
}
