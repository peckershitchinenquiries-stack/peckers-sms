/** Renders a millilitre volume the way a human reads it: "6.2L", "850ml". */
export function formatMl(ml: number): string {
  const rounded = Math.round(ml)
  if (Math.abs(rounded) < 1000) return `${rounded}ml`
  return `${Math.round((rounded / 1000) * 10) / 10}L`
}

/** "2×2000ml + 1×500ml" — the pack breakdown, largest bag first. */
export function formatPack(counts: Record<number, number>): string {
  return Object.entries(counts)
    .map(([size, count]) => [Number(size), count] as const)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[0] - a[0])
    .map(([size, count]) => `${count}×${size}ml`)
    .join(' + ')
}
