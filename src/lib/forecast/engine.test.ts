import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BUFFER,
  computeWeekdayMultipliers,
  detectWeekdaySpikes,
  explainForecast,
  forecastSauce,
  type ForecastInput,
  type UsageObservation,
} from './engine'
import {
  addDaysTo,
  expiryStatus,
  openedExpiryFor,
  sealedExpiryFor,
  upcomingPrepDay,
  nextPrepDayAfter,
  daysUntilNextPrep,
  weekdayOf,
} from '@/lib/date'

/**
 * Fixed reference dates so nothing here depends on when the suite runs.
 *   2026-08-04 is a Tuesday, 2026-08-07 is a Friday.
 */
const TUESDAY = '2026-08-04'
const FRIDAY = '2026-08-07'

/** Generates `days` of usage ending on `endDate`, `perDayMl` ml each day. */
function steadyUsage(endDate: string, days: number, perDayMl: number): UsageObservation[] {
  return Array.from({ length: days }, (_, index) => ({
    date: addDaysTo(endDate, -(days - 1 - index)),
    ml: perDayMl,
  }))
}

function baseInput(overrides: Partial<ForecastInput> = {}): ForecastInput {
  return {
    sauceId: 'sauce-1',
    sauceName: 'Ranch',
    usage: steadyUsage(TUESDAY, 28, 2000),
    usableStockMl: 0,
    parLevelMl: 0,
    introducedOn: addDaysTo(TUESDAY, -120),
    ...overrides,
  }
}

/* -------------------------------------------------------------------------- */

describe('date rules', () => {
  it('treats Tuesday as a 3-day batch and Friday as a 4-day batch', () => {
    const tuesday = upcomingPrepDay(TUESDAY)
    expect(tuesday.type).toBe('tuesday')
    expect(tuesday.coversDays).toBe(3)
    expect(tuesday.coverageDates).toEqual(['2026-08-04', '2026-08-05', '2026-08-06'])

    const friday = upcomingPrepDay(FRIDAY)
    expect(friday.type).toBe('friday')
    expect(friday.coversDays).toBe(4)
    expect(friday.coverageDates).toEqual([
      '2026-08-07',
      '2026-08-08',
      '2026-08-09',
      '2026-08-10',
    ])
  })

  it('finds the upcoming prep day inclusively but the next one exclusively', () => {
    // Wednesday -> the next prep day is Friday either way.
    expect(upcomingPrepDay('2026-08-05').date).toBe(FRIDAY)
    // On a prep day, "upcoming" is today but "next" is the following one.
    expect(upcomingPrepDay(TUESDAY).date).toBe(TUESDAY)
    expect(nextPrepDayAfter(TUESDAY).date).toBe(FRIDAY)
    // Friday's next restock is the following Tuesday — the 4-day gap.
    expect(nextPrepDayAfter(FRIDAY).date).toBe('2026-08-11')
    expect(daysUntilNextPrep(FRIDAY)).toBe(4)
    expect(daysUntilNextPrep(TUESDAY)).toBe(3)
  })

  it('gives a sealed bag 5 days from its prep date', () => {
    expect(sealedExpiryFor(TUESDAY)).toBe('2026-08-09')
  })

  it('caps an opened bag at 2 days, never beyond the sealed life', () => {
    const sealed = sealedExpiryFor(TUESDAY) // 2026-08-09

    // Opened on prep day: 2 days wins because it is earlier than the cap.
    expect(openedExpiryFor(TUESDAY, sealed)).toBe('2026-08-06')

    // Opened on day 4 of the sealed life: +2 days would be 2026-08-10, past the
    // 5-day cap, so the sealed expiry wins.
    expect(openedExpiryFor('2026-08-08', sealed)).toBe('2026-08-09')

    // Opened exactly 2 days before the cap: both agree.
    expect(openedExpiryFor('2026-08-07', sealed)).toBe('2026-08-09')
  })

  it('colour-codes expiry as red today, amber at 1-2 days, green beyond', () => {
    expect(expiryStatus('2026-08-03', TUESDAY).level).toBe('expired')
    expect(expiryStatus(TUESDAY, TUESDAY).level).toBe('critical')
    expect(expiryStatus('2026-08-05', TUESDAY).level).toBe('warning')
    expect(expiryStatus('2026-08-06', TUESDAY).level).toBe('warning')
    expect(expiryStatus('2026-08-07', TUESDAY).level).toBe('healthy')
  })
})

/* -------------------------------------------------------------------------- */

