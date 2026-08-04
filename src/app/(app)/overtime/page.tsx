import type { Metadata } from 'next'
import { PageHeader } from '@/components/app/PageHeader'
import { OvertimeTracker } from './OvertimeTracker'
import { requireSession, resolveSiteScope } from '@/lib/auth'
import { getOvertime, summariseOvertime } from '@/lib/queries/activity'
import { addDaysTo, today } from '@/lib/date'

export const metadata: Metadata = { title: 'Overtime' }

export default async function OvertimePage({
  searchParams,
}: {
  searchParams: { site?: string; from?: string; to?: string }
}) {
  const context = await requireSession()
  const siteId = resolveSiteScope(context, searchParams.site)

  const asOf = today()
  const from = searchParams.from ?? addDaysTo(asOf, -90)
  const to = searchParams.to ?? asOf

  // Staff only ever see their own hours; managers see the whole team.
  const rows = await getOvertime({
    siteId,
    staffId: context.isManager ? null : context.profile.id,
    from,
    to,
  })

  return (
    <>
      <PageHeader
        eyebrow="Payroll"
        title="Overtime tracker"
        description="Tuesday and Friday prep runs 7–11am and is paid as overtime. Hours come straight from each session's start and end times."
      />

      <OvertimeTracker
        rows={rows}
        summaries={summariseOvertime(rows)}
        isManager={context.isManager}
        range={{ from, to }}
        siteId={siteId}
      />
    </>
  )
}
