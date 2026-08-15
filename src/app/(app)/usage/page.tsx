import type { Metadata } from 'next'
import { PageHeader } from '@/components/app/PageHeader'
import { UsageLogger } from './UsageLogger'
import { requireSession, resolveSiteScope } from '@/lib/auth'
import { getLiveStock, getBurnRates } from '@/lib/queries/stock'
import { getDailyUsageTotals, getUsageForDate, getUsageLogs } from '@/lib/queries/activity'
import { addDaysTo, today } from '@/lib/date'

export const metadata: Metadata = { title: 'Daily usage' }

export default async function UsagePage({
  searchParams,
}: {
  searchParams: { site?: string }
}) {
  const context = await requireSession()
  const scoped = resolveSiteScope(context, searchParams.site)
  const writeSiteId = scoped ?? context.sites[0]?.id ?? null
  const asOf = today()

  const [stock, burnRates, loggedToday, recent, dailyTotals] = await Promise.all([
    getLiveStock(scoped),
    getBurnRates(scoped, context.settings.forecast_window_days),
    writeSiteId ? getUsageForDate(writeSiteId, asOf) : Promise.resolve(new Map<string, number>()),
    getUsageLogs({ siteId: scoped, from: addDaysTo(asOf, -13), limit: 300 }),
    getDailyUsageTotals(scoped, 14),
  ])

  return (
    <>
      <PageHeader
        eyebrow="Stock"
        title="Daily usage"
        description="Log how much of each sauce you got through today. This is what the next batch is worked out from, so it matters."
      />

      <UsageLogger
        siteId={writeSiteId}
        siteName={context.sites.find((site) => site.id === writeSiteId)?.name ?? 'No site'}
        showSiteColumn={scoped === null}
        stock={stock}
        burnRates={Object.fromEntries(burnRates)}
        loggedToday={Object.fromEntries(loggedToday)}
        recent={recent}
        dailyTotals={dailyTotals}
        isManager={context.isManager}
        prepWeekdays={context.prepWeekdays}
      />
    </>
  )
}
