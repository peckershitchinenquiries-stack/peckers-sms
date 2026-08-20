/**
 * Reads each store's takings for a day from the cash-flow app.
 *
 * Managers already record the day's sales in peckers-cashflow at close, so the
 * number is pulled from there rather than re-entered here. That app lives on a
 * different Supabase project, so it exposes a small secret-guarded endpoint
 * (`/api/external/daily-sales`) that this talks to.
 *
 * Env:
 *   CASHFLOW_API_URL     — origin of the cash-flow deployment
 *   CASHFLOW_API_SECRET  — must match EXTERNAL_API_SECRET over there
 */

interface DailySalesResponse {
  stores?: { storeName?: string | null; sales?: number | null }[]
}

/**
 * Sales per site slug for `date` (YYYY-MM-DD). Sites with no entry logged yet
 * are absent from the map.
 *
 * `siteSlugs` are this system's own store slugs, matched against the cash
 * app's store names. They are passed in rather than hard-coded so a store
 * added in Settings is picked up without a code change — as long as the two
 * apps name it recognisably ("Letchworth" vs "Letchworth Peckers").
 *
 * Never throws: the sauce dashboard has to render even when the cash app is
 * down or unconfigured, so every failure degrades to an empty map.
 */
export async function getDailySales(
  date: string,
  siteSlugs: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>()

  const baseUrl = process.env.CASHFLOW_API_URL
  const secret = process.env.CASHFLOW_API_SECRET
  if (!baseUrl || !secret || siteSlugs.length === 0) return result

  try {
    const response = await fetch(
      `${baseUrl.replace(/\/$/, '')}/api/external/daily-sales?date=${date}`,
      {
        headers: { Authorization: `Bearer ${secret}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(5_000),
      },
    )

    if (!response.ok) {
      console.error('[cashflow] daily-sales responded', response.status)
      return result
    }

    const payload = (await response.json()) as DailySalesResponse

    for (const store of payload.stores ?? []) {
      const name = (store.storeName ?? '').toLowerCase()
      // The two apps name the stores differently ("Hitchin Peckers" vs
      // "Hitchin"), so match on the slug appearing in the cash app's name.
      const slug = siteSlugs.find((candidate) => name.includes(candidate))
      if (!slug || typeof store.sales !== 'number') continue
      result.set(slug, store.sales)
    }
  } catch (error) {
    console.error('[cashflow] daily-sales fetch failed:', error)
  }

  return result
}
