import 'server-only'

import { createServerSupabase } from '@/lib/supabase/server'
import { addDaysTo, type DateOnly, today } from '@/lib/date'

/** One day's waste, for the trend line. */
export interface WasteDay {
  date: DateOnly
  ml: number
}

/** One sauce's waste over the window — the "what is costing us" list. */
export interface WasteBySauce {
  sauceId: string
  sauceName: string
  ml: number
  /** How much of it was swept up as expired rather than binned deliberately. */
  expiredMl: number
  entries: number
}

export interface WasteSummary {
  from: DateOnly
  to: DateOnly
  /** Waste recorded today, in the business timezone. */
  todayMl: number
  /** Waste over the last 7 days, today included. */
  weekMl: number
  /** Waste across the whole requested window. */
  totalMl: number
  byDay: WasteDay[]
  bySauce: WasteBySauce[]
}

/**
 * What has been thrown away, and which sauces it was.
 *
 * The client's question is a money question — "if even one litre goes into
 * waste it is a huge money" — so everything here is volume, never bag counts.
 * A 2L bag binned with 200ml left in it is 200ml of waste, not one bag.
 */
export async function getWasteSummary(options: {
  siteId: string | null
  from?: DateOnly
  to?: DateOnly
}): Promise<WasteSummary> {
  const asOf = options.to ?? today()
  const from = options.from ?? addDaysTo(asOf, -27)

  const supabase = createServerSupabase()
  let query = supabase
    .from('waste_logs')
    .select('sauce_id, waste_date, ml, source, sauces(name)')
    .gte('waste_date', from)
    .lte('waste_date', asOf)
    .order('waste_date', { ascending: false })
    .limit(5000)

  if (options.siteId) query = query.eq('site_id', options.siteId)

  const { data, error } = await query.returns<
    Array<{
      sauce_id: string
      waste_date: DateOnly
      ml: number
      source: 'expired' | 'manual'
      sauces: { name: string } | null
    }>
  >()
  if (error) throw new Error(`Loading waste: ${error.message}`)

  const rows = data ?? []
  const weekStart = addDaysTo(asOf, -6)

  const byDay = new Map<DateOnly, number>()
  const bySauce = new Map<string, WasteBySauce>()
  let todayMl = 0
  let weekMl = 0
  let totalMl = 0

  for (const row of rows) {
    totalMl += row.ml
    if (row.waste_date === asOf) todayMl += row.ml
    if (row.waste_date >= weekStart) weekMl += row.ml

    byDay.set(row.waste_date, (byDay.get(row.waste_date) ?? 0) + row.ml)

    let sauce = bySauce.get(row.sauce_id)
    if (!sauce) {
      sauce = {
        sauceId: row.sauce_id,
        sauceName: row.sauces?.name ?? 'Unknown sauce',
        ml: 0,
        expiredMl: 0,
        entries: 0,
      }
      bySauce.set(row.sauce_id, sauce)
    }
    sauce.ml += row.ml
    if (row.source === 'expired') sauce.expiredMl += row.ml
    sauce.entries += 1
  }

  return {
    from,
    to: asOf,
    todayMl,
    weekMl,
    totalMl,
    byDay: Array.from(byDay.entries())
      .map(([date, ml]) => ({ date, ml }))
      .sort((a, b) => (a.date < b.date ? -1 : 1)),
    // Worst first — the point of the screen is to show what to fix.
    bySauce: Array.from(bySauce.values()).sort((a, b) => b.ml - a.ml),
  }
}

/**
 * Waste as a share of what was made over the same window.
 *
 * Reported separately from the summary because it needs the batch side of the
 * story too, and most callers only want one or the other.
 */
export async function getWasteRate(options: {
  siteId: string | null
  from: DateOnly
  to: DateOnly
}): Promise<{ wastedMl: number; preparedMl: number; percent: number }> {
  const supabase = createServerSupabase()

  let bagsQuery = supabase
    .from('bags')
    .select('size_ml')
    .gte('prep_date', options.from)
    .lte('prep_date', options.to)
    .limit(20_000)
  if (options.siteId) bagsQuery = bagsQuery.eq('site_id', options.siteId)

  const [summary, bagsResult] = await Promise.all([
    getWasteSummary(options),
    bagsQuery.returns<Array<{ size_ml: number }>>(),
  ])

  if (bagsResult.error) throw new Error(`Loading batches: ${bagsResult.error.message}`)

  const preparedMl = (bagsResult.data ?? []).reduce((sum, bag) => sum + bag.size_ml, 0)
  const wastedMl = summary.totalMl

  return {
    wastedMl,
    preparedMl,
    percent: preparedMl > 0 ? Math.round((wastedMl / preparedMl) * 1000) / 10 : 0,
  }
}