describe('forecastSauce — normal case', () => {
  it('projects need across the covered days, subtracts stock and adds the buffer', () => {
    const result = forecastSauce(baseInput({ usableStockMl: 1000 }), {
      prepDate: TUESDAY,
      coversDays: 3,
      asOf: TUESDAY,
    })

    // 56000ml over 28 days = 2000ml/day. Flat usage means every multiplier is 1.
    expect(result.reasoning.burnRatePerDay).toBe(2000)
    expect(result.reasoning.observedDays).toBe(28)
    expect(result.reasoning.projectedNeedMl).toBe(6000)

    // (6000 needed - 1000 in stock) * 1.1 = 5500ml.
    expect(result.reasoning.rawSuggestionMl).toBe(5500)
    expect(result.suggestedMl).toBe(5500)
    expect(result.reasoning.method).toBe('history')
    expect(result.reasoning.confidence).toBe('high')
  })

  it('covers 4 days for a Friday batch', () => {
    // Usage must run up to `asOf`, otherwise the tail of the window is empty.
    const result = forecastSauce(baseInput({ usage: steadyUsage(FRIDAY, 28, 2000) }), {
      prepDate: FRIDAY,
      coversDays: 4,
      asOf: FRIDAY,
    })

    expect(result.reasoning.coverageDates).toHaveLength(4)
    expect(result.reasoning.projectedNeedMl).toBe(8000)
    expect(result.suggestedMl).toBe(Math.ceil(8000 * DEFAULT_BUFFER))
  })

  it('never suggests a negative quantity when stock already exceeds demand', () => {
    const result = forecastSauce(baseInput({ usableStockMl: 50_000 }), {
      prepDate: TUESDAY,
      coversDays: 3,
      asOf: TUESDAY,
    })

    expect(result.suggestedMl).toBe(0)
    expect(result.pack.counts).toEqual({})
    expect(result.lowStock).toBe(false)
  })

  it('counts opened stock toward usable stock', () => {
    // 4000ml usable = 2000 sealed + 2000 opened; both are reachable by the kitchen.
    const result = forecastSauce(baseInput({ usableStockMl: 4000 }), {
      prepDate: TUESDAY,
      coversDays: 3,
      asOf: TUESDAY,
    })

    expect(result.reasoning.usableStockMl).toBe(4000)
    // (6000 - 4000) * 1.1 = 2200
    expect(result.suggestedMl).toBe(2200)
  })

  it('packs the suggested volume into the fewest, least-wasteful bags', () => {
    // Real client-scale figures: Hitchin House Mayo Tuesday batch (Tue+Wed+Thu
    // from the client's document: 1000 + 3000 + 2000 = 6000ml/day average).
    const result = forecastSauce(
      baseInput({ usage: steadyUsage(TUESDAY, 28, 2000), usableStockMl: 0, parLevelMl: 0 }),
      { prepDate: TUESDAY, coversDays: 3, asOf: TUESDAY, bufferMultiplier: 1 },
    )

    // 2000ml/day x 3 days = 6000ml needed, no buffer -> suggestedMl = 6000.
    expect(result.suggestedMl).toBe(6000)
    expect(result.pack.counts).toEqual({ 2000: 3 })
    expect(result.pack.wasteMl).toBe(0)
  })
})

/* -------------------------------------------------------------------------- */

describe('forecastSauce — no history fallback', () => {
  it('falls back to the par level and marks the suggestion low-confidence', () => {
    const result = forecastSauce(
      baseInput({ usage: [], parLevelMl: 10_000, usableStockMl: 2000 }),
      { prepDate: TUESDAY, coversDays: 3, asOf: TUESDAY },
    )

    expect(result.reasoning.method).toBe('par_fallback')
    expect(result.reasoning.confidence).toBe('low')
    expect(result.suggestedMl).toBe(8000) // 10000 par - 2000 in stock
    expect(result.reasoning.notes.join(' ')).toMatch(/no usage history/i)
    expect(explainForecast(result)).toMatch(/par level/i)
  })

  it('treats a sauce logged but never used as low-confidence par fallback', () => {
    const result = forecastSauce(
      baseInput({
        usage: steadyUsage(TUESDAY, 28, 0),
        parLevelMl: 6000,
        usableStockMl: 0,
      }),
      { prepDate: TUESDAY, coversDays: 3, asOf: TUESDAY },
    )

    expect(result.reasoning.method).toBe('par_fallback')
    expect(result.reasoning.confidence).toBe('low')
    expect(result.suggestedMl).toBe(6000)
  })

  it('suggests zero when there is neither history nor a par level', () => {
    const result = forecastSauce(baseInput({ usage: [], parLevelMl: 0 }), {
      prepDate: TUESDAY,
      coversDays: 3,
      asOf: TUESDAY,
    })

    expect(result.suggestedMl).toBe(0)
    expect(result.reasoning.confidence).toBe('low')
  })
})

/* -------------------------------------------------------------------------- */

describe('forecastSauce — new sauce, partial window', () => {
  it('divides by days since introduction rather than the full window', () => {
    // Introduced 7 days ago, 21000ml used in total.
    const introducedOn = addDaysTo(TUESDAY, -6)
    const result = forecastSauce(
      baseInput({
        usage: steadyUsage(TUESDAY, 7, 3000),
        introducedOn,
      }),
      { prepDate: TUESDAY, coversDays: 3, asOf: TUESDAY },
    )

    expect(result.reasoning.observedDays).toBe(7)
    // 21000 / 7 = 3000/day, NOT 21000 / 28 = 750/day.
    expect(result.reasoning.burnRatePerDay).toBe(3000)
    expect(result.reasoning.method).toBe('partial_history')
    expect(result.reasoning.confidence).toBe('low')
    expect(result.reasoning.notes.join(' ')).toMatch(/introduced 7 days ago/i)
  })

  it('upgrades confidence to medium once there are two weeks of data', () => {
    const result = forecastSauce(
      baseInput({
        usage: steadyUsage(TUESDAY, 20, 2000),
        introducedOn: addDaysTo(TUESDAY, -19),
      }),
      { prepDate: TUESDAY, coversDays: 3, asOf: TUESDAY },
    )

    expect(result.reasoning.observedDays).toBe(20)
    expect(result.reasoning.confidence).toBe('medium')
  })
})

