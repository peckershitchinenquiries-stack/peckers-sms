import { describe, expect, it } from 'vitest'
import { DEFAULT_BAG_SIZES_ML, packVolume } from './packing'

describe('packVolume', () => {
  it('returns nothing for a zero or negative target', () => {
    expect(packVolume(0)).toEqual({ counts: {}, totalBags: 0, totalMl: 0, wasteMl: 0, wastePercent: 0 })
    expect(packVolume(-500)).toEqual({ counts: {}, totalBags: 0, totalMl: 0, wasteMl: 0, wastePercent: 0 })
  })

  it('uses a single bag for an exact match', () => {
    const result = packVolume(2000)
    expect(result.counts).toEqual({ 2000: 1 })
    expect(result.totalBags).toBe(1)
    expect(result.totalMl).toBe(2000)
    expect(result.wasteMl).toBe(0)
  })

  it('rounds up to the smallest bag when the target is below it', () => {
    const result = packVolume(100)
    expect(result.counts).toEqual({ 300: 1 })
    expect(result.wasteMl).toBe(200)
    expect(result.wastePercent).toBe(200)
  })

  it('finds a zero-waste combination across sizes (2000 + 500)', () => {
    const result = packVolume(2500)
    expect(result.counts).toEqual({ 2000: 1, 500: 1 })
    expect(result.totalBags).toBe(2)
    expect(result.wasteMl).toBe(0)
  })

  it('prefers the exact zero-waste combination over a smaller bag run', () => {
    // 1600ml = 1000 + 300 + 300 exactly; not 2 x 1000 (waste) or 1 x 2000 (waste).
    const result = packVolume(1600)
    expect(result.counts).toEqual({ 1000: 1, 300: 2 })
    expect(result.totalBags).toBe(3)
    expect(result.wasteMl).toBe(0)
  })

  it('minimises bag count among equally waste-free combinations', () => {
    // 1500ml is exact via 1000+500 (2 bags) or 500x3 (3 bags) — pick the 2-bag pack.
    const result = packVolume(1500)
    expect(result.counts).toEqual({ 1000: 1, 500: 1 })
    expect(result.totalBags).toBe(2)
  })

  it('packs a real production-day figure from the client data (Hitchin House Mayo, Tuesday batch: Tue+Wed+Thu = 1000+3000+2000)', () => {
    const result = packVolume(6000)
    expect(result.counts).toEqual({ 2000: 3 })
    expect(result.totalBags).toBe(3)
    expect(result.wasteMl).toBe(0)
  })

  it('works with a restricted or custom set of sizes', () => {
    const result = packVolume(1800, [500, 1000])
    // 1800 isn't a multiple of 500, so the nearest reachable total is 2000 —
    // and 2 x 1000 beats 1 x 1000 + 2 x 500 on bag count for the same waste.
    expect(result.counts).toEqual({ 1000: 2 })
    expect(result.wasteMl).toBe(200)
  })

  it('de-duplicates sizes that round to the same 100ml unit, keeping the smaller', () => {
    const result = packVolume(1000, [1000, 1040])
    expect(result.counts).toEqual({ 1000: 1 })
  })

  it('defaults to the standard four sizes', () => {
    const result = packVolume(4300)
    expect(Object.keys(result.counts).map(Number).every((size) => DEFAULT_BAG_SIZES_ML.includes(size))).toBe(
      true,
    )
    expect(result.wasteMl).toBe(0)
  })
})
