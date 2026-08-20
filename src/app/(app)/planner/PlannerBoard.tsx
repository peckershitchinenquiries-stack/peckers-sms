'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence } from 'framer-motion'
import {
  Badge,
  Button,
  Callout,
  Card,
  Drawer,
  EmptyState,
  Icon,
  Stepper,
  Table,
  useToast,
} from '@/components/ui'
import { ForecastExplainer } from './ForecastExplainer'
import {
  generatePlan,
  resetPlanOverrides,
  setPlanItemOverride,
  setPlanStatus,
} from '@/lib/actions/planner'
import { formatShort, type DateOnly } from '@/lib/date'
import { formatMl } from '@/lib/utils/volume'
import type { CombinedForecast, PlanView } from '@/lib/queries/planning'
import type { ForecastReasoning } from '@/lib/types/database'

export interface PlannerBoardProps {
  prepDate: DateOnly
  coversDays: number
  prepSiteName: string
  sites: Array<{ id: string; name: string }>
  forecasts: CombinedForecast[]
  plan: PlanView | null
}

export function PlannerBoard({
  prepDate,
  coversDays,
  prepSiteName,
  sites,
  forecasts,
  plan,
}: PlannerBoardProps) {
  const router = useRouter()
  const { toast } = useToast()

  const [busy, startTransition] = React.useTransition()
  const [explaining, setExplaining] = React.useState<{
    sauceName: string
    reasoning: ForecastReasoning
  } | null>(null)
  const [drafts, setDrafts] = React.useState<Record<string, number>>({})

  // Show the live forecast alongside whatever is saved, so a manager always
  // sees today's numbers even before pressing Build.
  const rows = React.useMemo(() => {
    const planItems = new Map(plan?.items.map((item) => [item.sauceId, item]) ?? [])

    return forecasts.map((forecast) => {
      const item = planItems.get(forecast.sauceId)
      const suggested = item?.suggestedMl ?? forecast.suggestedMl
      const override = item?.overrideMl ?? null
      const make = drafts[forecast.sauceId] ?? override ?? suggested

      // Split the final quantity across restaurants in the same proportion the
      // forecast asked for, so a manual change flows through to dispatch.
      const allocations = item?.allocations.length
        ? item.allocations
        : forecast.bySite.map((entry) => ({ siteId: entry.siteId, ml: entry.ml }))
      const allocationTotal = allocations.reduce((sum, entry) => sum + entry.ml, 0)

      return {
        forecast,
        itemId: item?.id ?? null,
        suggested,
        override,
        make,
        changed: override !== null && override !== suggested,
        split: allocations.map((entry) => ({
          siteId: entry.siteId,
          siteName: sites.find((site) => site.id === entry.siteId)?.name ?? 'Unknown',
          ml:
            allocationTotal > 0
              ? Math.round((entry.ml / allocationTotal) * make)
              : Math.round(make / Math.max(allocations.length, 1)),
        })),
        reasoning: item?.reasoning ?? forecast.reasoning,
      }
    })
  }, [forecasts, plan, drafts, sites])

  const totals = React.useMemo(
    () => ({
      make: rows.reduce((sum, row) => sum + row.make, 0),
      sauces: rows.filter((row) => row.make > 0).length,
      short: rows.filter((row) => row.forecast.lowStock).length,
      changed: rows.filter((row) => row.changed).length,
    }),
    [rows],
  )

  const build = () => {
    startTransition(async () => {
      const result = await generatePlan({ prepDate })
      if (!result.ok) {
        toast({ tone: 'danger', title: 'Could not build the plan', description: result.error })
        return
      }
      setDrafts({})
      toast({
        tone: 'success',
        title: plan ? 'Plan updated' : 'Plan built',
        description: `${result.data?.items ?? 0} sauces worked out. Any amounts you changed by hand were kept.`,
      })
      router.refresh()
    })
  }

  const changeAmount = (sauceId: string, itemId: string | null, value: number, suggested: number) => {
    setDrafts((current) => ({ ...current, [sauceId]: value }))

    if (!itemId) {
      toast({
        tone: 'warning',
        title: 'Build the plan first',
        description: 'Press “Build plan” to save these amounts.',
      })
      return
    }

    startTransition(async () => {
      // Matching the suggestion again clears the change rather than pinning it.
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

  const sendToKitchen = () => {
    if (!plan) return
    startTransition(async () => {
      const result = await setPlanStatus({ planId: plan.plan.id, status: 'confirmed' })
      if (result.ok) {
        toast({
          tone: 'success',
          title: 'Sent to the kitchen',
          description: `${prepSiteName} can now work through the list on their prep screen.`,
        })
        router.refresh()
      } else {
        toast({ tone: 'danger', title: 'Could not send', description: result.error })
      }
    })
  }

  const confirmed = plan?.plan.status === 'confirmed'

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------------------ */}
      {/* One summary, one primary action                                    */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral" icon="calendar">
                {formatShort(prepDate)}
              </Badge>
              {plan ? (
                <Badge tone={confirmed ? 'success' : 'warning'} icon={confirmed ? 'check-circle' : 'edit'}>
                  {confirmed ? 'Sent to kitchen' : 'Draft'}
                </Badge>
              ) : null}
              {totals.short > 0 ? (
                <Badge tone="danger" icon="trending-down">
                  {totals.short} running low
                </Badge>
              ) : null}
            </div>

            <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums text-ink">
              {formatMl(totals.make)}
            </p>
            <p className="mt-1 text-sm text-ink-muted">
              across {totals.sauces} sauce{totals.sauces === 1 ? '' : 's'} · must last {coversDays} days
              {totals.changed > 0 ? ` · ${totals.changed} changed by hand` : ''}
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            {totals.changed > 0 && plan ? (
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
                Undo my changes
              </Button>
            ) : null}
            <Button
              variant={plan ? 'secondary' : 'primary'}
              size="lg"
              leadingIcon="sparkles"
              loading={busy}
              onClick={build}
            >
              {plan ? 'Rebuild' : 'Build plan'}
            </Button>
            {plan && !confirmed ? (
              <Button size="lg" leadingIcon="send" loading={busy} onClick={sendToKitchen}>
                Send to kitchen
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      {!plan ? (
        <Callout tone="info" title="Nothing saved for this day yet">
          The amounts below are worked out live from usage. Press <strong>Build plan</strong> to save
          them, then <strong>Send to kitchen</strong> so {prepSiteName} sees them.
        </Callout>
      ) : !confirmed ? (
        <Callout tone="warning" title="The kitchen can see this, but it isn't final">
          Adjust anything that looks wrong, then press <strong>Send to kitchen</strong> to confirm it.
        </Callout>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* The numbers                                                        */}
      {/* ------------------------------------------------------------------ */}
      <Card padded={false}>
        <Table
          rows={rows}
          rowKey={(row) => row.forecast.sauceId}
          className="rounded-none border-0"
          stickyHeader={false}
          rowTone={(row) => (row.forecast.lowStock ? 'danger' : 'default')}
          empty={{
            icon: 'droplet',
            title: 'No sauces yet',
            description: 'Add sauces in Settings and they will be forecast here.',
          }}
          columns={[
            {
              key: 'sauce',
              header: 'Sauce',
              cell: (row) => (
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink">{row.forecast.sauceName}</span>
                  {row.forecast.lowStock ? (
                    <Badge tone="danger" size="sm" icon="trending-down">
                      low
                    </Badge>
                  ) : null}
                </div>
              ),
            },
            {
              key: 'stock',
              header: 'In the fridge',
              align: 'right',
              hideOnMobile: true,
              cell: (row) => (
                <span className="text-ink-muted">{formatMl(row.forecast.usableStockMl)}</span>
              ),
            },
            {
              key: 'make',
              header: 'Make',
              align: 'right',
              width: 'w-44',
              cell: (row) => (
                <div className="flex justify-end">
                  <Stepper
                    size="sm"
                    value={row.make}
                    min={0}
                    max={100_000}
                    step={100}
                    unit="ml"
                    onChange={(value) =>
                      changeAmount(row.forecast.sauceId, row.itemId, value, row.suggested)
                    }
                    className={row.changed ? 'border-brand' : undefined}
                  />
                </div>
              ),
            },
            {
              key: 'split',
              header: 'Goes to',
              cell: (row) =>
                row.make === 0 ? (
                  <span className="text-ink-subtle">—</span>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {row.split.map((entry) => (
                      <Badge key={entry.siteId} tone="neutral" size="sm">
                        {entry.siteName} {formatMl(entry.ml)}
                      </Badge>
                    ))}
                  </div>
                ),
            },
            {
              key: 'why',
              header: '',
              align: 'right',
              cell: (row) => (
                <Button
                  variant="ghost"
                  size="sm"
                  leadingIcon="info"
                  onClick={() =>
                    setExplaining({ sauceName: row.forecast.sauceName, reasoning: row.reasoning })
                  }
                >
                  Why?
                </Button>
              ),
            },
          ]}
        />
      </Card>

      <p className="flex items-center justify-center gap-1.5 text-xs text-ink-subtle">
        <Icon name="info" size={13} />
        Amounts are worked out from the last few weeks of usage at every restaurant, plus a safety
        margin. Change anything you disagree with — a rebuild keeps your changes.
      </p>

      {/* ------------------------------------------------------------------ */}
      {/* Why this number?                                                   */}
      {/* ------------------------------------------------------------------ */}
      <Drawer
        open={Boolean(explaining)}
        onClose={() => setExplaining(null)}
        title={explaining ? `Why ${formatMl(explaining.reasoning.suggestedMl)}?` : ''}
        description="The working behind this suggestion."
        size="md"
      >
        <AnimatePresence mode="wait">
          {explaining ? (
            <ForecastExplainer
              key={explaining.sauceName}
              sauceName={explaining.sauceName}
              reasoning={explaining.reasoning}
            />
          ) : (
            <EmptyState title="Pick a sauce" description="Choose “Why?” on any row." />
          )}
        </AnimatePresence>
      </Drawer>
    </div>
  )
}
