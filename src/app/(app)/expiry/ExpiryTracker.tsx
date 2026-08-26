'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Icon,
  SegmentedControl,
  Select,
  StatCard,
  Table,
  useToast,
} from '@/components/ui'
import { BagSizeBadge, BagStatusBadge, ExpiryBadge } from '@/components/app/StatusPills'
import { setBagStatus, sweepExpiredStock } from '@/lib/actions/batches'
import { formatRelativeDay, formatShort, formatTimeOfDay } from '@/lib/date'
import { formatMl } from '@/lib/utils/volume'
import type { ExpirySummary, TrackedBag } from '@/lib/queries/stock'

type Filter = 'attention' | 'all' | 'sealed' | 'opened'

export interface ExpiryTrackerProps {
  bags: TrackedBag[]
  summary: ExpirySummary
  sauces: Array<{ id: string; name: string }>
  showSiteColumn: boolean
}

export function ExpiryTracker({
  bags,
  summary,
  sauces,
  showSiteColumn,
}: ExpiryTrackerProps) {
  const router = useRouter()
  const { toast } = useToast()

  const [filter, setFilter] = React.useState<Filter>('attention')
  const [sauceId, setSauceId] = React.useState<string | null>(null)
  const [pendingId, setPendingId] = React.useState<string | null>(null)
  const [discardAllOpen, setDiscardAllOpen] = React.useState(false)
  const [busy, startTransition] = React.useTransition()

  const visible = React.useMemo(() => {
    let rows = bags
    if (sauceId) rows = rows.filter((bag) => bag.sauceId === sauceId)

    switch (filter) {
      case 'attention':
        return rows.filter((bag) => bag.daysRemaining <= 2)
      case 'sealed':
        return rows.filter((bag) => bag.status === 'sealed')
      case 'opened':
        return rows.filter((bag) => bag.status === 'opened')
      default:
        return rows
    }
  }, [bags, filter, sauceId])

  const expired = React.useMemo(() => bags.filter((bag) => bag.level === 'expired'), [bags])
  const expiredMl = expired.reduce((sum, bag) => sum + bag.remainingMl, 0)

  const updateBag = (bag: TrackedBag, status: 'used' | 'discarded' | 'opened') => {
    setPendingId(bag.id)
    startTransition(async () => {
      const result = await setBagStatus({
        bagId: bag.id,
        status,
        reason: status === 'discarded' ? 'Expired or unusable' : undefined,
      })
      setPendingId(null)

      if (!result.ok) {
        toast({ tone: 'danger', title: 'Could not update', description: result.error })
        return
      }

      toast({
        tone: status === 'discarded' ? 'warning' : 'success',
        title:
          status === 'used'
            ? `${bag.sauceName} marked used`
            : status === 'opened'
              ? `${bag.sauceName} opened`
              : `${bag.sauceName} discarded`,
        description:
          status === 'opened'
            ? "This bag now runs on the sauce's opened shelf life, capped at its original sealed date."
            : undefined,
      })
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Expired"
          value={summary.expired}
          unit="bags"
          icon="alert-triangle"
          tone={summary.expired > 0 ? 'danger' : 'neutral'}
          hint={summary.expired > 0 ? 'Record these as waste' : 'Nothing overdue'}
        />
        <StatCard
          label="Expiring today"
          value={summary.today}
          unit="bags"
          icon="clock"
          tone={summary.today > 0 ? 'danger' : 'success'}
          hint={summary.today > 0 ? 'Use before close' : 'All clear'}
        />
        <StatCard
          label="1–2 days left"
          value={summary.soon}
          unit="bags"
          icon="alert-circle"
          tone={summary.soon > 0 ? 'warning' : 'neutral'}
          hint="Plan these into service"
        />
        <StatCard
          label="Healthy"
          value={summary.healthy}
          unit="bags"
          icon="check-circle"
          tone="success"
          hint="3+ days of life"
        />
      </div>

      <Card padded={false}>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <SegmentedControl
            aria-label="Filter bags"
            value={filter}
            onChange={(value) => setFilter(value as Filter)}
            options={[
              { value: 'attention', label: 'Needs attention', icon: 'alert-circle' },
              { value: 'all', label: 'All live stock', icon: 'package' },
              { value: 'sealed', label: 'Sealed' },
              { value: 'opened', label: 'Opened' },
            ]}
          />

          <div className="flex items-center gap-2.5">
            <Select
              value={sauceId}
              onChange={(value) => setSauceId(value === '__all' ? null : value)}
              placeholder="All sauces"
              size="sm"
              className="min-w-[11rem]"
              options={[
                { value: '__all', label: 'All sauces' },
                ...sauces.map((sauce) => ({ value: sauce.id, label: sauce.name })),
              ]}
            />
            {/* Open to everyone: the person clearing the fridge at close is
                rarely the manager, and unrecorded waste is invisible waste. */}
            {expired.length > 0 ? (
              <Button
                variant="destructive"
                size="sm"
                leadingIcon="trash"
                onClick={() => setDiscardAllOpen(true)}
              >
                Write off {expired.length} expired
              </Button>
            ) : null}
          </div>
        </div>

        <Table
          rows={visible}
          rowKey={(bag) => bag.id}
          rowTone={(bag) =>
            bag.level === 'expired' || bag.level === 'critical'
              ? 'danger'
              : bag.level === 'warning'
                ? 'warning'
                : 'default'
          }
          className="rounded-none border-0"
          stickyHeader={false}
          empty={{
            icon: filter === 'attention' ? 'check-circle' : 'package',
            tone: filter === 'attention' ? 'success' : 'neutral',
            title:
              filter === 'attention'
                ? 'Nothing needs using up'
                : 'No bags match that filter',
            description:
              filter === 'attention'
                ? 'Every bag here has 3 or more days of life left. Check back after the next prep.'
                : 'Try a different filter, or log a batch to add stock.',
          }}
          columns={[
            {
              key: 'sauce',
              header: 'Sauce',
              cell: (bag) => (
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink">{bag.sauceName}</span>
                  <BagSizeBadge sizeMl={bag.sizeMl} />
                  {/* What's actually left is what gets binned, and it's the
                      number staff need when deciding what to use up first. */}
                  {bag.remainingMl < bag.sizeMl ? (
                    <span className="text-2xs tabular-nums text-ink-subtle">
                      {formatMl(bag.remainingMl)} left
                    </span>
                  ) : null}
                </div>
              ),
            },
            ...(showSiteColumn
              ? [
                  {
                    key: 'site',
                    header: 'Site',
                    hideOnMobile: true,
                    cell: (bag: TrackedBag) => (
                      <span className="inline-flex items-center gap-1.5 text-ink-muted">
                        <Icon name="map-pin" size={13} />
                        {bag.siteName}
                      </span>
                    ),
                  },
                ]
              : []),
            {
              key: 'status',
              header: 'Status',
              cell: (bag) => (
                <div className="flex flex-col gap-1">
                  <BagStatusBadge status={bag.status} />
                  {bag.openedAt ? (
                    <span className="text-2xs text-ink-subtle">
                      opened {formatTimeOfDay(bag.openedAt)}
                    </span>
                  ) : null}
                </div>
              ),
            },
            {
              key: 'prep',
              header: 'Prepped',
              hideOnMobile: true,
              cell: (bag) => (
                <span className="text-ink-muted">{formatShort(bag.prepDate)}</span>
              ),
            },
            {
              key: 'expiry',
              header: 'Expires',
              cell: (bag) => (
                <div className="flex flex-col gap-1">
                  <ExpiryBadge level={bag.level} label={bag.label} size="sm" />
                  <span className="text-2xs text-ink-subtle">
                    {formatRelativeDay(bag.effectiveExpiry)}
                    {bag.status === 'opened' && bag.openedExpiry === bag.sealedExpiry
                      ? ' · capped at sealed date'
                      : ''}
                  </span>
                </div>
              ),
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              width: 'w-56',
              cell: (bag) => (
                <div className="flex justify-end gap-1.5">
                  {bag.status === 'sealed' ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      leadingIcon="droplet"
                      loading={busy && pendingId === bag.id}
                      onClick={() => updateBag(bag, 'opened')}
                    >
                      Open
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="secondary"
                    leadingIcon="check"
                    loading={busy && pendingId === bag.id}
                    onClick={() => updateBag(bag, 'used')}
                  >
                    Used
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    iconOnly
                    leadingIcon="trash"
                    aria-label={`Discard ${bag.sauceName}`}
                    loading={busy && pendingId === bag.id}
                    onClick={() => updateBag(bag, 'discarded')}
                  />
                </div>
              ),
            },
          ]}
        />

        {visible.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
            <p className="text-xs text-ink-muted">
              Showing {visible.length} of {bags.length} live bags
            </p>
            <div className="flex items-center gap-3">
              <Badge tone="success" size="sm" dot>
                3+ days
              </Badge>
              <Badge tone="warning" size="sm" dot>
                1–2 days
              </Badge>
              <Badge tone="danger" size="sm" dot>
                Today / expired
              </Badge>
            </div>
          </div>
        ) : null}
      </Card>

      <ConfirmDialog
        open={discardAllOpen}
        onClose={() => setDiscardAllOpen(false)}
        onConfirm={async () => {
          // The sweep re-checks dates server-side rather than trusting a list
          // of ids the page may have been holding for a while.
          const result = await sweepExpiredStock({})
          if (result.ok) {
            const { bags: swept, ml } = result.data!
            toast({
              tone: swept > 0 ? 'warning' : 'success',
              title:
                swept > 0 ? `${formatMl(ml)} recorded as waste` : 'Nothing needed writing off',
              description:
                swept > 0
                  ? `${swept} bag${swept === 1 ? '' : 's'} removed from live stock. The figure shows on the wastage report.`
                  : 'Everything on the shelf is still within its date.',
            })
            router.refresh()
          } else {
            toast({ tone: 'danger', title: 'Could not write off', description: result.error })
          }
        }}
        title={`Write off ${expired.length} expired bag${expired.length === 1 ? '' : 's'}?`}
        description={`${formatMl(expiredMl)} is still in them. That volume will be recorded as waste against today and removed from live stock.`}
        confirmLabel="Record as waste"
        tone="destructive"
      />
    </div>
  )
}
