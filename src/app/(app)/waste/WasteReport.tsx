'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Icon,
  ProgressBar,
  StatCard,
  Tooltip,
  useToast,
} from '@/components/ui'
import { sweepExpiredStock } from '@/lib/actions/batches'
import { formatShort } from '@/lib/date'
import { motion as motionTokens } from '@/lib/design/tokens'
import { formatMl } from '@/lib/utils/volume'
import type { WasteSummary } from '@/lib/queries/waste'

export interface WasteReportProps {
  summary: WasteSummary
  rate: { wastedMl: number; preparedMl: number; percent: number }
  showSiteColumn: boolean
  isManager: boolean
}

/** Above this share of production, waste stops being noise and starts being money. */
const CONCERNING_PERCENT = 8
const WATCH_PERCENT = 4

export function WasteReport({ summary, rate, isManager }: WasteReportProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [busy, startTransition] = React.useTransition()

  const worst = summary.bySauce[0]
  const peak = Math.max(...summary.bySauce.map((sauce) => sauce.ml), 1)

  const rateTone =
    rate.percent >= CONCERNING_PERCENT
      ? 'danger'
      : rate.percent >= WATCH_PERCENT
        ? 'warning'
        : 'success'

  const writeOff = () => {
    startTransition(async () => {
      const result = await sweepExpiredStock({})
      if (result.ok) {
        const { bags, ml } = result.data!
        toast({
          tone: bags > 0 ? 'warning' : 'success',
          title: bags > 0 ? `${formatMl(ml)} written off` : 'Nothing to write off',
          description:
            bags > 0
              ? `${bags} bag${bags === 1 ? '' : 's'} past their date. That volume now shows as waste.`
              : 'Everything on the shelf is still within its date.',
        })
        router.refresh()
      } else {
        toast({ tone: 'danger', title: 'Could not write off', description: result.error })
      }
    })
  }

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------------------ */}
      {/* The headline numbers                                              */}
      {/* ------------------------------------------------------------------ */}
      <section aria-label="Waste totals" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Wasted today"
          value={formatMl(summary.todayMl)}
          icon="trash"
          tone={summary.todayMl > 0 ? 'warning' : 'success'}
          hint={summary.todayMl > 0 ? 'Binned or written off today' : 'Nothing binned today'}
        />
        <StatCard
          label="Wasted this week"
          value={formatMl(summary.weekMl)}
          icon="calendar"
          tone={summary.weekMl > 0 ? 'warning' : 'success'}
          hint="Last 7 days"
        />
        <StatCard
          label="Share of what was made"
          value={`${rate.percent}%`}
          icon="trending-down"
          tone={rateTone}
          hint={`${formatMl(rate.wastedMl)} of ${formatMl(rate.preparedMl)} prepared`}
        />
        <StatCard
          label="Worst sauce"
          value={worst ? formatMl(worst.ml) : '—'}
          icon="alert-triangle"
          tone={worst ? 'danger' : 'neutral'}
          hint={worst ? worst.sauceName : 'No waste recorded'}
        />
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* End-of-day write-off                                              */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">End of the day</p>
            <p className="mt-1 text-sm text-ink-muted">
              Anything past its date is written off automatically overnight. Press this if
              you are clearing the fridge now and want the figures to match.
            </p>
          </div>
          <Button
            variant="secondary"
            size="lg"
            leadingIcon="trash"
            loading={busy}
            onClick={writeOff}
            className="shrink-0"
          >
            Write off expired stock
          </Button>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* ---------------------------------------------------------------- */}
        {/* Where it is going                                                */}
        {/* ---------------------------------------------------------------- */}
        <Card className="xl:col-span-2">
          <CardHeader
            eyebrow={`${formatShort(summary.from)} — ${formatShort(summary.to)}`}
            title="Waste by sauce"
            description="Worst first. A sauce near the top of this list is either being over-prepped or is not selling the way the forecast thinks it is."
          />

          {summary.bySauce.length === 0 ? (
            <EmptyState
              icon="check"
              title="Nothing wasted"
              description="No sauce has been binned or written off in this period."
            />
          ) : (
            <ul className="space-y-2.5">
              {summary.bySauce.map((sauce, index) => (
                <motion.li
                  key={sauce.sauceId}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: Math.min(index * 0.03, 0.25),
                    duration: motionTokens.duration.slow,
                    ease: motionTokens.ease.out,
                  }}
                >
                  <ProgressBar
                    label={
                      <span className="inline-flex items-center gap-2">
                        {sauce.sauceName}
                        {sauce.expiredMl === sauce.ml ? (
                          <Tooltip content="All of it went out of date rather than being binned early.">
                            <Badge tone="warning" size="sm" icon="clock">
                              expired
                            </Badge>
                          </Tooltip>
                        ) : null}
                      </span>
                    }
                    valueLabel={`${formatMl(sauce.ml)} · ${sauce.entries} bag${sauce.entries === 1 ? '' : 's'}`}
                    value={sauce.ml}
                    max={peak}
                    tone={index === 0 ? 'danger' : 'warning'}
                    size="sm"
                  />
                </motion.li>
              ))}
            </ul>
          )}
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* Day by day                                                       */}
        {/* ---------------------------------------------------------------- */}
        <Card>
          <CardHeader
            eyebrow="Trend"
            title="By day"
            description="Waste clusters on the day after a batch runs out of life."
          />

          {summary.byDay.length === 0 ? (
            <EmptyState
              icon="check"
              title="Nothing to plot"
              description="No waste recorded in this period."
            />
          ) : (
            <ul className="space-y-1.5">
              {[...summary.byDay]
                .reverse()
                .slice(0, 14)
                .map((day) => (
                  <li
                    key={day.date}
                    className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-sunken"
                  >
                    <span className="text-ink-muted">{formatShort(day.date)}</span>
                    <span className="inline-flex items-center gap-1.5 font-medium tabular-nums text-ink">
                      <Icon name="trash" size={13} className="text-ink-subtle" />
                      {formatMl(day.ml)}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      </div>

      {isManager ? (
        <p className="text-sm text-ink-subtle">
          Waste is recorded as the volume left in a bag when it was binned — not the size
          of the bag. A 2L bag thrown away with 200ml in it counts as 200ml.
        </p>
      ) : null}
    </div>
  )
}
