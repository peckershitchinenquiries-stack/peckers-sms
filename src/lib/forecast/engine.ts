import {
  type DateOnly,
  WEEKDAY_NAMES,
  addDaysTo,
  daysBetween,
  weekdayOf,
} from '@/lib/date'
import type { ForecastReasoning } from '@/lib/types/database'
import { DEFAULT_BAG_SIZES_ML, packVolume, type PackResult } from './packing'

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface UsageObservation {
  date: DateOnly
  /** Volume used that day, in ml. */
  ml: number
}

export interface ForecastInput {
  sauceId: string
  sauceName: string
  /** Usage rows inside the rolling window. Missing days count as zero. */
  usage: UsageObservation[]
  /** Sealed + opened stock not yet used or discarded, in ml. */
  usableStockMl: number
  /** Manager-configured target stock, in ml. Acts as a floor when set. */
  parLevelMl: number
  /** When the sauce was added — a new sauce isn't averaged over a full window. */
  introducedOn: DateOnly
}

export interface ForecastOptions {
  /** The prep day being planned for. */
  prepDate: DateOnly
  /** 3 for a Tuesday batch, 4 for a Friday batch. */
  coversDays: number
  /** Today, in the app timezone. Defaults to the prep date. */
  asOf?: DateOnly
  /** Rolling analysis window. Default 28 days (4 weeks). */
  windowDays?: number
  /** Safety buffer. Default 1.1 (+10%). */
  bufferMultiplier?: number
  /** Bag sizes (ml) available for packing. Default 300/500/1000/2000. */
  bagSizesMl?: number[]
}

