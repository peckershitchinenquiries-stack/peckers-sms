import 'server-only'

import { createServerSupabase } from '@/lib/supabase/server'
import { type DateOnly, today, upcomingPrepDay } from '@/lib/date'
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
  asOf?: DateOnly
}): Promise<{ prepDate: DateOnly; coversDays: 3 | 4; forecasts: SauceForecast[] }> {
  const asOf = options.asOf ?? today()
  const prepDay = options.prepDate
    ? upcomingPrepDay(options.prepDate)
    : upcomingPrepDay(asOf)

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
    .select('*, sauces(name, sort_order)')
    .eq('plan_id', plan.id)
    .returns<Array<PrepPlanItem & { sauces: { name: string; sort_order: number } | null }>>()
  if (error) throw new Error(`Loading plan items: ${error.message}`)

  const views: PlanItemView[] = (items ?? [])
    .map((item) => {
      const finalMl = item.override_ml ?? item.suggested_ml
      return {
        id: item.id,
        sauceId: item.sauce_id,
        sauceName: item.sauces?.name ?? 'Unknown sauce',
        sortOrder: item.sauces?.sort_order ?? 0,
        suggestedMl: item.suggested_ml,
        overrideMl: item.override_ml,
        finalMl,
        pack: packVolume(finalMl, bagSizesMl),
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
/* Sessions & checklist                                                       */
/* -------------------------------------------------------------------------- */

export interface ChecklistEntry extends PrepChecklistRow {
  sauceName: string
  /** Bags already created from this checklist line, this session. */
  bagsCreated: number
  /** Total ml those bags hold. */
  mlCreated: number
}

export interface SessionView {
  session: PrepSession
  staffName: string
  siteName: string
  entries: ChecklistEntry[]
}

export async function getSessionForDate(
  siteId: string,
  prepDate: DateOnly,
): Promise<SessionView | null> {
  const supabase = createServerSupabase()

  const { data: session } = await supabase
    .from('prep_sessions')
    .select('*, profiles(full_name), sites(name)')
    .eq('site_id', siteId)
    .eq('prep_date', prepDate)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle<
      PrepSession & { profiles: { full_name: string } | null; sites: { name: string } | null }
    >()

  if (!session) return null

  const [{ data: entries }, { data: bags }] = await Promise.all([
    supabase
      .from('prep_checklist')
      .select('*, sauces(name, sort_order)')
      .eq('session_id', session.id)
      .returns<
        Array<PrepChecklistRow & { sauces: { name: string; sort_order: number } | null }>
      >(),
    supabase
      .from('bags')
      .select('sauce_id, size_ml')
      .eq('prep_session_id', session.id)
      .returns<Array<{ sauce_id: string; size_ml: number }>>(),
  ])

  const bagCounts = new Map<string, number>()
  const bagMl = new Map<string, number>()
  for (const bag of bags ?? []) {
    bagCounts.set(bag.sauce_id, (bagCounts.get(bag.sauce_id) ?? 0) + 1)
    bagMl.set(bag.sauce_id, (bagMl.get(bag.sauce_id) ?? 0) + bag.size_ml)
  }

  const list: ChecklistEntry[] = (entries ?? [])
    .map((entry) => ({
      ...entry,
      sauceName: entry.sauces?.name ?? 'Unknown sauce',
      sortOrder: entry.sauces?.sort_order ?? 0,
      bagsCreated: bagCounts.get(entry.sauce_id) ?? 0,
      mlCreated: bagMl.get(entry.sauce_id) ?? 0,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.sauceName.localeCompare(b.sauceName))
    .map(({ sortOrder: _sortOrder, sauces: _sauces, ...rest }) => rest)

  return {
    session,
    staffName: session.profiles?.full_name ?? 'Unknown',
    siteName: session.sites?.name ?? 'Unknown site',
    entries: list,
  }
}

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
