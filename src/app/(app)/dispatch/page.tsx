import type { Metadata } from 'next'
import { PageHeader } from '@/components/app/PageHeader'
import { DispatchBoard } from './DispatchBoard'
import { requirePrepAccess } from '@/lib/auth'
import { getDispatchBoard, getRecentTransfers } from '@/lib/queries/dispatch'
import { EmptyState } from '@/components/ui'
import { formatRelativeDay, lastPrepDayOnOrBefore, today } from '@/lib/date'

export const metadata: Metadata = { title: 'Send to Hitchin' }

export default async function DispatchPage() {
  const context = await requirePrepAccess()

  // Everywhere that receives sauce rather than cooking it.
  const destinations = context.sites.filter((site) => site.id !== context.prepSite.id)

  if (destinations.length === 0) {
    return (
      <EmptyState
        icon="truck"
        title="Nowhere to send to"
        description="Every restaurant on the system prepares its own sauce, so there is nothing to deliver."
      />
    )
  }

  const asOf = today()
  // Stock is delivered on the day it's made, so the run relates to the most
  // recent prep day — including today when today is one.
  const prepDate = lastPrepDayOnOrBefore(asOf, context.prepWeekdays).date
  const destination = destinations[0]

  const [board, transfers] = await Promise.all([
    getDispatchBoard({
      fromSiteId: context.prepSite.id,
      toSiteId: destination.id,
      prepDate,
      date: asOf,
      bagSizesMl: context.settings.bag_sizes_ml,
    }),
    getRecentTransfers(25),
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
