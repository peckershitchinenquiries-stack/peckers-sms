'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Badge,
  Button,
  Callout,
  Card,
  CardHeader,
  Drawer,
  EmptyState,
  Icon,
  ProgressBar,
  Select,
  StatCard,
  Stepper,
  Table,
  Tooltip,
  useToast,
} from '@/components/ui'
import { PackBadge } from '@/components/app/StatusPills'
import { ForecastExplainer } from './ForecastExplainer'
import { generatePlan, resetPlanOverrides, setPlanItemOverride, setPlanStatus } from '@/lib/actions/planner'
import { formatShort, WEEKDAY_SHORT, weekdayOf, type DateOnly } from '@/lib/date'
import { motion as motionTokens } from '@/lib/design/tokens'
import { packVolume } from '@/lib/forecast/packing'
import { formatMl } from '@/lib/utils/volume'
import type { SauceForecast } from '@/lib/queries/planning'
import type { PlanView } from '@/lib/queries/planning'
import type { PrepTypeValue, Site } from '@/lib/types/database'

export interface PlannerBoardProps {
  site: Site
  sites: Site[]
  prepDate: DateOnly
  prepType: PrepTypeValue
  coversDays: number
  coverageDates: DateOnly[]
  forecasts: SauceForecast[]
  plan: PlanView | null
  windowDays: number
  bufferMultiplier: number
  bagSizesMl: number[]
}