/* -------------------------------------------------------------------------- */

describe('weekday pattern detection', () => {
  /** 4 weeks where Fridays run at 7000ml and every other day at 2000ml. */
  function fridaySpikeUsage(): UsageObservation[] {
    return Array.from({ length: 28 }, (_, index) => {
      const date = addDaysTo(TUESDAY, -(27 - index))
      return { date, ml: weekdayOf(date) === 5 ? 7000 : 2000 }
    })
  }

  it('derives a multiplier above 1 for the spiking weekday', () => {
    const usage = fridaySpikeUsage()
    const total = usage.reduce((sum, row) => sum + row.ml, 0)
    const burnRate = total / 28

    const multipliers = computeWeekdayMultipliers(usage, burnRate, 28)

    expect(multipliers['5']).toBeGreaterThan(SPIKE_MIN)
    // Non-spiking weekdays sit below the average.
    expect(multipliers['1']).toBeLessThan(1)
  })

  it('flags the repeated Friday spike once there are 4 weeks of data', () => {
    const spikes = detectWeekdaySpikes(fridaySpikeUsage(), { observedDays: 28 })

    expect(spikes).toHaveLength(1)
    expect(spikes[0].weekdayName).toBe('Friday')
    expect(spikes[0].percentAbove).toBeGreaterThan(25)
  })

  it('stays silent with less than 4 weeks of data', () => {
    const usage = fridaySpikeUsage().slice(-14)
    expect(detectWeekdaySpikes(usage, { observedDays: 14 })).toEqual([])
  })

  it('holds every multiplier at 1 when there is too little history to trust', () => {
    const usage = steadyUsage(TUESDAY, 5, 3000)
    const multipliers = computeWeekdayMultipliers(usage, 3000, 5)
    expect(Object.values(multipliers).every((value) => value === 1)).toBe(true)
  })

  it('lets a weekday spike raise the suggestion for a batch covering that day', () => {
    // Friday batch covers Fri/Sat/Sun/Mon, so the Friday spike lands inside it.
    const spiked = forecastSauce(baseInput({ usage: fridaySpikeUsage() }), {
      prepDate: FRIDAY,
      coversDays: 4,
      asOf: FRIDAY,
    })

    const fridayEntry = spiked.reasoning.coverageDates.find((day) => day.weekday === 'Friday')
    expect(fridayEntry?.multiplier).toBeGreaterThan(1)
    expect(fridayEntry?.projected).toBeGreaterThan(spiked.reasoning.burnRatePerDay)
  })
})

const SPIKE_MIN = 1.25

/* -------------------------------------------------------------------------- */

describe('par level floor and low-stock flag', () => {
  it('raises a small suggestion up to the par gap', () => {
    // Burn rate 500ml/day -> ~1500ml needed, but par says keep 10000ml on hand.
    const result = forecastSauce(
      baseInput({ usage: steadyUsage(TUESDAY, 28, 500), parLevelMl: 10_000, usableStockMl: 3000 }),
      { prepDate: TUESDAY, coversDays: 3, asOf: TUESDAY },
    )

    expect(result.reasoning.parFloorApplied).toBe(true)
    expect(result.suggestedMl).toBe(7000) // 10000 target - 3000 in stock
  })

  it('does not lower a suggestion that already exceeds the par gap', () => {
    const result = forecastSauce(
      baseInput({ usage: steadyUsage(TUESDAY, 28, 5000), parLevelMl: 4000, usableStockMl: 0 }),
      { prepDate: TUESDAY, coversDays: 3, asOf: TUESDAY },
    )

    expect(result.reasoning.parFloorApplied).toBe(false)
    expect(result.suggestedMl).toBe(Math.ceil(15_000 * DEFAULT_BUFFER))
  })

  it('flags a sauce that will run out before the next prep day', () => {
    // 2000ml/day, 2000ml in stock, prep is 3 days away.
    const result = forecastSauce(baseInput({ usableStockMl: 2000 }), {
      prepDate: FRIDAY,
      coversDays: 4,
      asOf: '2026-08-04',
    })

    expect(result.lowStock).toBe(true)
    expect(result.reasoning.notes.join(' ')).toMatch(/run out/i)
  })

  it('does not flag low stock when there is enough to reach the prep day', () => {
    const result = forecastSauce(baseInput({ usableStockMl: 20_000 }), {
      prepDate: FRIDAY,
      coversDays: 4,
      asOf: '2026-08-04',
    })

    expect(result.lowStock).toBe(false)
  })
})
