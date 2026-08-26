import 'server-only'

import { createServerSupabase } from '@/lib/supabase/server'
import {
  DEFAULT_PREP_WEEKDAYS,
  type DateOnly,
  type PrepWeekdays,
  today,
  upcomingPrepDay,
} from '@/lib/date'
import { resolveAllocations, type ResolvedAllocation } from '@/lib/forecast/allocation'
import { forecastSauce, type ForecastResult } from '@/lib/forecast/engine'
import { DEFAULT_BAG_SIZES_ML, packVolume, type PackResult } from '@/lib/forecast/packing'
import type {
  ForecastInputRow,
  ForecastReasoning,
  PrepChecklistRow,
  PrepPlan,
  PrepPlanItem,
  PrepSession,
  PrepVsPlanRow,
} from '@/lib/types/database'

/* -------------------------------------------------------------------------- */
/* Forecast                                                                   */
/* -------------------------------------------------------------------------- */

export interface SauceForecast extends ForecastResult {
  parLevelMl: number
  usableStockMl: number
  sealedBags: number
  openedBags: number
}

/**
 * Runs the forecast engine for one site against live database inputs.
 *
 * The SQL side (`forecast_inputs`) only gathers raw numbers; every decision is
 * made in the TypeScript engine so it stays unit-testable and can explain
 * itself in the UI.
 */
export async function buildForecast(options: {
  siteId: string
  prepDate?: DateOnly
  windowDays?: number
  bufferMultiplier?: number
  bagSizesMl?: number[]
  prepWeekdays?: PrepWeekdays
  asOf?: DateOnly
}): Promise<{ prepDate: DateOnly; coversDays: number; forecasts: SauceForecast[] }> {
  const asOf = options.asOf ?? today()
  const prepWeekdays = options.prepWeekdays ?? DEFAULT_PREP_WEEKDAYS
  const prepDay = upcomingPrepDay(options.prepDate ?? asOf, prepWeekdays)

  const supabase = createServerSupabase()
  const windowDays = options.windowDays ?? 28
  const bagSizesMl = options.bagSizesMl ?? DEFAULT_BAG_SIZES_ML

  const { data, error } = await supabase.rpc('forecast_inputs', {
    p_site_id: options.siteId,
    p_window_days: windowDays,
    p_as_of: asOf,
  })
  if (error) throw new Error(`Forecast inputs: ${error.message}`)

  const rows = (data ?? []) as ForecastInputRow[]

  const forecasts = rows.map((row) => {
    const result = forecastSauce(
      {
        sauceId: row.sauce_id,
        sauceName: row.sauce_name,
        usage: (row.usage ?? []).map((entry) => ({ date: entry.date, ml: entry.ml })),
        usableStockMl: Number(row.usable_ml),
        parLevelMl: row.par_level_ml,
        introducedOn: row.introduced_on,
      },
      {
        prepDate: prepDay.date,
        coversDays: prepDay.coversDays,
        asOf,
        windowDays,
        bufferMultiplier: options.bufferMultiplier ?? 1.1,
        bagSizesMl,
      },
    )

    return {
      ...result,
      parLevelMl: row.par_level_ml,
      usableStockMl: Number(row.usable_ml),
      sealedBags: Number(row.sealed_bags),
      openedBags: Number(row.opened_bags),
    } satisfies SauceForecast
  })

  return { prepDate: prepDay.date, coversDays: prepDay.coversDays, forecasts }
}

/**
 * The forecast for every restaurant, combined into one batch.
 *
 * Sauce is cooked once at the prep kitchen and delivered out, so the quantity
 * to make is the sum of what each restaurant needs. The per-site split is kept
 * alongside the total because that is exactly what gets dispatched later.
 */
