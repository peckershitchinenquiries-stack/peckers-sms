import { NextResponse, type NextRequest } from 'next/server'
import { requireSession, resolveSiteScope } from '@/lib/auth'
import { getOvertime } from '@/lib/queries/activity'
import { csvResponseHeaders, toCsv } from '@/lib/utils/csv'
import { addDaysTo, formatDateOnly, formatInstant, today } from '@/lib/date'
import type { OvertimeRow } from '@/lib/types/database'

export const dynamic = 'force-dynamic'

/**
 * Overtime CSV for payroll.
 *
 * Runs through the normal session + RLS path, so staff can only ever export
 * their own hours and a manager only the sites they can see.
 */
export async function GET(request: NextRequest) {
  const context = await requireSession()
  const params = request.nextUrl.searchParams

  const asOf = today()
  const from = params.get('from') ?? addDaysTo(asOf, -90)
  const to = params.get('to') ?? asOf
  const siteId = resolveSiteScope(context, params.get('site'))

  const rows = await getOvertime({
    siteId,
    staffId: context.isManager ? null : context.profile.id,
    from,
    to,
  })

  const csv = toCsv<OvertimeRow>(
    rows.filter((row) => row.ended_at),
    [
      { header: 'Month', value: (row) => formatDateOnly(`${row.month}-01`, 'MMMM yyyy') },
      { header: 'Prep date', value: (row) => row.prep_date },
      { header: 'Weekday', value: (row) => formatDateOnly(row.prep_date, 'EEEE') },
      { header: 'Staff member', value: (row) => row.staff_name },
      { header: 'Site', value: (row) => row.site_name },
      { header: 'Started', value: (row) => formatInstant(row.started_at, 'HH:mm') },
      { header: 'Ended', value: (row) => (row.ended_at ? formatInstant(row.ended_at, 'HH:mm') : '') },
      { header: 'Hours worked', value: (row) => Number(row.hours_worked).toFixed(2) },
    ],
  )

  return new NextResponse(csv, {
    headers: csvResponseHeaders(`peckers-overtime-${from}-to-${to}.csv`),
  })
}
