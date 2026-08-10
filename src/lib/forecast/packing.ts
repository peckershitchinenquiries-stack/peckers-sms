/**
 * Packs a volume (ml) into the fewest, least-wasteful combination of bag
 * sizes — e.g. "6300ml of House Mayo" -> 3×2000ml + 1×300ml, not 7×1000ml.
 *
 * Assumes bag sizes are positive integers and, in practice, whole multiples
 * of 100ml (true of every size the kitchen actually uses). The DP below works
 * in 100ml units for that reason; the reported totals are always recomputed
 * from the real (unrounded) sizes, so a non-round size can't silently skew
 * the waste figure.
 */

export interface PackResult {
  /** Bag size (ml) -> how many of that size. Sizes with a zero count are omitted. */
  counts: Record<number, number>
  totalBags: number
  totalMl: number
  /** How much more than the target this pack holds. */
  wasteMl: number
  /** wasteMl as a percentage of the target (0 when the target itself is 0). */
  wastePercent: number
}

export const DEFAULT_BAG_SIZES_ML = [300, 500, 1000, 2000]

const UNIT_ML = 100

function emptyResult(wasteMl = 0): PackResult {
  return { counts: {}, totalBags: 0, totalMl: 0, wasteMl, wastePercent: 0 }
}

export function packVolume(targetMl: number, sizesMl: number[] = DEFAULT_BAG_SIZES_ML): PackResult {
  const target = Math.max(0, Math.round(targetMl))
  if (target <= 0) return emptyResult()

  // De-duplicate sizes that round to the same 100ml unit, keeping the
  // smaller actual size (never overstates what a pack can hold).
  const unitToSize = new Map<number, number>()
  for (const size of sizesMl) {
    if (!Number.isFinite(size) || size <= 0) continue
    const unit = Math.round(size / UNIT_ML)
    if (unit <= 0) continue
    const existing = unitToSize.get(unit)
    if (existing === undefined || size < existing) unitToSize.set(unit, size)
  }

  if (unitToSize.size === 0) return emptyResult(target)

  const sizeUnits = [...unitToSize.keys()]
  const maxSizeUnit = Math.max(...sizeUnits)
  const targetUnits = Math.ceil(target / UNIT_ML)

  // `ceil(targetUnits / maxSizeUnit) * maxSizeUnit` is always reachable using
  // only the largest bag repeated, and sits within `maxSizeUnit` units of the
  // target — so scanning that far is guaranteed to find a reachable total,
  // regardless of what sizes are configured.
  const bound = targetUnits + maxSizeUnit

  const minCoins = new Array<number>(bound + 1).fill(Infinity)
  const lastUnit = new Array<number>(bound + 1).fill(-1)
  minCoins[0] = 0

  for (let sum = 1; sum <= bound; sum += 1) {
    for (const sizeUnit of sizeUnits) {
      if (sizeUnit > sum) continue
      const candidate = minCoins[sum - sizeUnit] + 1
      if (candidate < minCoins[sum]) {
        minCoins[sum] = candidate
        lastUnit[sum] = sizeUnit
      }
    }
  }

  let bestSum = -1
  for (let sum = targetUnits; sum <= bound; sum += 1) {
    if (minCoins[sum] < Infinity) {
      bestSum = sum
      break
    }
  }

  /* istanbul ignore next — proven reachable within `bound` above. */
  if (bestSum === -1) return emptyResult(target)

  const counts: Record<number, number> = {}
  let remaining = bestSum
  while (remaining > 0) {
    const unit = lastUnit[remaining]
    const size = unitToSize.get(unit)!
    counts[size] = (counts[size] ?? 0) + 1
    remaining -= unit
  }

  const totalBags = Object.values(counts).reduce((sum, count) => sum + count, 0)
  const totalMl = Object.entries(counts).reduce(
    (sum, [size, count]) => sum + Number(size) * count,
    0,
  )
  const wasteMl = totalMl - target

  return {
    counts,
    totalBags,
    totalMl,
    wasteMl,
    wastePercent: target > 0 ? Math.round((wasteMl / target) * 1000) / 10 : 0,
  }
}