export interface CombinedForecast {
  sauceId: string
  sauceName: string
  /** Total to make — the sum across restaurants. */
  suggestedMl: number
  /** Per-restaurant demand making up the total. */
  bySite: Array<{ siteId: string; siteName: string; ml: number }>
  /** Stock across every restaurant. */
  usableStockMl: number
  lowStock: boolean
  /** The prep kitchen's own working, shown when a manager asks "why?". */
  reasoning: ForecastReasoning
}

export async function buildCombinedForecast(options: {
  sites: Array<{ id: string; name: string }>
  prepDate: DateOnly
  windowDays?: number
  bufferMultiplier?: number
  bagSizesMl?: number[]
  prepWeekdays?: PrepWeekdays
  asOf?: DateOnly
}): Promise<{ prepDate: DateOnly; coversDays: number; forecasts: CombinedForecast[] }> {
  const results = await Promise.all(
    options.sites.map(async (site) => ({
      site,
      forecast: await buildForecast({ ...options, siteId: site.id }),
    })),
  )

  const first = results[0]?.forecast
  const combined = new Map<string, CombinedForecast>()

  for (const { site, forecast } of results) {
    for (const row of forecast.forecasts) {
      const existing = combined.get(row.sauceId)
      if (existing) {
        existing.suggestedMl += row.suggestedMl
        existing.usableStockMl += row.usableStockMl
        existing.lowStock = existing.lowStock || row.lowStock
        existing.bySite.push({ siteId: site.id, siteName: site.name, ml: row.suggestedMl })
        continue
      }
      combined.set(row.sauceId, {
        sauceId: row.sauceId,
        sauceName: row.sauceName,
        suggestedMl: row.suggestedMl,
        usableStockMl: row.usableStockMl,
        lowStock: row.lowStock,
        bySite: [{ siteId: site.id, siteName: site.name, ml: row.suggestedMl }],
        reasoning: row.reasoning,
      })
    }
  }

  const forecasts = Array.from(combined.values()).map((row) => ({
    ...row,
    reasoning: { ...row.reasoning, siteBreakdown: row.bySite },
  }))

  return {
    prepDate: options.prepDate,
    coversDays: first?.coversDays ?? 1,
    forecasts,
  }
}

/* -------------------------------------------------------------------------- */
/* Plans                                                                      */
/* -------------------------------------------------------------------------- */

export interface PlanItemView {
  id: string
  sauceId: string
  sauceName: string
  suggestedMl: number
  overrideMl: number | null
  /** What the kitchen will actually be told to make. */
  finalMl: number
  /** `finalMl` packed into the fewest, least-wasteful bags. */
  pack: PackResult
  /**
   * How `finalMl` is divided between restaurants, with any manual pins already
   * applied. Always sums to `finalMl` unless every restaurant is pinned.
   */
  allocations: ResolvedAllocation[]
  /** Volume the pins leave unaccounted for. Zero in the normal case. */
  allocationImbalanceMl: number
  reasoning: ForecastReasoning | null
}

export interface PlanView {
  plan: PrepPlan
  items: PlanItemView[]
  totalMl: number
}

