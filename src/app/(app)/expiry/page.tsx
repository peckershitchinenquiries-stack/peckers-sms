import type { Metadata } from 'next'
import { PageHeader } from '@/components/app/PageHeader'
import { ExpiryTracker } from './ExpiryTracker'
import { requireSession, resolveSiteScope } from '@/lib/auth'
import { getTrackedBags, summariseExpiry } from '@/lib/queries/stock'
import { getSauces } from '@/lib/queries/catalogue'

export const metadata: Metadata = { title: 'Expiry tracker' }

export default async function ExpiryPage({
  searchParams,
}: {
  searchParams: { site?: string }
}) {
  const context = await requireSession()
  const siteId = resolveSiteScope(context, searchParams.site)

  const [bags, sauces] = await Promise.all([
    getTrackedBags({ siteId }),
    getSauces(),
  ])

  const summary = summariseExpiry(bags)

  return (
    <>
      <PageHeader
        eyebrow="Stock"
        title="Expiry tracker"
        description={
          context.isManager
            ? 'Every live bag across both sites, soonest to expire first. Sealed bags last 5 days; once opened, 2.'
            : 'Everything currently in your fridge, soonest to expire first. Work from the top down.'
        }
      />

      <ExpiryTracker
        bags={bags}
        summary={summary}
        sauces={sauces.map((sauce) => ({ id: sauce.id, name: sauce.name }))}
        isManager={context.isManager}
        showSiteColumn={siteId === null}
      />
    </>
  )
}
