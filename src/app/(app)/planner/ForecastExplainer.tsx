'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { Badge, Callout, Icon, ProgressBar } from '@/components/ui'
import { PackBadge } from '@/components/app/StatusPills'
import { motion as motionTokens } from '@/lib/design/tokens'
import { formatShort } from '@/lib/date'
import { formatMl } from '@/lib/utils/volume'
import type { SauceForecast } from '@/lib/queries/planning'

const confidenceTone = {
  high: 'success',
  medium: 'warning',
  low: 'danger',
} as const

const methodLabel = {
  history: 'Usage history',
  partial_history: 'Partial history',
  par_fallback: 'Par level fallback',
} as const

/**
 * Renders the forecast engine's reasoning as a readable calculation.
 *
 * The whole point of the engine being rules-based rather than a model is that
 * a manager can audit it — so every intermediate number gets shown, in order.
 */
export function ForecastExplainer({ forecast }: { forecast: SauceForecast }) {
  const { reasoning } = forecast
  const bufferPercent = Math.round((reasoning.bufferMultiplier - 1) * 100)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: motionTokens.duration.slow, ease: motionTokens.ease.out }}
      className="space-y-6"
    >
      {/* Headline ---------------------------------------------------------- */}
      <div className="rounded-xl border border-border bg-surface-sunken p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Suggested</p>
            <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums text-ink">
              {formatMl(reasoning.suggestedMl)}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge tone={confidenceTone[reasoning.confidence]} icon="shield-check">
              {reasoning.confidence} confidence
            </Badge>
            <Badge tone="neutral" size="sm">
              {methodLabel[reasoning.method]}
            </Badge>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
          <span className="text-xs text-ink-muted">Least-wasteful pack</span>
          <div className="flex items-center gap-2">
            <PackBadge counts={reasoning.pack.counts} />
            <span className="text-2xs text-ink-subtle">
              {reasoning.pack.wasteMl > 0 ? `+${formatMl(reasoning.pack.wasteMl)} waste` : 'no waste'}
            </span>
          </div>
        </div>
      </div>

      {/* Step-by-step ------------------------------------------------------ */}
      <section>
        <h3 className="eyebrow mb-3">The calculation</h3>
        <ol className="space-y-3">
          <Step
            index={1}
            title="Measure the burn rate"
            detail={`${formatMl(reasoning.totalMlUsed)} used over ${reasoning.observedDays} observed days`}
            value={`${formatMl(reasoning.burnRatePerDay)} / day`}
          />
          <Step
            index={2}
            title="Apply the day-of-week pattern"
            detail={
              hasPattern(reasoning.weekdayMultipliers)
                ? 'Some weekdays run busier than average — each covered day is weighted.'
                : 'No reliable weekday pattern yet, so every day is weighted equally.'
            }
            value={
              hasPattern(reasoning.weekdayMultipliers)
                ? `${Object.values(reasoning.weekdayMultipliers).filter((m) => m !== 1).length} weekdays adjusted`
                : 'flat'
            }
          />
          <Step
            index={3}
            title={`Project ${reasoning.coverageDates.length} days of demand`}
            detail={reasoning.coverageDates
              .map((day) => `${day.weekday.slice(0, 3)} ${formatMl(day.projected)}`)
              .join(' + ')}
            value={formatMl(reasoning.projectedNeedMl)}
          />
          <Step
            index={4}
            title="Subtract what's already in stock"
            detail="Sealed and opened bags both count — the kitchen can reach for either."
            value={`− ${formatMl(reasoning.usableStockMl)}`}
          />
          <Step
            index={5}
            title={`Add the ${bufferPercent}% safety buffer`}
            detail="Covers a busier-than-expected day without stacking up waste."
            value={`× ${reasoning.bufferMultiplier}`}
          />
          {reasoning.parFloorApplied ? (
            <Step
              index={6}
              title="Raise to the par level"
              detail={`Par at this site is ${formatMl(reasoning.parLevelMl)}, which is above the calculated need.`}
              value={`→ ${formatMl(reasoning.suggestedMl)}`}
              highlighted
            />
          ) : null}
        </ol>
      </section>

      {/* Per-day breakdown ------------------------------------------------- */}
      <section>
        <h3 className="eyebrow mb-3">Day by day</h3>
        <div className="space-y-2.5">
          {reasoning.coverageDates.map((day) => (
            <div key={day.date} className="rounded-lg border border-border bg-surface p-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-ink">{day.weekday}</p>
                  <p className="text-2xs text-ink-subtle">{formatShort(day.date)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums text-ink">{formatMl(day.projected)}</p>
                  <p className="text-2xs text-ink-subtle">
                    {formatMl(reasoning.burnRatePerDay)} × {day.multiplier}
                  </p>
                </div>
              </div>
              {day.multiplier !== 1 ? (
                <p
                  className={`mt-2 inline-flex items-center gap-1 text-2xs font-medium ${
                    day.multiplier > 1 ? 'text-warning' : 'text-ink-muted'
                  }`}
                >
                  <Icon name={day.multiplier > 1 ? 'trending-up' : 'trending-down'} size={12} />
                  {Math.abs(Math.round((day.multiplier - 1) * 100))}%{' '}
                  {day.multiplier > 1 ? 'above' : 'below'} the daily average
                </p>
              ) : null}
              <ProgressBar
                className="mt-2.5"
                size="sm"
                value={day.projected}
                max={Math.max(...reasoning.coverageDates.map((d) => d.projected), 1)}
                tone={day.multiplier > 1 ? 'warning' : 'brand'}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Inputs ------------------------------------------------------------ */}
      <section>
        <h3 className="eyebrow mb-3">Inputs used</h3>
        <dl className="grid grid-cols-2 gap-3">
          <Fact label="Usable stock" value={formatMl(reasoning.usableStockMl)} />
          <Fact label="Par level" value={reasoning.parLevelMl > 0 ? formatMl(reasoning.parLevelMl) : 'Not set'} />
          <Fact label="Observed days" value={String(reasoning.observedDays)} />
          <Fact label="Used in window" value={formatMl(reasoning.totalMlUsed)} />
          <Fact label="Raw result" value={formatMl(reasoning.rawSuggestionMl)} />
          <Fact label="Rounded up to" value={formatMl(reasoning.suggestedMl)} />
        </dl>
      </section>

      {/* Notes ------------------------------------------------------------- */}
      {reasoning.notes.length > 0 ? (
        <section className="space-y-2.5">
          <h3 className="eyebrow">Notes</h3>
          {reasoning.notes.map((note, index) => (
            <Callout
              key={index}
              tone={
                /run out/i.test(note) ? 'danger' : /par level|introduced/i.test(note) ? 'warning' : 'info'
              }
            >
              {note}
            </Callout>
          ))}
        </section>
      ) : null}
    </motion.div>
  )
}

function Step({
  index,
  title,
  detail,
  value,
  highlighted = false,
}: {
  index: number
  title: string
  detail: string
  value: string
  highlighted?: boolean
}) {
  return (
    <li
      className={`flex gap-3 rounded-lg border p-3.5 ${
        highlighted ? 'border-brand/30 bg-brand-soft' : 'border-border bg-surface'
      }`}
    >
      <span
        aria-hidden="true"
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-2xs font-semibold ${
          highlighted ? 'bg-brand text-brand-ink' : 'bg-surface-sunken text-ink-muted'
        }`}
      >
        {index}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-medium text-ink">{title}</p>
          <p className="shrink-0 text-sm font-semibold tabular-nums text-ink">{value}</p>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">{detail}</p>
      </div>
    </li>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-sunken px-3.5 py-2.5">
      <dt className="text-2xs uppercase tracking-wide text-ink-subtle">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  )
}

function hasPattern(multipliers: Record<string, number>): boolean {
  return Object.values(multipliers).some((value) => value !== 1)
}
