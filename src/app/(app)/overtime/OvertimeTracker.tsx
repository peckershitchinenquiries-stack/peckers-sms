'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DateRangePicker,
  Icon,
  ProgressBar,
  SegmentedControl,
  StatCard,
  Table,
} from '@/components/ui'
import { formatDateOnly, formatShort, formatTimeOfDay, type DateOnly } from '@/lib/date'
import type { OvertimeRow } from '@/lib/types/database'
import type { OvertimeSummary } from '@/lib/queries/activity'

export interface OvertimeTrackerProps {
  rows: OvertimeRow[]
  summaries: OvertimeSummary[]
  isManager: boolean
  range: { from: DateOnly; to: DateOnly }
  siteId: string | null
}

export function OvertimeTracker({
  rows,
  summaries,
  isManager,
  range,
  siteId,
}: OvertimeTrackerProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [view, setView] = React.useState<'monthly' | 'sessions'>('monthly')

  const totals = React.useMemo(() => {
    const hours = rows.reduce((sum, row) => sum + Number(row.hours_worked), 0)
    const complete = rows.filter((row) => row.ended_at).length
    const staff = new Set(rows.map((row) => row.staff_id)).size
    return {
      hours: Math.round(hours * 100) / 100,
      sessions: rows.length,
      complete,
      open: rows.length - complete,
      staff,
      average: complete > 0 ? Math.round((hours / complete) * 100) / 100 : 0,
    }
  }, [rows])

  const peakMonthHours = Math.max(...summaries.map((summary) => summary.hours), 1)

  const setRange = (next: { from: DateOnly | null; to: DateOnly | null }) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next.from) params.set('from', next.from)
    else params.delete('from')
    if (next.to) params.set('to', next.to)
    else params.delete('to')
    router.push(`/overtime?${params.toString()}`)
  }

  const exportHref = (() => {
    const params = new URLSearchParams()
    params.set('from', range.from)
    params.set('to', range.to)
    if (siteId) params.set('site', siteId)
    return `/api/export/overtime?${params.toString()}`
  })()

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Hours worked"
          value={totals.hours}
          unit="hrs"
          icon="clock"
          tone="brand"
          hint="In the selected period"
        />
        <StatCard
          label="Prep sessions"
          value={totals.sessions}
          icon="chef-hat"
          tone="neutral"
          hint={totals.open > 0 ? `${totals.open} still running` : 'All clocked out'}
        />
        <StatCard
          label="Average session"
          value={totals.average}
          unit="hrs"
          icon="activity"
          tone={totals.average > 4.5 ? 'warning' : 'success'}
          hint="Target window is 7–11am"
        />
        <StatCard
          label={isManager ? 'Staff' : 'Your sessions'}
          value={isManager ? totals.staff : totals.complete}
          icon={isManager ? 'users' : 'user'}
          tone="neutral"
        />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <SegmentedControl
          aria-label="Overtime view"
          value={view}
          onChange={(value) => setView(value as 'monthly' | 'sessions')}
          options={[
            { value: 'monthly', label: 'Monthly summary', icon: 'bar-chart' },
            { value: 'sessions', label: 'Every session', icon: 'list' },
          ]}
        />

        <div className="flex flex-wrap items-end gap-2.5">
          <DateRangePicker
            from={range.from}
            to={range.to}
            onChange={setRange}
            size="sm"
            containerClassName="min-w-[13rem]"
          />
          {isManager ? (
            <Button
              variant="secondary"
              size="md"
              leadingIcon="download"
              onClick={() => {
                window.location.href = exportHref
              }}
            >
              Export CSV
            </Button>
          ) : null}
        </div>
      </div>

      {view === 'monthly' ? (
        <Card padded={false}>
          <div className="border-b border-border p-5">
            <CardHeader
              className="mb-0"
              eyebrow="For payroll"
              title="Hours by staff member, by month"
              description="Export this as CSV and hand it straight to whoever runs payroll."
            />
          </div>

          <Table
            rows={summaries}
            rowKey={(row) => `${row.staffId}:${row.month}`}
            className="rounded-none border-0"
            stickyHeader={false}
            empty={{
              icon: 'history',
              title: 'No prep sessions in this period',
              description: 'Hours appear here once a prep session has been started and finished.',
            }}
            columns={[
              {
                key: 'month',
                header: 'Month',
                cell: (row) => (
                  <span className="font-medium text-ink">
                    {formatDateOnly(`${row.month}-01`, 'MMMM yyyy')}
                  </span>
                ),
              },
              {
                key: 'staff',
                header: 'Staff member',
                cell: (row) => (
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink">{row.staffName}</span>
                    <Badge tone="neutral" size="sm">
                      {row.siteName}
                    </Badge>
                  </div>
                ),
              },
              {
                key: 'sessions',
                header: 'Sessions',
                align: 'right',
                cell: (row) => <span className="text-ink-muted">{row.sessions}</span>,
              },
              {
                key: 'hours',
                header: 'Hours',
                align: 'right',
                cell: (row) => (
                  <div className="flex flex-col items-end gap-1">
                    <span className="font-semibold text-ink">{row.hours.toFixed(2)}</span>
                    <ProgressBar
                      className="w-24"
                      size="sm"
                      value={row.hours}
                      max={peakMonthHours}
                      tone="brand"
                    />
                  </div>
                ),
              },
            ]}
          />
        </Card>
      ) : (
        <Table
          rows={rows}
          rowKey={(row) => row.session_id}
          caption="Prep sessions"
          rowTone={(row) => (row.ended_at ? 'default' : 'warning')}
          empty={{
            icon: 'clock',
            title: 'No sessions logged',
            description: 'Start a prep session from the checklist and it will be recorded here.',
          }}
          columns={[
            {
              key: 'date',
              header: 'Prep date',
              sortable: true,
              cell: (row) => (
                <span className="font-medium text-ink">{formatShort(row.prep_date)}</span>
              ),
            },
            {
              key: 'staff',
              header: 'Staff',
              cell: (row) => <span className="text-ink">{row.staff_name}</span>,
            },
            {
              key: 'site',
              header: 'Site',
              hideOnMobile: true,
              cell: (row) => (
                <span className="inline-flex items-center gap-1.5 text-ink-muted">
                  <Icon name="map-pin" size={13} />
                  {row.site_name}
                </span>
              ),
            },
            {
              key: 'times',
              header: 'Clocked',
              cell: (row) => (
                <span className="text-ink-muted">
                  {formatTimeOfDay(row.started_at)} –{' '}
                  {row.ended_at ? formatTimeOfDay(row.ended_at) : '…'}
                </span>
              ),
            },
            {
              key: 'hours',
              header: 'Hours',
              align: 'right',
              cell: (row) =>
                row.ended_at ? (
                  <span className="font-semibold text-ink">
                    {Number(row.hours_worked).toFixed(2)}
                  </span>
                ) : (
                  <Badge tone="warning" size="sm" icon="clock">
                    running
                  </Badge>
                ),
            },
          ]}
        />
      )}
    </div>
  )
}