export interface ForecastResult {
  sauceId: string
  sauceName: string
  suggestedMl: number
  /** The suggested volume packed into the fewest, least-wasteful bags. */
  pack: PackResult
  /** True when the sauce will run dry before the next restock. */
  lowStock: boolean
  reasoning: ForecastReasoning
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

export const DEFAULT_WINDOW_DAYS = 28
export const DEFAULT_BUFFER = 1.1

/** Below this many observed days we don't trust a weekday pattern. */
const MIN_DAYS_FOR_WEEKDAY_PATTERN = 14

/** A weekday needs at least this many samples before it can shift the forecast. */
const MIN_SAMPLES_PER_WEEKDAY = 2

/** Multipliers are clamped so one freak Saturday can't double a batch. */
const MULTIPLIER_MIN = 0.5
const MULTIPLIER_MAX = 2

/** A weekday is flagged as a "spike" once it runs this far above average. */
export const SPIKE_THRESHOLD = 1.25

/* -------------------------------------------------------------------------- */
/* Engine                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Transparent, explainable forecast for one sauce at one site.
 *
 * The method, in order:
 *   1. Take the rolling window of usage (default 28 days).
 *   2. Average daily burn rate = total ml used ÷ days observed.
 *   3. Derive a day-of-week multiplier per weekday.
 *   4. Read current usable stock (sealed + opened), in ml.
 *   5. Work out which days this batch has to cover (3 for Tue, 4 for Fri).
 *   6. Projected need = Σ (burn rate × that day's multiplier).
 *   7. Suggested = ceil((projected need − usable stock) × buffer), floored at
 *      the par level where the manager has set one.
 *   8. Pack the suggested volume into the fewest, least-wasteful bags.
 *
 * Everything it used is returned in `reasoning` so the UI can show its working.
 */
export function forecastSauce(input: ForecastInput, options: ForecastOptions): ForecastResult {
  const {
    prepDate,
    coversDays,
    asOf = prepDate,
    windowDays = DEFAULT_WINDOW_DAYS,
    bufferMultiplier = DEFAULT_BUFFER,
    bagSizesMl = DEFAULT_BAG_SIZES_ML,
  } = options

  const notes: string[] = []
  const windowStart = addDaysTo(asOf, -(windowDays - 1))

  // --- 1. Usage inside the window -----------------------------------------
  const inWindow = input.usage.filter(
    (row) => daysBetween(windowStart, row.date) >= 0 && daysBetween(row.date, asOf) >= 0,
  )
  const totalMlUsed = inWindow.reduce((sum, row) => sum + row.ml, 0)

  // --- 2. Observed days ----------------------------------------------------
  // A sauce introduced mid-window is only divided by the days it has existed,
  // otherwise its burn rate is silently halved.
  const daysSinceIntroduced = daysBetween(input.introducedOn, asOf) + 1
  const observedDays = Math.max(1, Math.min(windowDays, daysSinceIntroduced))
  const isPartialWindow = daysSinceIntroduced < windowDays

  if (isPartialWindow) {
    notes.push(
      `Sauce introduced ${daysSinceIntroduced} day${daysSinceIntroduced === 1 ? '' : 's'} ago — averaged over that period, not a full ${windowDays} days.`,
    )
  }

  const burnRatePerDay = round2(totalMlUsed / observedDays)

  // --- 3. Weekday pattern --------------------------------------------------
  const weekdayMultipliers = computeWeekdayMultipliers(inWindow, burnRatePerDay, observedDays)

  // --- 4/5. Coverage -------------------------------------------------------
  const coverageDates = Array.from({ length: coversDays }, (_, offset) => {
    const date = addDaysTo(prepDate, offset)
    const weekday = weekdayOf(date)
    const multiplier = weekdayMultipliers[String(weekday)] ?? 1
    return {
      date,
      weekday: WEEKDAY_NAMES[weekday],
      multiplier: round2(multiplier),
      projected: round2(burnRatePerDay * multiplier),
    }
  })

  // --- 6. Projected need -----------------------------------------------------
  const projectedNeedMl = round2(
    coverageDates.reduce((sum, day) => sum + day.projected, 0),
  )

  // --- 7. Suggestion -------------------------------------------------------
  const hasHistory = totalMlUsed > 0
  let method: ForecastReasoning['method'] = 'history'
  let confidence: ForecastReasoning['confidence'] = 'high'
  let rawSuggestionMl: number

  if (!hasHistory) {
    // No usage at all in the window — the par level is the only signal we have.
    method = 'par_fallback'
    confidence = 'low'
    rawSuggestionMl = Math.max(0, input.parLevelMl - input.usableStockMl)
    notes.push(
      input.usage.length === 0
        ? 'No usage history yet — suggestion is based on the par level.'
        : 'No usage recorded in the window — suggestion is based on the par level. Low confidence.',
    )
  } else {
    const deficit = Math.max(0, projectedNeedMl - input.usableStockMl)
    rawSuggestionMl = deficit * bufferMultiplier

    if (isPartialWindow) {
      method = 'partial_history'
      confidence = daysSinceIntroduced >= MIN_DAYS_FOR_WEEKDAY_PATTERN ? 'medium' : 'low'
    } else if (observedDays < MIN_DAYS_FOR_WEEKDAY_PATTERN) {
      confidence = 'medium'
    }
  }

  let suggestedMl = Math.max(0, Math.ceil(rawSuggestionMl))

  // Par level acts as a floor on total stock, not on the batch size: if there
  // is already 8000ml and par is 10000ml, the floor contributes 2000ml, not
  // 10000ml.
  const parGapMl = Math.max(0, input.parLevelMl - input.usableStockMl)
  const parFloorApplied = input.parLevelMl > 0 && parGapMl > suggestedMl

  if (parFloorApplied) {
    notes.push(
      `Raised to the par level: ${input.parLevelMl}ml target − ${input.usableStockMl}ml in stock = ${parGapMl}ml.`,
    )
    suggestedMl = parGapMl
  }

  // --- 8. Pack into bags -----------------------------------------------------
  const pack = packVolume(suggestedMl, bagSizesMl)

  // --- Low stock flag ------------------------------------------------------
  // Will this sauce run out before the next restock?
  const daysUntilRestock = Math.max(0, daysBetween(asOf, prepDate))
  const lowStock =
    hasHistory && input.usableStockMl < burnRatePerDay * daysUntilRestock && daysUntilRestock > 0

  if (lowStock) {
    notes.push(
      `Projected to run out before ${prepDate}: ${input.usableStockMl}ml in stock vs ${round2(
        burnRatePerDay * daysUntilRestock,
      )}ml of expected demand.`,
    )
  }

  return {
    sauceId: input.sauceId,
    sauceName: input.sauceName,
    suggestedMl,
    pack,
    lowStock,
    reasoning: {
      method,
      confidence,
      burnRatePerDay,
      observedDays,
      totalMlUsed,
      weekdayMultipliers: Object.fromEntries(
        Object.entries(weekdayMultipliers).map(([key, value]) => [key, round2(value)]),
      ),
      coverageDates,
      projectedNeedMl,
      usableStockMl: input.usableStockMl,
      bufferMultiplier,
      parLevelMl: input.parLevelMl,
      parFloorApplied,
      rawSuggestionMl: round2(rawSuggestionMl),
      suggestedMl,
      pack,
      notes,
    },
  }
}

/** Runs the forecast across a whole site. */
export function forecastSite(
  inputs: ForecastInput[],
  options: ForecastOptions,
): ForecastResult[] {
  return inputs.map((input) => forecastSauce(input, options))
}

/* -------------------------------------------------------------------------- */
/* Weekday pattern                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Multiplier per weekday, relative to the overall daily average.
 *
 * "Fridays use ~40% more Ranch than average" becomes `{ "5": 1.4 }`. Weekdays
 * without enough samples stay at 1 so a single busy Saturday can't distort a
 * whole batch, and every multiplier is clamped to [0.5, 2].
 */
export function computeWeekdayMultipliers(
  usage: UsageObservation[],
  burnRatePerDay: number,
  observedDays: number,
): Record<string, number> {
  const multipliers: Record<string, number> = {}
  for (let weekday = 0; weekday < 7; weekday += 1) multipliers[String(weekday)] = 1

  if (burnRatePerDay <= 0 || observedDays < MIN_DAYS_FOR_WEEKDAY_PATTERN) {
    return multipliers
  }

  // Bucket by weekday. Days with no usage row are genuine zeros, so count the
  // calendar occurrences rather than only the rows we happen to have.
  const totals: Record<number, number> = {}
  const observedDates = new Set<string>()

  for (const row of usage) {
    const weekday = weekdayOf(row.date)
    totals[weekday] = (totals[weekday] ?? 0) + row.ml
    observedDates.add(row.date)
  }

  const occurrences = countWeekdayOccurrences(usage, observedDays)

  for (let weekday = 0; weekday < 7; weekday += 1) {
    const count = occurrences[weekday] ?? 0
    if (count < MIN_SAMPLES_PER_WEEKDAY) continue

    const averageForWeekday = (totals[weekday] ?? 0) / count
    const multiplier = averageForWeekday / burnRatePerDay
    multipliers[String(weekday)] = clamp(multiplier, MULTIPLIER_MIN, MULTIPLIER_MAX)
  }

  return multipliers
}

/**
 * How many times each weekday fell inside the observation window.
 *
 * Derived from the span of dates we actually have, so an unlogged Sunday still
 * counts as a zero-usage Sunday rather than vanishing from the denominator.
 */
function countWeekdayOccurrences(
  usage: UsageObservation[],
  observedDays: number,
): Record<number, number> {
  const counts: Record<number, number> = {}
  if (usage.length === 0) return counts

  const sorted = [...usage].sort((a, b) => (a.date < b.date ? -1 : 1))
  const latest = sorted[sorted.length - 1].date

  for (let offset = 0; offset < observedDays; offset += 1) {
    const weekday = weekdayOf(addDaysTo(latest, -offset))
    counts[weekday] = (counts[weekday] ?? 0) + 1
  }

  return counts
}

/* -------------------------------------------------------------------------- */
/* Pattern detection                                                          */
/* -------------------------------------------------------------------------- */

export interface WeekdaySpike {
  weekday: number
  weekdayName: string
  multiplier: number
  /** e.g. 40 for "40% above average". */
  percentAbove: number
}

/**
 * Flags sauces that repeatedly spike on the same weekday.
 *
 * Requires a full 4 weeks of history — with less than that a "pattern" is
 * usually just noise, and telling a manager otherwise erodes trust in the
 * whole alerting system.
 */
export function detectWeekdaySpikes(
  usage: UsageObservation[],
  options: { observedDays: number; minObservedDays?: number } = { observedDays: 0 },
): WeekdaySpike[] {
  const { observedDays, minObservedDays = DEFAULT_WINDOW_DAYS } = options

  if (observedDays < minObservedDays || usage.length === 0) return []

  const total = usage.reduce((sum, row) => sum + row.ml, 0)
  if (total === 0) return []

  const burnRate = total / observedDays
  const multipliers = computeWeekdayMultipliers(usage, burnRate, observedDays)

  return Object.entries(multipliers)
    .filter(([, multiplier]) => multiplier >= SPIKE_THRESHOLD)
    .map(([weekday, multiplier]) => ({
      weekday: Number(weekday),
      weekdayName: WEEKDAY_NAMES[Number(weekday)],
      multiplier: round2(multiplier),
      percentAbove: Math.round((multiplier - 1) * 100),
    }))
    .sort((a, b) => b.multiplier - a.multiplier)
}

/* -------------------------------------------------------------------------- */
/* Human-readable explanation                                                 */
/* -------------------------------------------------------------------------- */

/** One-sentence summary of why a number was suggested. */
export function explainForecast(result: ForecastResult): string {
  const { reasoning } = result

  if (reasoning.method === 'par_fallback') {
    return `Based on the par level of ${reasoning.parLevelMl}ml (not enough usage data yet).`
  }

  const days = reasoning.coverageDates.length
  const packSummary = Object.entries(reasoning.pack.counts)
    .map(([size, count]) => `${count}×${size}ml`)
    .join(' + ')

  return (
    `${reasoning.burnRatePerDay}ml/day over ${reasoning.observedDays} days ` +
    `× ${days} day${days === 1 ? '' : 's'} of cover = ${reasoning.projectedNeedMl}ml needed, ` +
    `less ${reasoning.usableStockMl}ml in stock, ` +
    `+${Math.round((reasoning.bufferMultiplier - 1) * 100)}% buffer → ${reasoning.suggestedMl}ml` +
    (packSummary ? ` → ${packSummary}.` : '.')
  )
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
