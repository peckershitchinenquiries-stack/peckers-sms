'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DatePicker,
  DateRangePicker,
  Icon,
  Modal,
  SegmentedControl,
  Select,
  StatCard,
  Stepper,
  Table,
  Tooltip,
  useToast,
} from '@/components/ui'
import { BagSizeBadge } from '@/components/app/StatusPills'
import { logBatch } from '@/lib/actions/batches'
import {
  formatRelativeDay,
  formatShort,
  isPrepDay,
  sealedExpiryFor,
  today,
  type DateOnly,
} from '@/lib/date'
import type { BatchRow } from '@/lib/queries/activity'
import type { PrepVsPlanRow } from '@/lib/types/database'

export interface BatchLogProps {
  siteId: string | null
  siteName: string
  showSiteColumn: boolean
  batches: BatchRow[]
  comparison: PrepVsPlanRow[]
  sauces: Array<{ id: string; name: string; bagSize: '1L' | '2L' }>
  range: { from: DateOnly; to: DateOnly }
}

export function BatchLog({
  siteId,
  siteName,
  showSiteColumn,
  batches,
  comparison,
  sauces,
  range,
}: BatchLogProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const [view, setView] = React.useState<'history' | 'comparison'>('history')
  const [logOpen, setLogOpen] = React.useState(false)
  const [busy, startTransition] = React.useTransition()

  const [form, setForm] = React.useState<{
    sauceId: string | null
    quantity: number
    prepDate: DateOnly
  }>({ sauceId: null, quantity: 6, prepDate: today() })

  const totals = React.useMemo(
    () => ({
      bags: batches.reduce((sum, batch) => sum + batch.totalBags, 0),
      live: batches.reduce((sum, batch) => sum + batch.sealed + batch.opened, 0),
      used: batches.reduce((sum, batch) => sum + batch.used, 0),
      discarded: batches.reduce((sum, batch) => sum + batch.discarded, 0),
    }),
    [batches],
  )

  const wastePercent =
    totals.bags > 0 ? Math.round((totals.discarded / totals.bags) * 1000) / 10 : 0

  const setRange = (next: { from: DateOnly | null; to: DateOnly | null }) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next.from) params.set('from', next.from)
    else params.delete('from')
    if (next.to) params.set('to', next.to)
    else params.delete('to')
    router.push(`/batches?${params.toString()}`)
  }

  const setSauceFilter = (sauceId: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (sauceId === '__all') params.delete('sauce')
    else params.set('sauce', sauceId)
    router.push(`/batches?${params.toString()}`)
  }

  const submit = () => {
    if (!form.sauceId) return
    const sauce = sauces.find((candidate) => candidate.id === form.sauceId)

    startTransition(async () => {
      const result = await logBatch({
        sauceId: form.sauceId!,
        siteId: siteId ?? undefined,
        prepDate: form.prepDate,
        quantity: form.quantity,
      })

      if (!result.ok) {
        toast({ tone: 'danger', title: 'Could not log the batch', description: result.error })
        return
      }

      toast({
        tone: 'success',
        title: `${form.quantity} bags of ${sauce?.name ?? 'sauce'} logged`,
        description: `Each bag expires ${formatShort(sealedExpiryFor(form.prepDate))}.`,
      })
      setLogOpen(false)
      setForm((current) => ({ ...current, sauceId: null, quantity: 6 }))
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Bags made" value={totals.bags} unit="bags" icon="package" tone="brand" hint="In this period" />
        <StatCard label="Still live" value={totals.live} unit="bags" icon="clock" tone="success" hint="Sealed or opened" />
        <StatCard label="Used" value={totals.used} unit="bags" icon="check-circle" tone="neutral" />
        <StatCard
          label="Waste"
          value={wastePercent}
          unit="%"
          icon="trash"
          tone={wastePercent > 8 ? 'danger' : wastePercent > 4 ? 'warning' : 'success'}
          hint={`${totals.discarded} bags discarded`}
        />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <SegmentedControl
          aria-label="Batch view"
          value={view}
          onChange={(value) => setView(value as 'history' | 'comparison')}
          options={[
            { value: 'history', label: 'Batch history', icon: 'history' },
            { value: 'comparison', label: 'Prep vs plan', icon: 'scale' },
          ]}
        />

        <div className="flex flex-wrap items-end gap-2.5">
          <Select
            value={searchParams.get('sauce') ?? '__all'}
            onChange={setSauceFilter}
            size="sm"
            className="min-w-[10rem]"
            options={[
              { value: '__all', label: 'All sauces' },
              ...sauces.map((sauce) => ({ value: sauce.id, label: sauce.name })),
            ]}
          />
          <DateRangePicker
            from={range.from}
            to={range.to}
            onChange={setRange}
            size="sm"
            containerClassName="min-w-[13rem]"
          />
          <Button leadingIcon="plus" size="md" onClick={() => setLogOpen(true)}>
            Log a batch
          </Button>
        </div>
      </div>

      {view === 'history' ? (
        <Table
          rows={batches}
          rowKey={(row) => `${row.prepDate}:${row.siteId}:${row.sauceId}`}
          caption="Batch history"
          empty={{
            icon: 'package',
            title: 'No batches in this period',
            description: 'Widen the date range, or log the bags made in the last prep session.',
            action: (
              <Button leadingIcon="plus" onClick={() => setLogOpen(true)}>
                Log a batch
              </Button>
            ),
          }}
          columns={[
            {
              key: 'date',
              header: 'Prep date',
              sortable: true,
              cell: (row) => (
                <div>
                  <span className="font-medium text-ink">{formatShort(row.prepDate)}</span>
                  <span className="block text-2xs text-ink-subtle">
                    {isPrepDay(row.prepDate) ? 'Scheduled prep' : 'Off-cycle'}
                  </span>
                </div>
              ),
            },
            {
              key: 'sauce',
              header: 'Sauce',
              cell: (row) => (
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink">{row.sauceName}</span>
                  <BagSizeBadge size={row.bagSize} />
                </div>
              ),
            },
            ...(showSiteColumn
              ? [
                  {
                    key: 'site',
                    header: 'Site',
                    hideOnMobile: true,
                    cell: (row: BatchRow) => (
                      <span className="inline-flex items-center gap-1.5 text-ink-muted">
                        <Icon name="map-pin" size={13} />
                        {row.siteName}
                      </span>
                    ),
                  },
                ]
              : []),
            {
              key: 'total',
              header: 'Made',
              align: 'right',
              cell: (row) => <span className="font-semibold text-ink">{row.totalBags}</span>,
            },
            {
              key: 'breakdown',
              header: 'Where they went',
              cell: (row) => (
                <div className="flex flex-wrap gap-1.5">
                  {row.sealed > 0 ? (
                    <Badge tone="brand" size="sm" dot>
                      {row.sealed} sealed
                    </Badge>
                  ) : null}
                  {row.opened > 0 ? (
                    <Badge tone="warning" size="sm" dot>
                      {row.opened} open
                    </Badge>
                  ) : null}
                  {row.used > 0 ? (
                    <Badge tone="neutral" size="sm" dot>
                      {row.used} used
                    </Badge>
                  ) : null}
                  {row.discarded > 0 ? (
                    <Badge tone="danger" size="sm" icon="trash">
                      {row.discarded}
                    </Badge>
                  ) : null}
                </div>
              ),
            },
            {
              key: 'expiry',
              header: 'Sealed until',
              align: 'right',
              hideOnMobile: true,
              cell: (row) => (
                <span className="text-ink-muted">{formatRelativeDay(row.sealedExpiry)}</span>
              ),
            },
          ]}
        />
      ) : (
        <Card padded={false}>
          <div className="border-b border-border p-5">
            <CardHeader
              className="mb-0"
              eyebrow="Accuracy"
              title="Planned vs actually made"
              description="Consistent overs mean the par level is too high; consistent unders usually mean the forecast is being ignored."
            />
          </div>
          <Table
            rows={comparison}
            rowKey={(row) => `${row.plan_id}:${row.sauce_id}`}
            className="rounded-none border-0"
            stickyHeader={false}
            rowTone={(row) =>
              Math.abs(row.variance) >= 5 ? 'warning' : row.actual_bags === 0 ? 'danger' : 'default'
            }
            empty={{
              icon: 'scale',
              title: 'No plans to compare yet',
              description: 'Build a forecast in the Prep planner, then log the batch it produced.',
            }}
            columns={[
              {
                key: 'date',
                header: 'Prep date',
                cell: (row) => (
                  <div>
                    <span className="font-medium text-ink">{formatShort(row.prep_date)}</span>
                    <span className="block text-2xs capitalize text-ink-subtle">
                      {row.prep_type} · {row.prep_type === 'tuesday' ? '3' : '4'}-day cover
                    </span>
                  </div>
                ),
              },
              {
                key: 'sauce',
                header: 'Sauce',
                cell: (row) => (
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink">{row.sauce_name}</span>
                    <BagSizeBadge size={row.bag_size} />
                  </div>
                ),
              },
              {
                key: 'suggested',
                header: 'Forecast',
                align: 'right',
                hideOnMobile: true,
                cell: (row) => <span className="text-ink-muted">{row.suggested_bags}</span>,
              },
              {
                key: 'planned',
                header: 'Planned',
                align: 'right',
                cell: (row) => (
                  <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                    {row.planned_bags}
                    {row.override_bags !== null && row.override_bags !== row.suggested_bags ? (
                      <Tooltip content={`Manager overrode the forecast of ${row.suggested_bags}.`}>
                        <span className="text-brand">
                          <Icon name="edit" size={12} />
                        </span>
                      </Tooltip>
                    ) : null}
                  </span>
                ),
              },
              {
                key: 'actual',
                header: 'Made',
                align: 'right',
                cell: (row) => <span className="font-semibold text-ink">{row.actual_bags}</span>,
              },
              {
                key: 'variance',
                header: 'Variance',
                align: 'right',
                cell: (row) => (
                  <Badge
                    size="sm"
                    tone={row.variance === 0 ? 'success' : Math.abs(row.variance) >= 5 ? 'danger' : 'warning'}
                    icon={
                      row.variance === 0
                        ? 'check'
                        : row.variance > 0
                          ? 'trending-up'
                          : 'trending-down'
                    }
                  >
                    {row.variance > 0 ? `+${row.variance}` : row.variance}
                  </Badge>
                ),
              },
            ]}
          />
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      <Modal
        open={logOpen}
        onClose={() => setLogOpen(false)}
        title="Log a batch"
        description={`One bag record is created per bag, each with a 5-day sealed expiry. Logging to ${siteName}.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setLogOpen(false)}>
              Cancel
            </Button>
            <Button loading={busy} disabled={!form.sauceId} onClick={submit}>
              Create {form.quantity} bags
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <Select
            label="Sauce"
            required
            value={form.sauceId}
            onChange={(sauceId) => setForm((current) => ({ ...current, sauceId }))}
            placeholder="Choose a sauce"
            options={sauces.map((sauce) => ({
              value: sauce.id,
              label: sauce.name,
              description: `${sauce.bagSize} bags`,
            }))}
          />

          <DatePicker
            label="Prep date"
            value={form.prepDate}
            onChange={(prepDate) => setForm((current) => ({ ...current, prepDate }))}
            highlightPrepDays
            hint={`Bags will be sealed until ${formatShort(sealedExpiryFor(form.prepDate))}.`}
          />

          <Stepper
            label="Bags made"
            value={form.quantity}
            onChange={(quantity) => setForm((current) => ({ ...current, quantity }))}
            min={1}
            max={500}
            unit="bags"
          />
        </div>
      </Modal>
    </div>
  )
}
