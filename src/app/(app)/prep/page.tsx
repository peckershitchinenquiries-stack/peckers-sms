import type { Metadata } from 'next'
import { PageHeader } from '@/components/app/PageHeader'
import { PrepChecklist } from './PrepChecklist'
import { requirePrepAccess } from '@/lib/auth'
import { getPrepBoard } from '@/lib/queries/planning'
import { getSauces } from '@/lib/queries/catalogue'
import { describePrepDays, formatRelativeDay, isPrepDay, today, upcomingPrepDay } from '@/lib/date'

export const metadata: Metadata = { title: 'Prep checklist' }

export default async function PrepPage({
  searchParams,
}: {
  searchParams: { date?: string }
}) {
  // Sauce is prepared at one kitchen only, so there is nothing to choose here —
  // and staff at a restaurant that doesn't cook never reach this page.
  const context = await requirePrepAccess()

  const now = today()
  const requested =
    searchParams.date && isPrepDay(searchParams.date, context.prepWeekdays)
      ? searchParams.date
      : undefined
  const prepDay = upcomingPrepDay(requested ?? now, context.prepWeekdays)

  const [board, sauces] = await Promise.all([
    getPrepBoard({
      siteId: context.prepSite.id,
      prepDate: prepDay.date,
      coversDays: prepDay.coversDays,
      bagSizesMl: context.settings.bag_sizes_ml,
    }),
    getSauces(),
  ])

  const isTodayPrep = prepDay.date === now

  return (
    <>
      <PageHeader
        eyebrow={`${context.prepSite.name} · covers ${prepDay.coversDays} days`}
        title={isTodayPrep ? "Today's prep" : `Prep — ${formatRelativeDay(prepDay.date)}`}
        description={
          isTodayPrep
            ? "Make each sauce, then record how much you made and the bags it went into. That starts each sauce's own shelf-life clock on every bag."
            : `Sauce is prepared on ${describePrepDays(context.prepWeekdays)}. This is the list for ${formatRelativeDay(prepDay.date)}.`
        }
      />

      <PrepChecklist
        board={board}
        isToday={isTodayPrep}
        siteName={context.prepSite.name}
        sauces={sauces.map((sauce) => ({
          id: sauce.id,
          name: sauce.name,
          sealedShelfLifeDays: sauce.sealed_shelf_life_days,
        }))}
        bagSizesMl={context.settings.bag_sizes_ml}
        isManager={context.isManager}
      />
    </>
  )
}
