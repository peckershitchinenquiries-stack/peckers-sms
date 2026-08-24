import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getGrossSales, latestSalesDate } from './sales'

/**
 * Response bodies here are copied from the real contract in
 * peckers-VM-dashboard (`docs/daily-net-sales.md` §5) — the point of these
 * tests is that this client keeps matching that feed, including its
 * deliberate 404-for-a-missing-day behaviour.
 */

const ok = (slug: string, gross: number) => ({
  ok: true,
  status: 200,
  json: async () => ({
    store: slug,
    store_name: `Peckers ${slug}`,
    business_date: '2026-08-21',
    gross_sales: gross,
    currency: 'GBP',
    last_synced_at: '2026-08-22T00:34:11Z',
  }),
})

const missing = {
  ok: false,
  status: 404,
  json: async () => ({
    reason: 'no data',
    last_synced_at: null,
    latest_business_date: null,
  }),
}

describe('latestSalesDate', () => {
  it('is the day before, because the scrape runs after close', () => {
    expect(latestSalesDate('2026-08-22')).toBe('2026-08-21')
  })
})

describe('getGrossSales', () => {
  beforeEach(() => {
    process.env.VITAMOJO_API_URL = 'https://vm.example.com/'
    process.env.VITAMOJO_API_SECRET = 'sauce-key'
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.VITAMOJO_API_URL
    delete process.env.VITAMOJO_API_SECRET
  })

  it('asks the feed for one store at a time and keys the result by slug', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok('hitchin', 1234.56))
      .mockResolvedValueOnce(ok('stevenage', 987.65))
    vi.stubGlobal('fetch', fetchMock)

    const sales = await getGrossSales('2026-08-21', ['hitchin', 'stevenage'])

    expect(sales.get('hitchin')).toBe(1234.56)
    expect(sales.get('stevenage')).toBe(987.65)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(
      'https://vm.example.com/api/sauce/daily-net-sales?store=hitchin&date=2026-08-21',
    )
    expect(init.headers.Authorization).toBe('Bearer sauce-key')
  })

  it('leaves a 404 day absent rather than reporting it as zero', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(missing))

    const sales = await getGrossSales('2026-08-21', ['hitchin'])

    expect(sales.has('hitchin')).toBe(false)
  })

  it('degrades to no figures when the feed is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))

    await expect(getGrossSales('2026-08-21', ['hitchin'])).resolves.toEqual(new Map())
  })

  it('does not call the feed at all when it is unconfigured', async () => {
    delete process.env.VITAMOJO_API_URL
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(getGrossSales('2026-08-21', ['hitchin'])).resolves.toEqual(new Map())
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it(`keeps one store's outage from hiding the other's figure`, async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(ok('hitchin', 1234.56))
        .mockRejectedValueOnce(new Error('timeout')),
    )

    const sales = await getGrossSales('2026-08-21', ['hitchin', 'stevenage'])

    expect(sales.get('hitchin')).toBe(1234.56)
    expect(sales.has('stevenage')).toBe(false)
  })
})
