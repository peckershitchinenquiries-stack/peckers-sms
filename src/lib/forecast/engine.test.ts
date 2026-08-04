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

/** Generates `days` of usage ending on `endDate`, `perDay` bags each day. */
function steadyUsage(endDate: string, days: number, perDay: number): UsageObservation[] {
  return Array.from({ length: days }, (_, index) => ({
    date: addDaysTo(endDate, -(days - 1 - index)),
    bags: perDay,
  }))
}

function baseInput(overrides: Partial<ForecastInput> = {}): ForecastInput {
  return {
    sauceId: 'sauce-1',
    sauceName: 'Ranch',
    usage: steadyUsage(TUESDAY, 28, 2),
    usableStock: 0,
    parLevel: 0,
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
    const result = forecastSauce(baseInput({ usableStock: 1 }), {
      prepDate: TUESDAY,
      coversDays: 3,
      asOf: TUESDAY,
    })

    // 56 bags over 28 days = 2/day. Flat usage means every multiplier is 1.
    expect(result.reasoning.burnRatePerDay).toBe(2)
    expect(result.reasoning.observedDays).toBe(28)
    expect(result.reasoning.projectedNeed).toBe(6)

    // (6 needed - 1 in stock) * 1.1 = 5.5 -> 6 bags.
    expect(result.reasoning.rawSuggestion).toBe(5.5)
    expect(result.suggestedBags).toBe(6)
    expect(result.reasoning.method).toBe('history')
    expect(result.reasoning.confidence).toBe('high')
  })

  it('covers 4 days for a Friday batch', () => {
    // Usage must run up to `asOf`, otherwise the tail of the window is empty.
    const result = forecastSauce(baseInput({ usage: steadyUsage(FRIDAY, 28, 2) }), {
      prepDate: FRIDAY,
      coversDays: 4,
      asOf: FRIDAY,
    })

    expect(result.reasoning.coverageDates).toHaveLength(4)
    expect(result.reasoning.projectedNeed).toBe(8)
    expect(result.suggestedBags).toBe(Math.ceil(8 * DEFAULT_BUFFER))
  })

  it('never suggests a negative quantity when stock already exceeds demand', () => {
    const result = forecastSauce(baseInput({ usableStock: 50 }), {
      prepDate: TUESDAY,
      coversDays: 3,
      asOf: TUESDAY,
    })

    expect(result.suggestedBags).toBe(0)
    expect(result.lowStock).toBe(false)
  })

  it('counts opened bags toward usable stock', () => {
    // 4 usable = 2 sealed + 2 opened; both are reachable by the kitchen.
    const result = forecastSauce(baseInput({ usableStock: 4 }), {
      prepDate: TUESDAY,
      coversDays: 3,
      asOf: TUESDAY,
    })

    expect(result.reasoning.usableStock).toBe(4)
    // (6 - 4) * 1.1 = 2.2 -> 3
    expect(result.suggestedBags).toBe(3)
  })
})

/* -------------------------------------------------------------------------- */

describe('forecastSauce — no history fallback', () => {
  it('falls back to the par level and marks the suggestion low-confidence', () => {
    const result = forecastSauce(
      baseInput({ usage: [], parLevel: 10, usableStock: 2 }),
      { prepDate: TUESDAY, coversDays: 3, asOf: TUESDAY },
    )

    expect(result.reasoning.method).toBe('par_fallback')
    expect(result.reasoning.confidence).toBe('low')
    expect(result.suggestedBags).toBe(8) // par 10 - 2 in stock
    expect(result.reasoning.notes.join(' ')).toMatch(/no usage history/i)
    expect(explainForecast(result)).toMatch(/par level/i)
  })

  it('treats a sauce logged but never used as low-confidence par fallback', () => {
    const result = forecastSauce(
      baseInput({
        usage: steadyUsage(TUESDAY, 28, 0),
        parLevel: 6,
        usableStock: 0,
      }),
      { prepDate: TUESDAY, coversDays: 3, asOf: TUESDAY },
    )

    expect(result.reasoning.method).toBe('par_fallback')
    expect(result.reasoning.confidence).toBe('low')
    expect(result.suggestedBags).toBe(6)
  })

  it('suggests zero when there is neither history nor a par level', () => {
    const result = forecastSauce(baseInput({ usage: [], parLevel: 0 }), {
      prepDate: TUESDAY,
      coversDays: 3,
      asOf: TUESDAY,
    })

    expect(result.suggestedBags).toBe(0)
    expect(result.reasoning.confidence).toBe('low')
  })
})

