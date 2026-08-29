'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Icon,
  ProgressBar,
  SegmentedControl,
  StatCard,
  Stepper,
  Table,
  Tooltip,
  useToast,
} from '@/components/ui'
import { StockBadge } from '@/components/app/StatusPills'
import { recordUsage, undoUsageLog } from '@/lib/actions/usage'
import { UNDO_WINDOW_MINUTES } from '@/lib/actions/types'
import {
  daysUntilNextPrep,
  formatRelativeDay,
  formatShort,
  nextPrepDayAfter,
  today,
  WEEKDAY_SHORT,
  weekdayOf,
  type DateOnly,
} from '@/lib/date'
import { motion as motionTokens } from '@/lib/design/tokens'
import { formatMl } from '@/lib/utils/volume'
import type { UsageEntry } from '@/lib/queries/activity'
import type { LiveStockRow } from '@/lib/types/database'

export interface UsageLoggerProps {
  siteId: string | null
  siteName: string
  showSiteColumn: boolean
  stock: LiveStockRow[]
  burnRates: Record<string, number>
  loggedToday: Record<string, number>
  recent: UsageEntry[]
  dailyTotals: Array<{ date: DateOnly; ml: number }>
  isManager: boolean
  currentUserId: string
  prepWeekdays: number[]
}

/** Whoever logged an entry can undo it themselves for a short window; a manager can undo anything, any time. */
function canUndo(row: UsageEntry, currentUserId: string, isManager: boolean): boolean {
  if (isManager) return true
  if (row.logged_by !== currentUserId) return false
  return Date.now() - new Date(row.created_at).getTime() < UNDO_WINDOW_MINUTES * 60_000
}

