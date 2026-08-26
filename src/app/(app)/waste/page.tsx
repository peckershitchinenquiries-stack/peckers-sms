import type { Metadata } from 'next'
import { PageHeader } from '@/components/app/PageHeader'
import { WasteReport } from './WasteReport'
import { requireSession, resolveSiteScope } from '@/lib/auth'
import { getWasteRate, getWasteSummary } from '@/lib/queries/waste'
import { addDaysTo, today } from '@/lib/date'

export const metadata: Metadata = { title: 'Wastage' }

export default async function WastePage({
  searchParams,
}: {
  searchParams: { site?: string; from?: string; to?: string }
}) {
  const context = await requireSession()
  const siteId = resolveSiteScope(context, searchParams.site)

  const asOf = today()
  const to = searchParams.to ?? asOf
  const from = searchParams.from ?? addDaysTo(to, -27)

  const [summary, rate] = await Promise.all([
    getWasteSummary({ siteId, from, to }),
    getWasteRate({ siteId, from, to }),
  ])

  return (
    <>
      <PageHeader
        eyebrow="Cost control"
        title="Wastage"
        description="Sauce that was made but never served — whatever was left in a bag when it passed its date, plus anything binned early. Measured in volume, because that is what it cost to make."
      />

      <WasteReport
        summary={summary}
        rate={rate}
        showSiteColumn={siteId === null}
        isManager={context.isManager}
      />
    </>
  )
}
