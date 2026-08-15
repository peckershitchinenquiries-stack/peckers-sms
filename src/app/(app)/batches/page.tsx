import type { Metadata } from 'next'
import { PageHeader } from '@/components/app/PageHeader'
import { BatchLog } from './BatchLog'
import { requireManager, resolveSiteScope } from '@/lib/auth'
import { getBatchHistory } from '@/lib/queries/activity'
import { getPrepVsPlan } from '@/lib/queries/planning'
import { getSauces } from '@/lib/queries/catalogue'
import { addDaysTo, today } from '@/lib/date'

export const metadata: Metadata = { title: 'Batch log' }

export default async function BatchesPage({
  searchParams,
}: {
  searchParams: { site?: string; from?: string; to?: string; sauce?: string }
}) {
  const context = await requireManager()
  const scoped = resolveSiteScope(context, searchParams.site)
  const writeSiteId = scoped ?? context.sites[0]?.id ?? null

  const asOf = today()
  const from = searchParams.from ?? addDaysTo(asOf, -28)
  const to = searchParams.to ?? asOf

  const [batches, comparison, sauces] = await Promise.all([
    getBatchHistory({ siteId: scoped, sauceId: searchParams.sauce ?? null, from, to }),
    getPrepVsPlan({ siteId: scoped, from, to }),
    getSauces(),
  ])

  return (
    <>
      <PageHeader
        eyebrow="Production"
        title="Batch log"
        description="Every bag that has been made, grouped by the batch it came from. Each bag gets its own 5-day sealed expiry the moment it's packed."
      />

      <BatchLog
        siteId={writeSiteId}
        siteName={context.sites.find((site) => site.id === writeSiteId)?.name ?? 'No site'}
        showSiteColumn={scoped === null}
        batches={batches}
        comparison={comparison}
        sauces={sauces.map((sauce) => ({
          id: sauce.id,
          name: sauce.name,
        }))}
        range={{ from, to }}
        bagSizesMl={context.settings.bag_sizes_ml}
        prepWeekdays={context.prepWeekdays}
      />
    </>
  )
}
