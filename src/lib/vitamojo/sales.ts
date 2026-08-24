/**
 * Reads each store's gross sales for a business day from the VM dashboard app
 * (`peckers-VM-dashboard`).
 *
 * Vitamojo has no API, so that project scrapes VM Hub nightly into its own
 * Supabase and serves the result over a bearer-guarded, server-to-server feed:
 * `GET /api/sauce/daily-net-sales`. Despite the route name it returns
 * `gross_sales` — the chart it scrapes was pivoted from net to gross on
 * 2026-08-22 and the path was left alone. See that repo's
 * `docs/daily-net-sales.md` §5 for the contract.
 *
 * The scrape runs at 00:30 Europe/London for the day that just closed, so the
 * newest complete figure is always yesterday's — see `latestSalesDate`.
 *
 * Env:
 *   VITAMOJO_API_URL     — origin of the VM dashboard deployment
 *   VITAMOJO_API_SECRET  — must match SAUCE_API_KEY over there
 */
import { addDaysTo } from '@/lib/date'

interface DailySalesRow {
  gross_sales?: number | null
}

/**
 * The last business date the nightly scrape can have covered. Today's trading
 * is still in progress, so the dashboard shows the previous day.
 */
export function latestSalesDate(asOf: string): string {
  return addDaysTo(asOf, -1)
}

/**
 * Gross sales for one store slug on `date`, or null when that day has no
 * figure yet.
 *
 * The feed answers 404 — deliberately, never 0 — for a day it has no row for,
 * so a missing scrape can't be rendered as a real day of zero trade. That
 * distinction is preserved here as null.
 */
async function fetchStore(
  baseUrl: string,
  secret: string,
  slug: string,
  date: string,
): Promise<number | null> {
  const response = await fetch(
    `${baseUrl}/api/sauce/daily-net-sales?store=${encodeURIComponent(slug)}&date=${date}`,
    {
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
      // Generous: the feed is on a free tier that sleeps, so a cold start can
      // take tens of seconds even with its own keep-alive ping running.
      signal: AbortSignal.timeout(15_000),
    },
  )

  if (response.status === 404) return null
  if (!response.ok) {
    console.error(`[vitamojo] daily sales for ${slug} responded`, response.status)
    return null
  }

  const payload = (await response.json()) as DailySalesRow
  return typeof payload.gross_sales === 'number' ? payload.gross_sales : null
}

/**
 * Gross sales per site slug for `date` (YYYY-MM-DD). Sites the feed has no
 * figure for are absent from the map.
 *
 * The feed serves one store per request, so this fans out over the slugs. They
 * are passed in rather than hard-coded so a store added in Settings is picked
 * up without a code change — as long as its slug matches the one the feed
 * derives from the VM Hub store name ("Peckers Hitchin" -> `hitchin`).
 *
 * Never throws: the sauce dashboard has to render even when the feed is down
 * or unconfigured, so every failure degrades to a missing figure.
 */
export async function getGrossSales(
  date: string,
  siteSlugs: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>()

  const baseUrl = process.env.VITAMOJO_API_URL?.replace(/\/$/, '')
  const secret = process.env.VITAMOJO_API_SECRET
  if (!baseUrl || !secret || siteSlugs.length === 0) return result

  const figures = await Promise.all(
    siteSlugs.map(async (slug) => {
      try {
        return [slug, await fetchStore(baseUrl, secret, slug, date)] as const
      } catch (error) {
        console.error(`[vitamojo] daily sales for ${slug} failed:`, error)
        return [slug, null] as const
      }
    }),
  )

  for (const [slug, amount] of figures) {
    if (amount !== null) result.set(slug, amount)
  }

  return result
}