/* -------------------------------------------------------------------------- */

describe('forecastSauce — new sauce, partial window', () => {
  it('divides by days since introduction rather than the full window', () => {
    // Introduced 7 days ago, 21 bags used in total.
    const introducedOn = addDaysTo(TUESDAY, -6)
    const result = forecastSauce(
      baseInput({
        usage: steadyUsage(TUESDAY, 7, 3),
        introducedOn,
      }),
      { prepDate: TUESDAY, coversDays: 3, asOf: TUESDAY },
    )

    expect(result.reasoning.observedDays).toBe(7)
    // 21 / 7 = 3/day, NOT 21 / 28 = 0.75/day.
    expect(result.reasoning.burnRatePerDay).toBe(3)
    expect(result.reasoning.method).toBe('partial_history')
    expect(result.reasoning.confidence).toBe('low')
    expect(result.reasoning.notes.join(' ')).toMatch(/introduced 7 days ago/i)
  })

  it('upgrades confidence to medium once there are two weeks of data', () => {
    const result = forecastSauce(
      baseInput({
        usage: steadyUsage(TUESDAY, 20, 2),
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
  /** 4 weeks where Fridays run at 7 bags and every other day at 2. */
  function fridaySpikeUsage(): UsageObservation[] {
    return Array.from({ length: 28 }, (_, index) => {
      const date = addDaysTo(TUESDAY, -(27 - index))
      return { date, bags: weekdayOf(date) === 5 ? 7 : 2 }
    })
  }

  it('derives a multiplier above 1 for the spiking weekday', () => {
    const usage = fridaySpikeUsage()
    const total = usage.reduce((sum, row) => sum + row.bags, 0)
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
    const usage = steadyUsage(TUESDAY, 5, 3)
    const multipliers = computeWeekdayMultipliers(usage, 3, 5)
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
    // Burn rate 0.5/day -> ~1.5 bags needed, but par says keep 10 on hand.
    const result = forecastSauce(
      baseInput({ usage: steadyUsage(TUESDAY, 28, 0.5), parLevel: 10, usableStock: 3 }),
      { prepDate: TUESDAY, coversDays: 3, asOf: TUESDAY },
    )

    expect(result.reasoning.parFloorApplied).toBe(true)
    expect(result.suggestedBags).toBe(7) // 10 target - 3 in stock
  })

  it('does not lower a suggestion that already exceeds the par gap', () => {
    const result = forecastSauce(
      baseInput({ usage: steadyUsage(TUESDAY, 28, 5), parLevel: 4, usableStock: 0 }),
      { prepDate: TUESDAY, coversDays: 3, asOf: TUESDAY },
    )

    expect(result.reasoning.parFloorApplied).toBe(false)
    expect(result.suggestedBags).toBe(Math.ceil(15 * DEFAULT_BUFFER))
  })

  it('flags a sauce that will run out before the next prep day', () => {
    // 2 bags/day, 2 bags in stock, prep is 3 days away.
    const result = forecastSauce(baseInput({ usableStock: 2 }), {
      prepDate: FRIDAY,
      coversDays: 4,
      asOf: '2026-08-04',
    })

    expect(result.lowStock).toBe(true)
    expect(result.reasoning.notes.join(' ')).toMatch(/run out/i)
  })

  it('does not flag low stock when there is enough to reach the prep day', () => {
    const result = forecastSauce(baseInput({ usableStock: 20 }), {
      prepDate: FRIDAY,
      coversDays: 4,
      asOf: '2026-08-04',
    })

    expect(result.lowStock).toBe(false)
  })
})
