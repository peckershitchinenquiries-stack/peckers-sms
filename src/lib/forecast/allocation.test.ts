import { describe, expect, it } from 'vitest'
import { resolveAllocations } from './allocation'

const STEVENAGE = 'stevenage'
const HITCHIN = 'hitchin'
const LUTON = 'luton'

describe('resolveAllocations', () => {
  it('passes the forecast split straight through when nothing is pinned', () => {
    const { allocations, imbalanceMl } = resolveAllocations(1500, [
      { siteId: STEVENAGE, suggestedMl: 750 },
      { siteId: HITCHIN, suggestedMl: 750 },
    ])

    expect(allocations.map((a) => a.ml)).toEqual([750, 750])
    expect(allocations.every((a) => !a.pinned)).toBe(true)
    expect(imbalanceMl).toBe(0)
  })

  it('moves volume to the other store when one is pinned, keeping the total', () => {
    // The client's own example: Hitchin always takes less than Stevenage.
    const { allocations } = resolveAllocations(1500, [
      { siteId: STEVENAGE, suggestedMl: 750 },
      { siteId: HITCHIN, suggestedMl: 750, overrideMl: 500 },
    ])

    expect(allocations).toEqual([
      { siteId: STEVENAGE, suggestedMl: 750, overrideMl: null, ml: 1000, pinned: false },
      { siteId: HITCHIN, suggestedMl: 750, overrideMl: 500, ml: 500, pinned: true },
    ])
    expect(allocations.reduce((sum, a) => sum + a.ml, 0)).toBe(1500)
  })

  it('splits the remainder pro-rata across several unpinned stores', () => {
    const { allocations } = resolveAllocations(1000, [
      { siteId: STEVENAGE, suggestedMl: 600 },
      { siteId: HITCHIN, suggestedMl: 200, overrideMl: 100 },
      { siteId: LUTON, suggestedMl: 200 },
    ])

    // 900 left over, split 600:200 -> 675:225.
    expect(allocations.map((a) => a.ml)).toEqual([675, 100, 225])
    expect(allocations.reduce((sum, a) => sum + a.ml, 0)).toBe(1000)
  })

  it('always sums to the total, even when the split does not divide evenly', () => {
    const { allocations } = resolveAllocations(1000, [
      { siteId: STEVENAGE, suggestedMl: 1 },
      { siteId: HITCHIN, suggestedMl: 1 },
      { siteId: LUTON, suggestedMl: 1 },
    ])

    expect(allocations.reduce((sum, a) => sum + a.ml, 0)).toBe(1000)
    expect(allocations.map((a) => a.ml)).toEqual([334, 333, 333])
  })

  it('splits evenly when no store has any history to weight by', () => {
    const { allocations } = resolveAllocations(1000, [
      { siteId: STEVENAGE, suggestedMl: 0 },
      { siteId: HITCHIN, suggestedMl: 0 },
    ])

    expect(allocations.map((a) => a.ml)).toEqual([500, 500])
  })

  it('honours every pin when all stores are pinned, and reports the gap', () => {
    const { allocations, imbalanceMl } = resolveAllocations(1500, [
      { siteId: STEVENAGE, suggestedMl: 750, overrideMl: 800 },
      { siteId: HITCHIN, suggestedMl: 750, overrideMl: 400 },
    ])

    expect(allocations.map((a) => a.ml)).toEqual([800, 400])
    // 1200 pinned against a 1500 batch — 300ml unaccounted for.
    expect(imbalanceMl).toBe(-300)
  })

  it('leaves unpinned stores empty when the pins already exceed the batch', () => {
    const { allocations, imbalanceMl } = resolveAllocations(1000, [
      { siteId: STEVENAGE, suggestedMl: 500 },
      { siteId: HITCHIN, suggestedMl: 500, overrideMl: 1200 },
    ])

    expect(allocations.map((a) => a.ml)).toEqual([0, 1200])
    expect(imbalanceMl).toBe(200)
  })

  it('treats a pin of zero as a real decision, not an absent one', () => {
    const { allocations } = resolveAllocations(1000, [
      { siteId: STEVENAGE, suggestedMl: 500 },
      { siteId: HITCHIN, suggestedMl: 500, overrideMl: 0 },
    ])

    expect(allocations.map((a) => a.ml)).toEqual([1000, 0])
    expect(allocations[1].pinned).toBe(true)
  })

  it('gives nothing away when there is nothing to make', () => {
    const { allocations } = resolveAllocations(0, [
      { siteId: STEVENAGE, suggestedMl: 500 },
      { siteId: HITCHIN, suggestedMl: 500 },
    ])

    expect(allocations.map((a) => a.ml)).toEqual([0, 0])
  })

  it('handles a plan with no restaurants at all', () => {
    expect(resolveAllocations(1000, [])).toEqual({ allocations: [], imbalanceMl: 1000 })
  })
})