export function PlannerBoard({
  site,
  sites,
  prepDate,
  prepType,
  coversDays,
  coverageDates,
  forecasts,
  plan,
  windowDays,
  bufferMultiplier,
  bagSizesMl,
}: PlannerBoardProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const [busy, startTransition] = React.useTransition()
  const [explaining, setExplaining] = React.useState<SauceForecast | null>(null)
  const [drafts, setDrafts] = React.useState<Record<string, number>>({})

  // Merge the live forecast with whatever is saved on the plan, so the manager
  // sees today's numbers alongside their own overrides.
  const rows = React.useMemo(() => {
    const planItems = new Map(plan?.items.map((item) => [item.sauceId, item]) ?? [])

    return forecasts.map((forecast) => {
      const item = planItems.get(forecast.sauceId)
      const override = item?.overrideMl ?? null
      const suggested = item?.suggestedMl ?? forecast.suggestedMl
      const final = drafts[forecast.sauceId] ?? override ?? suggested
      return {
        forecast,
        itemId: item?.id ?? null,
        suggested,
        override,
        final,
        pack: packVolume(final, bagSizesMl),
      }
    })
  }, [forecasts, plan, drafts, bagSizesMl])

  const totals = React.useMemo(
    () => ({
      suggested: rows.reduce((sum, row) => sum + row.suggested, 0),
      final: rows.reduce((sum, row) => sum + row.final, 0),
      wasteMl: rows.reduce((sum, row) => sum + row.pack.wasteMl, 0),
      lowStock: rows.filter((row) => row.forecast.lowStock).length,
      lowConfidence: rows.filter((row) => row.forecast.reasoning.confidence === 'low').length,
    }),
    [rows],
  )
  const wastePercent =
    totals.final > 0 ? Math.round((totals.wasteMl / totals.final) * 1000) / 10 : 0

  const changeSite = (siteId: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('site', siteId)
    router.push(`/planner?${params.toString()}`)
  }

  const regenerate = () => {
    startTransition(async () => {
      const result = await generatePlan({ siteId: site.id, prepDate })
      if (!result.ok) {
        toast({ tone: 'danger', title: 'Could not build the plan', description: result.error })
        return
      }
      setDrafts({})
      toast({
        tone: 'success',
        title: 'Forecast rebuilt',
        description: `${result.data?.items ?? 0} sauces recalculated. Your overrides were kept.`,
      })
      router.refresh()
    })
  }

  const saveOverride = (sauceId: string, itemId: string | null, value: number, suggested: number) => {
    setDrafts((current) => ({ ...current, [sauceId]: value }))

    if (!itemId) {
      toast({
        tone: 'warning',
        title: 'Create the plan first',
        description: 'Press “Build forecast” to save overrides against a plan.',
      })
      return
    }

    startTransition(async () => {
      // Matching the suggestion again clears the override rather than pinning it.
      const result = await setPlanItemOverride({
        itemId,
        overrideMl: value === suggested ? null : value,
      })
      if (!result.ok) {
        toast({ tone: 'danger', title: 'Could not save', description: result.error })
      }
      router.refresh()
    })
  }

  const confirm = () => {
    if (!plan) return
    startTransition(async () => {
      const result = await setPlanStatus({ planId: plan.plan.id, status: 'confirmed' })
      if (result.ok) {
        toast({
          tone: 'success',
          title: 'Plan confirmed',
          description: 'The kitchen checklist for this prep day is now locked in.',
        })
        router.refresh()
      } else {
        toast({ tone: 'danger', title: 'Could not confirm', description: result.error })
      }
    })
  }

  const status = plan?.plan.status ?? null

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* Controls                                                           */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <Select
            label="Kitchen"
            value={site.id}
            onChange={changeSite}
            size="sm"
            className="min-w-[10rem]"
            options={sites.map((option) => ({
              value: option.id,
              label: option.name,
              icon: 'map-pin' as const,
            }))}
          />
          <div className="rounded-lg border border-border bg-surface px-3.5 py-2">
            <p className="text-2xs uppercase tracking-wide text-ink-subtle">Prep day</p>
            <p className="text-sm font-semibold text-ink">{formatShort(prepDate)}</p>
          </div>
          {status ? (
            <Badge
              tone={status === 'confirmed' ? 'success' : status === 'draft' ? 'warning' : 'neutral'}
              icon={status === 'confirmed' ? 'check-circle' : 'edit'}
            >
              {status === 'draft' ? 'Draft' : status[0].toUpperCase() + status.slice(1)}
            </Badge>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2.5">
          {plan ? (
            <Button
              variant="ghost"
              size="md"
              leadingIcon="refresh-cw"
              disabled={busy}
              onClick={() =>
                startTransition(async () => {
                  await resetPlanOverrides(plan.plan.id)
                  setDrafts({})
                  router.refresh()
                })
              }
            >
              Clear overrides
            </Button>
          ) : null}
          <Button
            variant="secondary"
            size="md"
            leadingIcon="sparkles"
            loading={busy}
            onClick={regenerate}
          >
            {plan ? 'Rebuild forecast' : 'Build forecast'}
          </Button>
          {plan && status !== 'confirmed' ? (
            <Button size="md" leadingIcon="check" loading={busy} onClick={confirm}>
              Confirm plan
            </Button>
          ) : null}
          <Button
            variant="secondary"
            size="md"
            iconOnly
            leadingIcon="printer"
            aria-label="Print checklist"
            onClick={() => window.print()}
          />
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Summary                                                            */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Volume to prepare"
          value={formatMl(totals.final)}
          icon="package"
          tone="brand"
          hint={
            totals.final === totals.suggested
              ? 'Matches the forecast'
              : `Forecast suggested ${formatMl(totals.suggested)}`
          }
        />
        <StatCard
          label="Pack wastage"
          value={`${wastePercent}%`}
          icon="trash"
          tone={wastePercent > 8 ? 'danger' : wastePercent > 3 ? 'warning' : 'success'}
          hint={`${formatMl(totals.wasteMl)} over the volume needed`}
        />
        <StatCard
          label="Running low"
          value={totals.lowStock}
          unit="sauces"
          icon="trending-down"
          tone={totals.lowStock > 0 ? 'danger' : 'success'}
          hint={totals.lowStock > 0 ? 'Will run out before restock' : 'All comfortable'}
        />
        <StatCard
          label="Low confidence"
          value={totals.lowConfidence}
          unit="sauces"
          icon="info"
          tone={totals.lowConfidence > 0 ? 'warning' : 'neutral'}
          hint="Not enough history — using par"
        />
      </div>

      {!plan ? (
        <Callout tone="info" title="No saved plan for this prep day yet">
          The numbers below are live from the forecast engine. Press{' '}
          <strong>Build forecast</strong> to save them as a plan the kitchen can work from.
        </Callout>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* The table                                                          */}
      {/* ------------------------------------------------------------------ */}
      <Card padded={false}>
        <div className="border-b border-border p-5">
          <CardHeader
            className="mb-0"
            eyebrow={`${windowDays}-day rolling window · +${Math.round((bufferMultiplier - 1) * 100)}% buffer`}
            title="Suggested quantities"
            description="Every number shows its working. Override anything you disagree with — the engine keeps your change on the next rebuild, and the pack shown is always the least-wasteful mix of bag sizes for that volume."
          />
        </div>

        <Table
          rows={rows}
          rowKey={(row) => row.forecast.sauceId}
          className="rounded-none border-0"
          stickyHeader={false}
          rowTone={(row) => (row.forecast.lowStock ? 'danger' : 'default')}
          empty={{
            icon: 'sparkles',
            title: 'No active sauces',
            description: 'Add sauces in Settings and the planner will forecast them here.',
          }}
          columns={[
            {
              key: 'sauce',
              header: 'Sauce',
              cell: (row) => (
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink">{row.forecast.sauceName}</span>
                  {row.forecast.lowStock ? (
                    <Tooltip content="Projected to run out before this prep day.">
                      <span className="text-danger">
                        <Icon name="trending-down" size={14} />
                      </span>
                    </Tooltip>
                  ) : null}
                </div>
              ),
            },
            {
              key: 'stock',
              header: 'In stock',
              align: 'right',
              hideOnMobile: true,
              cell: (row) => (
                <div className="text-right">
                  <span className="font-medium text-ink">{formatMl(row.forecast.usableStockMl)}</span>
                  <span className="block text-2xs text-ink-subtle">
                    {row.forecast.sealedBags} sealed · {row.forecast.openedBags} open
                  </span>
                </div>
              ),
            },
            {
              key: 'burn',
              header: 'Burn rate',
              align: 'right',
              hideOnMobile: true,
              cell: (row) => (
                <div className="text-right">
                  <span className="font-medium text-ink">
                    {formatMl(row.forecast.reasoning.burnRatePerDay)}
                  </span>
                  <span className="block text-2xs text-ink-subtle">/ day</span>
                </div>
              ),
            },
            {
              key: 'need',
              header: `Need (${coversDays}d)`,
              align: 'right',
              hideOnMobile: true,
              cell: (row) => (
                <span className="text-ink-muted">{formatMl(row.forecast.reasoning.projectedNeedMl)}</span>
              ),
            },
            {
              key: 'suggested',
              header: 'Suggested',
              align: 'right',
              cell: (row) => (
                <button
                  type="button"
                  onClick={() => setExplaining(row.forecast)}
                  className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 font-semibold text-ink transition-colors hover:bg-surface-sunken focus-ring"
                >
                  {formatMl(row.suggested)}
                  <Icon name="info" size={13} className="text-ink-subtle" />
                </button>
              ),
            },
            {
              key: 'pack',
              header: 'Pack',
              cell: (row) => <PackBadge counts={row.pack.counts} />,
            },
            {
              key: 'final',
              header: 'Prepare',
              align: 'right',
              width: 'w-40',
              cell: (row) => (
                <div className="flex justify-end">
                  <Stepper
                    size="sm"
                    value={row.final}
                    min={0}
                    max={100_000}
                    step={100}
                    unit="ml"
                    onChange={(value) =>
                      saveOverride(row.forecast.sauceId, row.itemId, value, row.suggested)
                    }
                    className={
                      row.override !== null && row.override !== row.suggested
                        ? 'border-brand'
                        : undefined
                    }
                  />
                </div>
              ),
            },
          ]}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
          <p className="text-sm text-ink-muted">
            {rows.filter((row) => row.override !== null && row.override !== row.suggested).length}{' '}
            manual override
            {rows.filter((row) => row.override !== null && row.override !== row.suggested)
              .length === 1
              ? ''
              : 's'}
          </p>
          <p className="text-sm font-semibold text-ink">
            Total: <span className="tabular-nums">{formatMl(totals.final)}</span>
          </p>
        </div>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Coverage strip                                                     */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader
          eyebrow="Coverage"
          title={`This batch must last ${coversDays} days`}
          description={
            prepType === 'tuesday'
              ? 'Tuesday prep covers Tuesday, Wednesday and Thursday.'
              : 'Friday prep covers Friday, Saturday, Sunday and Monday.'
          }
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {coverageDates.map((date, index) => {
            const totalForDay = rows.reduce(
              (sum, row) => sum + (row.forecast.reasoning.coverageDates[index]?.projected ?? 0),
              0,
            )
            const peak = Math.max(
              ...coverageDates.map((_, i) =>
                rows.reduce(
                  (sum, row) => sum + (row.forecast.reasoning.coverageDates[i]?.projected ?? 0),
                  0,
                ),
              ),
              1,
            )

            return (
              <motion.div
                key={date}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: index * 0.04,
                  duration: motionTokens.duration.slow,
                  ease: motionTokens.ease.out,
                }}
                className="rounded-lg border border-border bg-surface-sunken p-4"
              >
                <p className="eyebrow">{WEEKDAY_SHORT[weekdayOf(date)]}</p>
                <p className="mt-1 text-sm font-semibold text-ink">{formatShort(date)}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-ink">
                  {formatMl(totalForDay)}
                </p>
                <p className="text-2xs text-ink-subtle">volume projected</p>
                <ProgressBar
                  className="mt-3"
                  size="sm"
                  value={totalForDay}
                  max={peak}
                  tone={totalForDay >= peak ? 'warning' : 'brand'}
                />
              </motion.div>
            )
          })}
        </div>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Reasoning drawer                                                   */}
      {/* ------------------------------------------------------------------ */}
      <Drawer
        open={Boolean(explaining)}
        onClose={() => setExplaining(null)}
        title={explaining ? `Why ${formatMl(explaining.suggestedMl)} of ${explaining.sauceName}?` : ''}
        description="The full working behind this suggestion."
        size="lg"
      >
        <AnimatePresence mode="wait">
          {explaining ? (
            <ForecastExplainer key={explaining.sauceId} forecast={explaining} />
          ) : (
            <EmptyState title="Select a sauce" description="Pick a suggested number to see its reasoning." />
          )}
        </AnimatePresence>
      </Drawer>
    </div>
  )
}
