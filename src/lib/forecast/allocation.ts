/**
 * Splits a batch across the restaurants it feeds.
 *
 * The forecast already suggests a share per restaurant, but the suggestion is
 * built from each store's own history and reality overrides it: Hitchin is
 * consistently sent less sauce than Stevenage regardless of what the numbers
 * say. So a manager can pin one store's share by hand.
 *
 * Pinning does NOT change how much gets cooked. The batch total is whatever
 * the plan says it is; pinning Hitchin down simply moves that volume to the
 * other restaurants. Cooking less is a separate decision, made by editing the
 * total itself.
 */

export interface AllocationInput {
  siteId: string
  /** What the forecast proposed for this restaurant. */
  suggestedMl: number
  /** A manual pin, or null to let this restaurant absorb the remainder. */
  overrideMl?: number | null
}

export interface ResolvedAllocation {
  siteId: string
  suggestedMl: number
  overrideMl: number | null
  /** What this restaurant actually gets. */
  ml: number
  /** Whether `ml` came from a manual pin rather than the split. */
  pinned: boolean
}

export interface AllocationSplit {
  allocations: ResolvedAllocation[]
  /**
   * Volume the pins leave unaccounted for, when every restaurant is pinned and
   * the pins don't add up to the batch total. Positive means the pins exceed
   * what is being made. Zero in every other case.
   */
  imbalanceMl: number
}

/**
 * Distributes `finalMl` across restaurants, honouring any pinned shares.
 *
 * Unpinned restaurants split whatever the pins leave over, in proportion to
 * what the forecast suggested for them. Uses largest-remainder rounding so the
 * shares always sum to exactly the volume available — a plan whose parts don't
 * add up to its whole is worse than useless on a delivery run.
 */
export function resolveAllocations(
  finalMl: number,
  allocations: AllocationInput[],
): AllocationSplit {
  const total = Math.max(0, Math.round(finalMl))

  if (allocations.length === 0) {
    return { allocations: [], imbalanceMl: total }
  }

  const pinned = allocations.filter(
    (entry) => entry.overrideMl !== null && entry.overrideMl !== undefined,
  )
  const free = allocations.filter(
    (entry) => entry.overrideMl === null || entry.overrideMl === undefined,
  )

  const pinnedTotal = pinned.reduce((sum, entry) => sum + Math.max(0, entry.overrideMl!), 0)

  // Everything pinned: the pins stand, and any disagreement with the total is
  // reported rather than silently corrected. Quietly rewriting a number a
  // manager typed in is how people stop trusting the screen.
  if (free.length === 0) {
    return {
      allocations: allocations.map((entry) => ({
        siteId: entry.siteId,
        suggestedMl: entry.suggestedMl,
        overrideMl: Math.max(0, entry.overrideMl!),
        ml: Math.max(0, entry.overrideMl!),
        pinned: true,
      })),
      imbalanceMl: pinnedTotal - total,
    }
  }

  const remainder = Math.max(0, total - pinnedTotal)
  const shares = splitProRata(
    remainder,
    free.map((entry) => Math.max(0, entry.suggestedMl)),
  )

  const shareBySite = new Map(free.map((entry, index) => [entry.siteId, shares[index]]))

  return {
    allocations: allocations.map((entry) => {
      const isPinned = entry.overrideMl !== null && entry.overrideMl !== undefined
      return {
        siteId: entry.siteId,
        suggestedMl: entry.suggestedMl,
        overrideMl: isPinned ? Math.max(0, entry.overrideMl!) : null,
        ml: isPinned ? Math.max(0, entry.overrideMl!) : (shareBySite.get(entry.siteId) ?? 0),
        pinned: isPinned,
      }
    }),
    // Pins alone already exceeding the batch is the one case worth flagging:
    // the unpinned stores get nothing and somebody has over-committed.
    imbalanceMl: Math.max(0, pinnedTotal - total),
  }
}

/**
 * Divides `total` in proportion to `weights`, as whole millilitres that sum to
 * exactly `total`. Equal weights (or all-zero weights) split evenly.
 */
function splitProRata(total: number, weights: number[]): number[] {
  if (weights.length === 0) return []
  if (total === 0) return weights.map(() => 0)

  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0)

  // No history anywhere — an even split is the only defensible guess.
  const exact =
    weightTotal > 0
      ? weights.map((weight) => (weight / weightTotal) * total)
      : weights.map(() => total / weights.length)

  const floors = exact.map((value) => Math.floor(value))
  let leftover = total - floors.reduce((sum, value) => sum + value, 0)

  // Largest fractional part gets each spare millilitre, ties broken by order so
  // the same inputs always produce the same plan.
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)

  const result = [...floors]
  for (const { index } of order) {
    if (leftover <= 0) break
    result[index] += 1
    leftover -= 1
  }

  return result
}
