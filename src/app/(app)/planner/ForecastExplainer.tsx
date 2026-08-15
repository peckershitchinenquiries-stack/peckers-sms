'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { Badge, Callout } from '@/components/ui'
import { motion as motionTokens } from '@/lib/design/tokens'
import { formatMl } from '@/lib/utils/volume'
import type { ForecastReasoning } from '@/lib/types/database'

const confidenceLabel = {
  high: 'Based on solid usage history',
  medium: 'Based on limited history',
  low: 'Not much history yet',
} as const

const confidenceTone = {
  high: 'success',
  medium: 'warning',
  low: 'danger',
} as const

/**
 * Why the engine suggested a number, in plain English.
 *
 * Deliberately short. The engine is rules-based precisely so a manager can
 * audit it, but burying that in twenty intermediate figures is what made the
 * old planner feel impenetrable — so this shows the arithmetic as five lines
 * and stops.
 */
export function ForecastExplainer({
  sauceName,
  reasoning,
}: {
  sauceName: string
  reasoning: ForecastReasoning
}) {
  const bufferPercent = Math.round((reasoning.bufferMultiplier - 1) * 100)
  const days = reasoning.coverageDates.length

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: motionTokens.duration.slow, ease: motionTokens.ease.out }}
      className="space-y-6"
    >
      <div className="rounded-xl border border-border bg-surface-sunken p-5">
        <p className="eyebrow">Make</p>
        <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums text-ink">
          {formatMl(reasoning.suggestedMl)}
        </p>
        <p className="mt-1 text-sm text-ink-muted">of {sauceName}</p>
        <Badge className="mt-3" tone={confidenceTone[reasoning.confidence]} icon="shield-check">
          {confidenceLabel[reasoning.confidence]}
        </Badge>
      </div>

      <section>
        <h3 className="eyebrow mb-3">How we got there</h3>
        <ol className="space-y-2">
          <Line
            label={`Used ${formatMl(reasoning.totalMlUsed)} over the last ${reasoning.observedDays} days`}
            value={`${formatMl(reasoning.burnRatePerDay)} a day`}
          />
          <Line
            label={`This batch has to last ${days} day${days === 1 ? '' : 's'}`}
            value={formatMl(reasoning.projectedNeedMl)}
          />
          <Line label="Already in the fridge" value={`− ${formatMl(reasoning.usableStockMl)}`} />
          <Line label={`Safety margin of ${bufferPercent}%`} value={`× ${reasoning.bufferMultiplier}`} />
          {reasoning.parFloorApplied ? (
            <Line
              label={`Topped up to the ${formatMl(reasoning.parLevelMl)} minimum you set`}
              value={formatMl(reasoning.suggestedMl)}
              highlighted
            />
          ) : null}
          <Line label="Suggested" value={formatMl(reasoning.suggestedMl)} highlighted />
        </ol>
      </section>

      {reasoning.siteBreakdown && reasoning.siteBreakdown.length > 1 ? (
        <section>
          <h3 className="eyebrow mb-3">Who it&apos;s for</h3>
          <ul className="space-y-2">
            {reasoning.siteBreakdown.map((entry) => (
              <li
                key={entry.siteId}
                className="flex items-center justify-between gap-3 rounded-lg bg-surface-sunken px-3.5 py-2.5"
              >
                <span className="text-sm text-ink">{entry.siteName}</span>
                <span className="text-sm font-semibold tabular-nums text-ink">
                  {formatMl(entry.ml)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {reasoning.notes.length > 0 ? (
        <section className="space-y-2.5">
          <h3 className="eyebrow">Worth knowing</h3>
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

function Line({
  label,
  value,
  highlighted = false,
}: {
  label: string
  value: string
  highlighted?: boolean
}) {
  return (
    <li
      className={`flex items-baseline justify-between gap-3 rounded-lg border px-3.5 py-2.5 ${
        highlighted ? 'border-brand/30 bg-brand-soft' : 'border-border bg-surface'
      }`}
    >
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{value}</span>
    </li>
  )
}
