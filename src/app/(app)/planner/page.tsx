import type { Metadata } from 'next'
import { PageHeader } from '@/components/app/PageHeader'
import { PlannerBoard } from './PlannerBoard'
import { requireManager } from '@/lib/auth'
import { buildForecast, getPlan } from '@/lib/queries/planning'
import { formatShort, isPrepDay, today, upcomingPrepDay } from '@/lib/date'
import { EmptyState } from '@/components/ui'

export const metadata: Metadata = { title: 'Prep planner' }

export default async function PlannerPage({
  searchParams,
}: {
  searchParams: { site?: string; date?: string }
}) {
  const context = await requireManager()

  // The planner is inherently per-site — a plan belongs to one kitchen. Default
  // to the first site when the manager is scoped to "both".
  const siteId =
    searchParams.site && context.sites.some((site) => site.id === searchParams.site)
      ? searchParams.site
      : context.sites[0]?.id

  if (!siteId) {
    return (
      <EmptyState
        icon="map-pin"
        title="No sites configured"
        description="Add a site in Settings before planning a prep day."
      />
    )
  }

  const requestedDate =
    searchParams.date && isPrepDay(searchParams.date) ? searchParams.date : undefined
  const prepDay = upcomingPrepDay(requestedDate ?? today())

  const [existingPlan, forecast] = await Promise.all([
    getPlan(siteId, prepDay.date),
    buildForecast({
      siteId,
      prepDate: prepDay.date,
      windowDays: context.settings.forecast_window_days,
      bufferMultiplier: Number(context.settings.forecast_buffer),
    }),
  ])

  const site = context.sites.find((candidate) => candidate.id === siteId)!

  return (
    <>
      <PageHeader
        eyebrow="Forecast"
        title="Prep planner"
        description={`${prepDay.type === 'tuesday' ? 'Tuesday' : 'Friday'} batch at ${site.name} — must cover ${prepDay.coversDays} days (${formatShort(prepDay.coverageDates[0])} to ${formatShort(prepDay.coverageDates[prepDay.coverageDates.length - 1])}).`}
      />

      <PlannerBoard
        site={site}
        sites={context.sites}
        prepDate={prepDay.date}
        prepType={prepDay.type}
        coversDays={prepDay.coversDays}
        coverageDates={prepDay.coverageDates}
        forecasts={forecast.forecasts}
        plan={existingPlan}
        windowDays={context.settings.forecast_window_days}
        bufferMultiplier={Number(context.settings.forecast_buffer)}
      />
    </>
  )
}