export async function getPlan(
  siteId: string,
  prepDate: DateOnly,
  bagSizesMl: number[] = DEFAULT_BAG_SIZES_ML,
): Promise<PlanView | null> {
  const supabase = createServerSupabase()

  const { data: plan } = await supabase
    .from('prep_plans')
    .select('*')
    .eq('site_id', siteId)
    .eq('prep_date', prepDate)
    .maybeSingle<PrepPlan>()

  if (!plan) return null

  const { data: items, error } = await supabase
    .from('prep_plan_items')
    .select(
      '*, sauces(name, sort_order), prep_plan_allocations(site_id, suggested_ml, override_ml)',
    )
    .eq('plan_id', plan.id)
    .returns<
      Array<
        PrepPlanItem & {
          sauces: { name: string; sort_order: number } | null
          prep_plan_allocations: Array<{
            site_id: string
            suggested_ml: number
            override_ml: number | null
          }> | null
        }
      >
    >()
  if (error) throw new Error(`Loading plan items: ${error.message}`)

  const views: PlanItemView[] = (items ?? [])
    .map((item) => {
      const finalMl = item.override_ml ?? item.suggested_ml
      // Resolved here rather than in the client, so the planner screen and the
      // delivery run can never show different numbers for the same plan.
      const split = resolveAllocations(
        finalMl,
        (item.prep_plan_allocations ?? []).map((allocation) => ({
          siteId: allocation.site_id,
          suggestedMl: allocation.suggested_ml,
          overrideMl: allocation.override_ml,
        })),
      )

      return {
        id: item.id,
        sauceId: item.sauce_id,
        sauceName: item.sauces?.name ?? 'Unknown sauce',
        sortOrder: item.sauces?.sort_order ?? 0,
        suggestedMl: item.suggested_ml,
        overrideMl: item.override_ml,
        finalMl,
        pack: packVolume(finalMl, bagSizesMl),
        allocations: split.allocations,
        allocationImbalanceMl: split.imbalanceMl,
        reasoning: (item.reasoning as ForecastReasoning) ?? null,
      }
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.sauceName.localeCompare(b.sauceName))
    .map(({ sortOrder: _sortOrder, ...rest }) => rest)

  return {
    plan,
    items: views,
    totalMl: views.reduce((sum, item) => sum + item.finalMl, 0),
  }
}

export async function getRecentPlans(siteId: string | null, limit = 12): Promise<PrepPlan[]> {
  const supabase = createServerSupabase()
  let query = supabase
    .from('prep_plans')
    .select('*')
    .order('prep_date', { ascending: false })
    .limit(limit)

  if (siteId) query = query.eq('site_id', siteId)

  const { data, error } = await query.returns<PrepPlan[]>()
  if (error) throw new Error(`Loading plans: ${error.message}`)
  return data ?? []
}

/* -------------------------------------------------------------------------- */
/* The prep board                                                             */
/* -------------------------------------------------------------------------- */

/**
 * One line the kitchen works from.
 *
 * Deliberately *derived* from the plan rather than copied into it. The old
 * design seeded a checklist when staff pressed "Start", which meant a plan
 * built afterwards never reached them and a checklist could silently drift
 * from the plan it came from. Here the plan is the source of truth for what to
 * make, and a checklist row only ever records a completion — so the list can
 * never come up empty when a plan exists.
 */
export interface PrepLine {
  sauceId: string
  sauceName: string
  /** What the plan asks for. Zero for a sauce added on the day. */
  plannedMl: number
  /** What was actually made. Zero until the line is completed. */
  actualMl: number
  completedAt: string | null
  /** Null until the line has been touched. */
  checklistId: string | null
  /** True when this sauce wasn't in the plan. */
  unplanned: boolean
  /** Bags produced for this line, this prep day. */
  bagsMade: number
  /** How much of `plannedMl` is each restaurant's demand. */
  allocations: ResolvedAllocation[]
}

export interface PrepBoard {
  prepDate: DateOnly
  coversDays: number
  hasPlan: boolean
  planStatus: PrepPlan['status'] | null
  lines: PrepLine[]
  session: PrepSession | null
  sessionStaffName: string | null
  totalPlannedMl: number
  totalMadeMl: number
  completedCount: number
}

export async function getPrepBoard(options: {
  siteId: string
  prepDate: DateOnly
  coversDays: number
  bagSizesMl?: number[]
}): Promise<PrepBoard> {
  const supabase = createServerSupabase()
  const { siteId, prepDate } = options

  // The session is resolved first because bags are counted through it: once
  // stock is dispatched its `site_id` becomes the receiving restaurant, so
  // counting "bags made here" by site would quietly drop after a delivery.
  const { data: session } = await supabase
    .from('prep_sessions')
    .select('*, profiles(full_name)')
    .eq('site_id', siteId)
    .eq('prep_date', prepDate)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle<PrepSession & { profiles: { full_name: string } | null }>()

  const [plan, checklistResult, bagsResult] = await Promise.all([
    getPlan(siteId, prepDate, options.bagSizesMl),
    supabase
      .from('prep_checklist')
      .select('*, sauces(name, sort_order)')
      .eq('site_id', siteId)
      .eq('prep_date', prepDate)
      .returns<
        Array<PrepChecklistRow & { sauces: { name: string; sort_order: number } | null }>
      >(),
    session
      ? supabase
          .from('bags')
          .select('sauce_id')
          .eq('prep_session_id', session.id)
          .returns<Array<{ sauce_id: string }>>()
      : Promise.resolve({ data: [] as Array<{ sauce_id: string }> }),
  ])

  const checklist = checklistResult.data ?? []
  const bySauce = new Map(checklist.map((row) => [row.sauce_id, row]))

  const bagCounts = new Map<string, number>()
  for (const bag of bagsResult.data ?? []) {
    bagCounts.set(bag.sauce_id, (bagCounts.get(bag.sauce_id) ?? 0) + 1)
  }

  const lines: PrepLine[] = []
  const seen = new Set<string>()

  // Everything the plan asks for, in plan order.
  for (const item of plan?.items ?? []) {
    if (item.finalMl <= 0) continue
    const entry = bySauce.get(item.sauceId)
    seen.add(item.sauceId)
    lines.push({
      sauceId: item.sauceId,
      sauceName: item.sauceName,
      plannedMl: item.finalMl,
      actualMl: entry?.actual_ml ?? 0,
      completedAt: entry?.completed_at ?? null,
      checklistId: entry?.id ?? null,
      unplanned: false,
      bagsMade: bagCounts.get(item.sauceId) ?? 0,
      allocations: item.allocations,
    })
  }

  // Then anything made on the day that wasn't planned.
  const extras = checklist
    .filter((row) => !seen.has(row.sauce_id))
    .map((row) => ({
      sauceId: row.sauce_id,
      sauceName: row.sauces?.name ?? 'Unknown sauce',
      sortOrder: row.sauces?.sort_order ?? 0,
      plannedMl: row.planned_ml,
      actualMl: row.actual_ml,
      completedAt: row.completed_at,
      checklistId: row.id,
      unplanned: true,
      bagsMade: bagCounts.get(row.sauce_id) ?? 0,
      allocations: [] as ResolvedAllocation[],
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.sauceName.localeCompare(b.sauceName))
    .map(({ sortOrder: _sortOrder, ...rest }) => rest)

  lines.push(...extras)

  return {
    prepDate,
    coversDays: options.coversDays,
    hasPlan: Boolean(plan),
    planStatus: plan?.plan.status ?? null,
    lines,
    session: session ?? null,
    sessionStaffName: session?.profiles?.full_name ?? null,
    totalPlannedMl: lines.reduce((sum, line) => sum + line.plannedMl, 0),
    totalMadeMl: lines.reduce((sum, line) => sum + line.actualMl, 0),
    completedCount: lines.filter((line) => line.completedAt).length,
  }
}

export type { PrepSession }

/* -------------------------------------------------------------------------- */
/* Prep vs plan                                                               */
/* -------------------------------------------------------------------------- */

export async function getPrepVsPlan(options: {
  siteId: string | null
  from?: DateOnly
  to?: DateOnly
}): Promise<PrepVsPlanRow[]> {
  const supabase = createServerSupabase()
  let query = supabase
    .from('prep_vs_plan')
    .select('*')
    .order('prep_date', { ascending: false })
    .order('sauce_name')

  if (options.siteId) query = query.eq('site_id', options.siteId)
  if (options.from) query = query.gte('prep_date', options.from)
  if (options.to) query = query.lte('prep_date', options.to)

  const { data, error } = await query.returns<PrepVsPlanRow[]>()
  if (error) throw new Error(`Loading prep vs plan: ${error.message}`)
  return data ?? []
}
