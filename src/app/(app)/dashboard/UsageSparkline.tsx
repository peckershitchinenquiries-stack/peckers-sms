'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { Tooltip } from '@/components/ui'
import { motion as motionTokens } from '@/lib/design/tokens'
import { WEEKDAY_SHORT, formatShort, isPrepDay, today, weekdayOf, type DateOnly } from '@/lib/date'
import { formatMl } from '@/lib/utils/volume'

/**
 * Bar chart of volume used per day. Prep days are marked so the sawtooth of
 * "restock then burn down" is readable at a glance.
 */
export function UsageSparkline({ data }: { data: Array<{ date: DateOnly; ml: number }> }) {
  const asOf = today()
  const peak = Math.max(...data.map((day) => day.ml), 1)
  const average = data.length
    ? Math.round(data.reduce((sum, day) => sum + day.ml, 0) / data.length)
    : 0

  return (
    <div>
      <div className="relative flex h-44 items-end gap-1.5">
        {/* Average line */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border-strong"
          style={{ bottom: `${(average / peak) * 100}%` }}
        >
          <span className="absolute -top-4 right-0 text-2xs text-ink-subtle">
            avg {formatMl(average)}
          </span>
        </div>

        {data.map((day, index) => {
          const prep = isPrepDay(day.date)
          const isToday = day.date === asOf

          return (
            <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              <Tooltip
                content={
                  <>
                    <strong>{formatMl(day.ml)}</strong> on {formatShort(day.date)}
                    {prep ? ' · prep day' : ''}
                  </>
                }
              >
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max((day.ml / peak) * 100, 2)}%` }}
                  transition={{
                    delay: index * 0.02,
                    duration: motionTokens.duration.slower,
                    ease: motionTokens.ease.out,
                  }}
                  className={`w-full rounded-t-md ${
                    isToday ? 'bg-brand' : prep ? 'bg-warning/60' : 'bg-brand/35'
                  }`}
                  style={{ minHeight: 4 }}
                />
              </Tooltip>
              <span
                className={`text-2xs ${isToday ? 'font-semibold text-ink' : 'text-ink-subtle'}`}
              >
                {WEEKDAY_SHORT[weekdayOf(day.date)][0]}
              </span>
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-border pt-3 text-2xs text-ink-subtle">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-brand" />
          Today
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-warning/60" />
          Prep day (Tue / Fri)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-brand/35" />
          Trading day
        </span>
      </div>
    </div>
  )
}
