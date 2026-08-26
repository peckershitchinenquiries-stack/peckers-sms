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
  Table,
  Tooltip,
  useToast,
} from '@/components/ui'
import { PackBadge } from '@/components/app/StatusPills'
import { logBatch } from '@/lib/actions/batches'
import {
  formatRelativeDay,
  formatShort,
  isPrepDay,
  sealedExpiryFor,
  today,
  type DateOnly,
} from '@/lib/date'
import { packVolume } from '@/lib/forecast/packing'
import { formatMl } from '@/lib/utils/volume'
import type { BatchRow } from '@/lib/queries/activity'
import type { PrepVsPlanRow } from '@/lib/types/database'

export interface BatchLogProps {
  siteId: string | null
  siteName: string
  showSiteColumn: boolean
  batches: BatchRow[]
  comparison: PrepVsPlanRow[]
  sauces: Array<{ id: string; name: string; sealedShelfLifeDays: number }>
  range: { from: DateOnly; to: DateOnly }
  bagSizesMl: number[]
  prepWeekdays: number[]
}

export function BatchLog({
  siteId,
  siteName,
  showSiteColumn,
  batches,
  comparison,
  sauces,
  range,
  bagSizesMl,
  prepWeekdays,
}: BatchLogProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const [view, setView] = React.useState<'history' | 'comparison'>('history')
  const [logOpen, setLogOpen] = React.useState(false)
  const [busy, startTransition] = React.useTransition()

  const [form, setForm] = React.useState<{
    sauceId: string | null
    targetMl: number
    pack: Record<number, number>
    prepDate: DateOnly
  }>({ sauceId: null, targetMl: 6000, pack: packVolume(6000, bagSizesMl).counts, prepDate: today() })

  const totals = React.useMemo(
    () => ({
      bags: batches.reduce((sum, batch) => sum + batch.totalBags, 0),
      ml: batches.reduce((sum, batch) => sum + batch.totalMl, 0),
      live: batches.reduce((sum, batch) => sum + batch.sealed + batch.opened, 0),
      used: batches.reduce((sum, batch) => sum + batch.used, 0),
      discarded: batches.reduce((sum, batch) => sum + batch.discarded, 0),
      wastedMl: batches.reduce((sum, batch) => sum + batch.wastedMl, 0),
    }),
    [batches],
  )

  // By volume, not by bag count: a 2L bag binned with 200ml left is a very
  // different loss from one binned full, and counting bags hid that.
  const wastePercent =
    totals.ml > 0 ? Math.round((totals.wastedMl / totals.ml) * 1000) / 10 : 0

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

  const setTargetMl = (targetMl: number) => {
    setForm((current) => ({ ...current, targetMl, pack: packVolume(targetMl, bagSizesMl).counts }))
  }

  const setPackCount = (size: number, count: number) => {
    setForm((current) => ({ ...current, pack: { ...current.pack, [size]: Math.max(0, count) } }))
  }

  const packTotals = React.useMemo(() => {
    const totalBags = Object.values(form.pack).reduce((sum, count) => sum + count, 0)
    const totalMl = Object.entries(form.pack).reduce(
      (sum, [size, count]) => sum + Number(size) * count,
      0,
    )
    return { totalBags, totalMl }
  }, [form.pack])

  const submit = () => {
    if (!form.sauceId) return
    const sauce = sauces.find((candidate) => candidate.id === form.sauceId)

    startTransition(async () => {
      const result = await logBatch({
        sauceId: form.sauceId!,
        siteId: siteId ?? undefined,
        prepDate: form.prepDate,
        pack: form.pack,
      })

      if (!result.ok) {
        toast({ tone: 'danger', title: 'Could not log the batch', description: result.error })
        return
      }

      toast({
        tone: 'success',
        title: `${formatMl(result.data?.createdMl ?? 0)} of ${sauce?.name ?? 'sauce'} logged`,
        description: `Each bag expires ${formatShort(result.data?.sealedExpiry ?? sealedExpiryFor(form.prepDate, sauce?.sealedShelfLifeDays))}.`,
      })
      setLogOpen(false)
      setForm((current) => ({
        ...current,
        sauceId: null,
        targetMl: 6000,
        pack: packVolume(6000, bagSizesMl).counts,
      }))
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Volume made" value={formatMl(totals.ml)} icon="package" tone="brand" hint={`${totals.bags} bags · in this period`} />
        <StatCard label="Still live" value={totals.live} unit="bags" icon="clock" tone="success" hint="Sealed or opened" />
        <StatCard label="Used" value={totals.used} unit="bags" icon="check-circle" tone="neutral" />
        <StatCard
          label="Waste"
          value={wastePercent}
          unit="%"
          icon="trash"
          tone={wastePercent > 8 ? 'danger' : wastePercent > 4 ? 'warning' : 'success'}
          hint={`${formatMl(totals.wastedMl)} across ${totals.discarded} bag${totals.discarded === 1 ? '' : 's'}`}
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
                    {isPrepDay(row.prepDate, prepWeekdays) ? 'Scheduled prep' : 'Off-cycle'}
                  </span>
                </div>
              ),
            },
            {
              key: 'sauce',
              header: 'Sauce',
              cell: (row) => <span className="font-medium text-ink">{row.sauceName}</span>,
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
              key: 'pack',
              header: 'Pack',
              cell: (row) => <PackBadge counts={row.sizes} />,
            },
            {
              key: 'total',
              header: 'Made',
              align: 'right',
              cell: (row) => <span className="font-semibold text-ink">{formatMl(row.totalMl)}</span>,
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
                      {formatMl(row.wastedMl)} wasted
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
              Math.abs(row.variance_ml) >= 500 ? 'warning' : row.actual_ml === 0 ? 'danger' : 'default'
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
                    <span className="block text-2xs text-ink-subtle">
                      had to last {row.covers_days} days
                    </span>
                  </div>
                ),
              },
              {
                key: 'sauce',
                header: 'Sauce',
                cell: (row) => <span className="font-medium text-ink">{row.sauce_name}</span>,
              },
              {
                key: 'suggested',
                header: 'Forecast',
                align: 'right',
                hideOnMobile: true,
                cell: (row) => <span className="text-ink-muted">{formatMl(row.suggested_ml)}</span>,
              },
              {
                key: 'planned',
                header: 'Planned',
                align: 'right',
                cell: (row) => (
                  <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                    {formatMl(row.planned_ml)}
                    {row.override_ml !== null && row.override_ml !== row.suggested_ml ? (
                      <Tooltip content={`Manager overrode the forecast of ${formatMl(row.suggested_ml)}.`}>
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
                cell: (row) => <span className="font-semibold text-ink">{formatMl(row.actual_ml)}</span>,
              },
              {
                key: 'variance',
                header: 'Variance',
                align: 'right',
                cell: (row) => (
                  <Badge
                    size="sm"
                    tone={row.variance_ml === 0 ? 'success' : Math.abs(row.variance_ml) >= 500 ? 'danger' : 'warning'}
                    icon={
                      row.variance_ml === 0
                        ? 'check'
                        : row.variance_ml > 0
                          ? 'trending-up'
                          : 'trending-down'
                    }
                  >
                    {row.variance_ml > 0 ? `+${formatMl(row.variance_ml)}` : formatMl(row.variance_ml)}
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
        description={`One bag record is created per bag, each dated by the sauce's own shelf life. Logging to ${siteName}.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setLogOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={!form.sauceId || packTotals.totalBags < 1}
              onClick={submit}
            >
              Create {packTotals.totalBags} bags
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
            options={sauces.map((sauce) => ({ value: sauce.id, label: sauce.name }))}
          />

          <DatePicker
            label="Prep date"
            value={form.prepDate}
            onChange={(prepDate) => setForm((current) => ({ ...current, prepDate }))}
            highlightPrepDays
            prepWeekdays={prepWeekdays}
            hint={`Bags will be sealed until ${formatShort(
              sealedExpiryFor(
                form.prepDate,
                sauces.find((candidate) => candidate.id === form.sauceId)?.sealedShelfLifeDays,
              ),
            )}.`}
          />

          <div>
            <p className="mb-2 text-sm font-medium text-ink">Volume made</p>
            <input
              type="number"
              inputMode="numeric"
              step={100}
              min={0}
              value={form.targetMl}
              onChange={(event) => setTargetMl(Number(event.target.value) || 0)}
              className="h-11 w-full rounded-lg border border-border bg-surface px-3.5 text-sm font-semibold tabular-nums text-ink focus-ring-inset"
            />
            <p className="mt-1 text-2xs text-ink-subtle">
              Pack pre-filled with the least-wasteful mix — adjust below if needed.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {bagSizesMl.map((size) => {
              const count = form.pack[size] ?? 0
              return (
                <div
                  key={size}
                  className="flex items-center overflow-hidden rounded-lg border border-border bg-surface"
                >
                  <button
                    type="button"
                    disabled={count <= 0}
                    onClick={() => setPackCount(size, count - 1)}
                    aria-label={`Fewer ${size}ml bags`}
                    className="grid h-10 w-8 place-items-center text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink disabled:pointer-events-none disabled:opacity-40"
                  >
                    <Icon name="minus" size={13} />
                  </button>
                  <span className="w-16 text-center text-sm font-medium tabular-nums text-ink">
                    {count} × {size}ml
                  </span>
                  <button
                    type="button"
                    onClick={() => setPackCount(size, count + 1)}
                    aria-label={`More ${size}ml bags`}
                    className="grid h-10 w-8 place-items-center text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
                  >
                    <Icon name="plus" size={13} />
                  </button>
                </div>
              )
            })}
          </div>

          <div className="flex items-center justify-between rounded-lg bg-surface-sunken px-3.5 py-2.5 text-sm">
            <span className="text-ink-muted">Pack total</span>
            <span className="font-semibold tabular-nums text-ink">{formatMl(packTotals.totalMl)}</span>
          </div>
        </div>
      </Modal>
    </div>
  )
}
