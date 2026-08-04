import type { Metadata } from 'next'
import { PageHeader } from '@/components/app/PageHeader'
import { AlertsCentre } from './AlertsCentre'
import { requireSession, resolveSiteScope } from '@/lib/auth'
import { getAlerts } from '@/lib/queries/activity'

export const metadata: Metadata = { title: 'Alerts' }

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: { site?: string }
}) {
  const context = await requireSession()
  const siteId = resolveSiteScope(context, searchParams.site)

  const [open, resolved] = await Promise.all([
    getAlerts({ siteId }),
    getAlerts({ siteId, includeResolved: true, limit: 60 }),
  ])

  return (
    <>
      <PageHeader
        eyebrow="Monitoring"
        title="Alerts centre"
        description="Expiry warnings, stock-out risks and repeating weekday patterns — each with three things you can actually do about it."
      />

      <AlertsCentre
        open={open}
        history={resolved.filter((alert) => alert.resolved)}
        sites={context.sites}
        siteId={siteId}
        isManager={context.isManager}
      />
    </>
  )
}
