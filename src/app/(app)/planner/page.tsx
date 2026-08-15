import type { Metadata } from 'next'
import { PageHeader } from '@/components/app/PageHeader'
import { PlannerBoard } from './PlannerBoard'
import { requireManager } from '@/lib/auth'
import { buildCombinedForecast, getPlan } from '@/lib/queries/planning'
import { describePrepDays, formatShort, isPrepDay, today, upcomingPrepDay } from '@/lib/date'
import { EmptyState } from '@/components/ui'

export const metadata: Metadata = { title: 'Prep planner' }

export default async function PlannerPage({
  searchParams,
}: {
  searchParams: { date?: string }
}) {
  const context = await requireManager()

  if (!context.prepSite) {
    return (
      <EmptyState
        icon="map-pin"
        title="No prep kitchen set"
        description="Choose which restaurant prepares sauce in Settings → Restaurants, then come back here."
      />
    )
  }

  const requested =
    searchParams.date && isPrepDay(searchParams.date, context.prepWeekdays)
      ? searchParams.date
      : undefined
  const prepDay = upcomingPrepDay(requested ?? today(), context.prepWeekdays)

  const [plan, forecast] = await Promise.all([
    getPlan(context.prepSite.id, prepDay.date, context.settings.bag_sizes_ml),
    buildCombinedForecast({
      sites: context.sites.map((site) => ({ id: site.id, name: site.name })),
      prepDate: prepDay.date,
      windowDays: context.settings.forecast_window_days,
      bufferMultiplier: Number(context.settings.forecast_buffer),
      bagSizesMl: context.settings.bag_sizes_ml,
      prepWeekdays: context.prepWeekdays,
    }),
  ])

  const lastCovered = prepDay.coverageDates[prepDay.coverageDates.length - 1]

  return (
    <>
      <PageHeader
        eyebrow={describePrepDays(context.prepWeekdays)}
        title={`Plan for ${formatShort(prepDay.date)}`}
        description={`Everything is cooked at ${context.prepSite.name} and must last until ${formatShort(lastCovered)} — ${prepDay.coversDays} days across ${context.sites.length} restaurant${context.sites.length === 1 ? '' : 's'}.`}
      />

      <PlannerBoard
        prepDate={prepDay.date}
        coversDays={prepDay.coversDays}
        prepSiteName={context.prepSite.name}
        sites={context.sites.map((site) => ({ id: site.id, name: site.name }))}
        forecasts={forecast.forecasts}
        plan={plan}
      />
    </>
  )
}