export function UsageLogger({
  siteId,
  siteName,
  showSiteColumn,
  stock,
  burnRates,
  loggedToday,
  recent,
  dailyTotals,
  isManager,
  currentUserId,
  prepWeekdays,
}: UsageLoggerProps) {
  const router = useRouter()
  const { toast } = useToast()

  const [view, setView] = React.useState<'log' | 'history'>('log')
  const [quantities, setQuantities] = React.useState<Record<string, number>>({})
  const [pendingSauce, setPendingSauce] = React.useState<string | null>(null)
  const [busy, startTransition] = React.useTransition()
  const [confirmUndo, setConfirmUndo] = React.useState<UsageEntry | null>(null)

  const asOf = today()
  const daysToRestock = daysUntilNextPrep(asOf, prepWeekdays)
  const nextPrep = nextPrepDayAfter(asOf, prepWeekdays)

  // One row per sauce at the site being written to.
  const rows = React.useMemo(() => {
    const bySauce = new Map<string, LiveStockRow & { burnRate: number; logged: number }>()

    for (const row of stock) {
      if (siteId && row.site_id !== siteId) continue
      const existing = bySauce.get(row.sauce_id)
      if (existing) {
        existing.usable_ml += row.usable_ml
        existing.sealed_ml += row.sealed_ml
        existing.opened_ml += row.opened_ml
        existing.usable_bags += row.usable_bags
        existing.sealed_bags += row.sealed_bags
        existing.opened_bags += row.opened_bags
        existing.par_level_ml += row.par_level_ml
        continue
      }
      bySauce.set(row.sauce_id, {
        ...row,
        burnRate: burnRates[row.sauce_id] ?? 0,
        logged: loggedToday[row.sauce_id] ?? 0,
      })
    }

    return Array.from(bySauce.values()).sort((a, b) => a.sauce_name.localeCompare(b.sauce_name))
  }, [stock, siteId, burnRates, loggedToday])

  const totals = React.useMemo(() => {
    const loggedMl = Object.values(loggedToday).reduce((sum, value) => sum + value, 0)
    const atRisk = rows.filter(
      (row) => row.burnRate > 0 && row.usable_ml < row.burnRate * daysToRestock,
    ).length
    return {
      loggedMl,
      loggedSauces: Object.keys(loggedToday).length,
      atRisk,
      totalStockMl: rows.reduce((sum, row) => sum + row.usable_ml, 0),
    }
  }, [loggedToday, rows, daysToRestock])

  const peakDaily = Math.max(...dailyTotals.map((day) => day.ml), 1)

  const submit = (sauceId: string, sauceName: string) => {
    const ml = quantities[sauceId] ?? 0
    if (ml < 1) return

    setPendingSauce(sauceId)
    startTransition(async () => {
      const result = await recordUsage({ sauceId, ml, siteId: siteId ?? undefined })
      setPendingSauce(null)

      if (!result.ok) {
        toast({ tone: 'danger', title: 'Could not log usage', description: result.error })
        return
      }

      const shortfallMl = result.data?.shortfall_ml ?? 0
      toast({
        tone: shortfallMl > 0 ? 'warning' : 'success',
        title: `${formatMl(ml)} of ${sauceName} logged`,
        description:
          shortfallMl > 0
            ? `Only ${formatMl(result.data?.consumed_ml ?? 0)} was on the shelf — ${formatMl(shortfallMl)} more was used than the system had recorded. Check the batch log.`
            : 'Taken from the oldest stock first. Opened bags now have 2 days of life, capped at their sealed date.',
      })

      setQuantities((current) => ({ ...current, [sauceId]: 0 }))
      router.refresh()
    })
  }

  const undo = async (row: UsageEntry) => {
    const result = await undoUsageLog({
      usageLogId: row.id,
      loggedBy: row.logged_by,
      createdAt: row.created_at,
    })

    if (!result.ok) {
      toast({ tone: 'danger', title: 'Could not undo', description: result.error })
      return
    }

    const unrecoverableMl = result.data?.ml_unrecoverable ?? 0
    toast({
      tone: unrecoverableMl > 0 ? 'warning' : 'success',
      title: `${formatMl(row.ml_used)} of ${row.sauceName} undone`,
      description:
        unrecoverableMl > 0
          ? `${formatMl(result.data?.ml_restored_to_stock ?? 0)} went back on the shelf. ${formatMl(unrecoverableMl)} couldn't be recovered — that stock has since expired.`
          : 'Put back on the shelf and removed from the log.',
    })
    router.refresh()
  }

  if (!siteId) {
    return (
      <EmptyState
        icon="map-pin"
        title="No site assigned"
        description="Your account isn't linked to a kitchen. Ask a manager to set this in Settings → Staff."
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Logged today"
          value={formatMl(totals.loggedMl)}
          icon="clipboard-list"
          tone="brand"
          hint={`${totals.loggedSauces} sauce${totals.loggedSauces === 1 ? '' : 's'} recorded`}
        />
        <StatCard
          label="Live stock"
          value={formatMl(totals.totalStockMl)}
          icon="package"
          tone="neutral"
          hint={siteName}
        />
        <StatCard
          label="Won't reach restock"
          value={totals.atRisk}
          unit="sauces"
          icon="trending-down"
          tone={totals.atRisk > 0 ? 'danger' : 'success'}
          hint={`Next prep ${formatShort(nextPrep.date)}`}
        />
        <StatCard
          label="Days to next prep"
          value={daysToRestock}
          unit={daysToRestock === 1 ? 'day' : 'days'}
          icon="calendar"
          tone="neutral"
          hint={formatRelativeDay(nextPrep.date)}
        />
      </div>

      <SegmentedControl
        aria-label="Usage view"
        value={view}
        onChange={(value) => setView(value as 'log' | 'history')}
        options={[
          { value: 'log', label: "Log today's usage", icon: 'plus' },
          { value: 'history', label: 'History', icon: 'history' },
        ]}
      />

      {view === 'log' ? (
        <Card padded={false}>
          <div className="border-b border-border p-5">
            <CardHeader
              className="mb-0"
              eyebrow={formatRelativeDay(asOf)}
              title={`Volume used at ${siteName}`}
              description="Enter the ml used, then Log. Logging the same sauce twice adds to the day's total rather than replacing it."
            />
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon="package"
              title="No sauces to log"
              description="Add sauces in Settings and they'll appear here."
            />
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((row, index) => {
                const willRunOut =
                  row.burnRate > 0 && row.usable_ml < row.burnRate * daysToRestock
                const quantity = quantities[row.sauce_id] ?? 0

                return (
                  <motion.li
                    key={row.sauce_id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{
                      delay: Math.min(index * 0.015, 0.2),
                      duration: motionTokens.duration.base,
                    }}
                    className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-ink">{row.sauce_name}</span>
                        {row.logged > 0 ? (
                          <Badge tone="success" size="sm" icon="check">
                            {formatMl(row.logged)} today
                          </Badge>
                        ) : null}
                        {willRunOut ? (
                          <Tooltip content={`Using ~${formatMl(row.burnRate)}/day with ${daysToRestock} days until restock.`}>
                            <span>
                              <Badge tone="danger" size="sm" icon="trending-down">
                                short
                              </Badge>
                            </span>
                          </Tooltip>
                        ) : null}
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
                        <StockBadge usable={row.usable_ml} par={row.par_level_ml} size="sm" />
                        <span>
                          {row.sealed_bags} sealed · {row.opened_bags} open
                        </span>
                        <span>~{formatMl(row.burnRate)}/day</span>
                      </div>

                      <ProgressBar
                        className="mt-2.5 max-w-sm"
                        size="sm"
                        value={row.usable_ml}
                        max={Math.max(row.par_level_ml, row.usable_ml, 1)}
                        marker={row.par_level_ml > 0 ? row.par_level_ml : undefined}
                        tone={
                          willRunOut
                            ? 'danger'
                            : row.par_level_ml > 0 && row.usable_ml < row.par_level_ml * 0.6
                              ? 'warning'
                              : 'success'
                        }
                      />
                    </div>

                    <div className="flex items-center gap-2.5 sm:shrink-0">
                      <Stepper
                        value={quantity}
                        onChange={(value) =>
                          setQuantities((current) => ({ ...current, [row.sauce_id]: value }))
                        }
                        min={0}
                        max={50_000}
                        step={100}
                        unit="ml"
                      />
                      <Button
                        size="lg"
                        leadingIcon="check"
                        disabled={quantity < 1}
                        loading={busy && pendingSauce === row.sauce_id}
                        onClick={() => submit(row.sauce_id, row.sauce_name)}
                      >
                        Log
                      </Button>
                    </div>
                  </motion.li>
                )
              })}
            </ul>
          )}
        </Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader
              eyebrow="Last 14 days"
              title="Volume used per day"
              description="The shape of demand — weekends and Fridays usually run hottest."
            />
            <div className="flex h-40 items-end gap-1.5">
              {dailyTotals.map((day, index) => (
                <div key={day.date} className="flex flex-1 flex-col items-center gap-1.5">
                  <Tooltip
                    content={
                      <>
                        <strong>{formatMl(day.ml)}</strong> on {formatShort(day.date)}
                      </>
                    }
                  >
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${Math.max((day.ml / peakDaily) * 100, 3)}%` }}
                      transition={{
                        delay: index * 0.02,
                        duration: motionTokens.duration.slower,
                        ease: motionTokens.ease.out,
                      }}
                      className={`w-full rounded-t-md ${
                        day.date === asOf ? 'bg-brand' : 'bg-brand/35'
                      }`}
                      style={{ minHeight: 4 }}
                    />
                  </Tooltip>
                  <span className="text-2xs text-ink-subtle">
                    {WEEKDAY_SHORT[weekdayOf(day.date)][0]}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Table
            rows={recent}
            rowKey={(row) => row.id}
            caption="Recent usage logs"
            empty={{
              icon: 'clipboard-list',
              title: 'No usage logged yet',
              description: 'Switch to “Log today’s usage” and record the first volume of the day.',
            }}
            columns={[
              {
                key: 'date',
                header: 'Date',
                cell: (row) => (
                  <div>
                    <span className="font-medium text-ink">{formatRelativeDay(row.usage_date)}</span>
                    <span className="block text-2xs text-ink-subtle">
                      {formatShort(row.usage_date)}
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
                      cell: (row: UsageEntry) => (
                        <span className="inline-flex items-center gap-1.5 text-ink-muted">
                          <Icon name="map-pin" size={13} />
                          {row.siteName}
                        </span>
                      ),
                    },
                  ]
                : []),
              {
                key: 'ml',
                header: 'Volume used',
                align: 'right',
                cell: (row) => <span className="font-semibold text-ink">{formatMl(row.ml_used)}</span>,
              },
              ...(isManager
                ? [
                    {
                      key: 'by',
                      header: 'Logged by',
                      hideOnMobile: true,
                      cell: (row: UsageEntry) => (
                        <span className="text-ink-muted">{row.loggedByName ?? '—'}</span>
                      ),
                    },
                  ]
                : []),
              {
                key: 'undo',
                header: '',
                align: 'right',
                width: 'w-10',
                cell: (row) =>
                  canUndo(row, currentUserId, isManager) ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      iconOnly
                      leadingIcon="refresh-cw"
                      aria-label={`Undo ${row.sauceName} logged ${formatRelativeDay(row.usage_date)}`}
                      onClick={() => setConfirmUndo(row)}
                    />
                  ) : null,
              },
            ]}
          />
        </div>
      )}

      <ConfirmDialog
        open={confirmUndo !== null}
        onClose={() => setConfirmUndo(null)}
        onConfirm={() => (confirmUndo ? undo(confirmUndo) : undefined)}
        title="Undo this entry?"
        description={
          confirmUndo
            ? `This removes ${formatMl(confirmUndo.ml_used)} of ${confirmUndo.sauceName} from the log and puts it back on the shelf where possible.`
            : undefined
        }
        confirmLabel="Undo entry"
        tone="destructive"
      />
    </div>
  )
}

