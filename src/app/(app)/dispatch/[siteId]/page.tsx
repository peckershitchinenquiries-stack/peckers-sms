import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/app/PageHeader'
import { DispatchBoard } from './DispatchBoard'
import { requirePrepAccess } from '@/lib/auth'
import { getDispatchBoard, getRecentTransfers } from '@/lib/queries/dispatch'
import { formatRelativeDay, lastPrepDayOnOrBefore, today } from '@/lib/date'

interface DispatchPageProps {
  params: { siteId: string }
}

export async function generateMetadata({ params }: DispatchPageProps): Promise<Metadata> {
  const context = await requirePrepAccess()
  const destination = context.dispatchDestinations.find((site) => site.id === params.siteId)
  return { title: destination ? `Send to ${destination.name}` : 'Delivery run' }
}

export default async function DispatchPage({ params }: DispatchPageProps) {
  const context = await requirePrepAccess()

  // One screen per receiving store. An id that isn't one of them — a deleted
  // store, or the prep kitchen itself — has no delivery run to show.
  const destination = context.dispatchDestinations.find((site) => site.id === params.siteId)
  if (!destination) notFound()

  const asOf = today()
  // Stock is delivered on the day it's made, so the run relates to the most
  // recent prep day — including today when today is one.
  const prepDate = lastPrepDayOnOrBefore(asOf, context.prepWeekdays).date

  const [board, transfers] = await Promise.all([
    getDispatchBoard({
      fromSiteId: context.prepSite.id,
      toSiteId: destination.id,
      prepDate,
      date: asOf,
      bagSizesMl: context.settings.bag_sizes_ml,
    }),
    getRecentTransfers({ toSiteId: destination.id, limit: 25 }),
  ])

  return (
    <>
      <PageHeader
        eyebrow={`${context.prepSite.name} → ${destination.name}`}
        title={`Send to ${destination.name}`}
        description={`What needs to go across from ${formatRelativeDay(prepDate)}'s batch. Sending moves whole bags, so ${destination.name} sees the stock straight away.`}
      />

      <DispatchBoard
        board={board}
        fromSiteName={context.prepSite.name}
        destination={{ id: destination.id, name: destination.name }}
        transfers={transfers}
      />
    </>
  )
}
