import type { Metadata } from 'next'
import { PageHeader } from '@/components/app/PageHeader'
import { PrepChecklist } from './PrepChecklist'
import { requireSession, resolveSiteScope } from '@/lib/auth'
import { getPlan, getSessionForDate } from '@/lib/queries/planning'
import { getSauces } from '@/lib/queries/catalogue'
import { formatRelativeDay, isPrepDay, today, upcomingPrepDay } from '@/lib/date'

export const metadata: Metadata = { title: 'Prep checklist' }

export default async function PrepPage({
  searchParams,
}: {
  searchParams: { site?: string; date?: string }
}) {
  const context = await requireSession()

  // A checklist belongs to one kitchen, so a manager scoped to "both" falls
  // back to the first site.
  const scoped = resolveSiteScope(context, searchParams.site)
  const siteId = scoped ?? context.sites[0]?.id ?? null

  const now = today()
  const requested =
    searchParams.date && isPrepDay(searchParams.date) ? searchParams.date : undefined
  const prepDate = requested ?? (isPrepDay(now) ? now : upcomingPrepDay(now).date)
  const prepDay = upcomingPrepDay(prepDate)

  const [session, plan, sauces] = siteId
    ? await Promise.all([
        getSessionForDate(siteId, prepDate),
        getPlan(siteId, prepDate),
        getSauces(),
      ])
    : [null, null, []]

  const site = context.sites.find((candidate) => candidate.id === siteId) ?? null

  return (
    <>
      <PageHeader
        eyebrow={`${prepDay.type === 'tuesday' ? 'Tuesday' : 'Friday'} prep · ${prepDay.coversDays}-day cover`}
        title={`Prep checklist — ${formatRelativeDay(prepDate)}`}
        description={
          isPrepDay(now) && prepDate === now
            ? 'Work down the list: cook, blast chill for 1.5 hours, then vacuum pack. Packing creates the bags and starts each 5-day clock.'
            : `Prep runs 7–11am on Tuesdays and Fridays. This is the plan for ${formatRelativeDay(prepDate)}.`
        }
      />

      <PrepChecklist
        siteId={siteId}
        siteName={site?.name ?? 'No site'}
        sites={context.sites}
        prepDate={prepDate}
        coversDays={prepDay.coversDays}
        isToday={prepDate === now}
        session={session}
        plan={plan}
        sauces={sauces.map((sauce) => ({
          id: sauce.id,
          name: sauce.name,
          bagSize: sauce.bag_size,
        }))}
        canManageSite={context.isManager}
      />
    </>
  )
}
