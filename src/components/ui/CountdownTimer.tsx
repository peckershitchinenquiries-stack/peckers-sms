'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils/cn'
import { useNow } from '@/lib/hooks'
import { BLAST_CHILL_MINUTES } from '@/lib/date'
import { ProgressRing } from './Progress'
import { Icon } from './Icon'
import { Badge } from './Badge'

export interface CountdownState {
  /** Milliseconds left. Clamped at 0. */
  remainingMs: number
  /** 0–1 elapsed. */
  progress: number
  finished: boolean
}

export function useCountdown(
  startedAt: string | Date | null,
  durationMinutes: number,
): CountdownState {
  const now = useNow(1000)

  return React.useMemo(() => {
    if (!startedAt) return { remainingMs: durationMinutes * 60_000, progress: 0, finished: false }

    const start = typeof startedAt === 'string' ? new Date(startedAt).getTime() : startedAt.getTime()
    const totalMs = durationMinutes * 60_000
    const elapsed = Math.max(0, now - start)
    const remainingMs = Math.max(0, totalMs - elapsed)

    return {
      remainingMs,
      progress: totalMs === 0 ? 1 : Math.min(1, elapsed / totalMs),
      finished: remainingMs === 0,
    }
  }, [startedAt, durationMinutes, now])
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
}

export interface BlastChillTimerProps {
  /** ISO timestamp of when the blast chill started. `null` = not started. */
  startedAt: string | null
  durationMinutes?: number
  /** Fires once when the countdown crosses zero (for a toast/sound). */
  onComplete?: () => void
  size?: 'sm' | 'lg'
  className?: string
}

/**
 * 1.5-hour blast-chill countdown.
 *
 * The clock is derived purely from the stored `blast_chilled_at` timestamp, so
 * it survives a page refresh, a tablet going to sleep, or a different member of
 * staff picking the job up on another device.
 */
export function BlastChillTimer({
  startedAt,
  durationMinutes = BLAST_CHILL_MINUTES,
  onComplete,
  size = 'lg',
  className,
}: BlastChillTimerProps) {
  const { remainingMs, progress, finished } = useCountdown(startedAt, durationMinutes)
  const firedRef = React.useRef(false)

  React.useEffect(() => {
    if (!startedAt) {
      firedRef.current = false
      return
    }
    if (finished && !firedRef.current) {
      firedRef.current = true
      onComplete?.()
    }
  }, [finished, startedAt, onComplete])

  const tone = finished ? 'success' : remainingMs < 10 * 60_000 ? 'warning' : 'brand'

  if (size === 'sm') {
    return (
      <div className={cn('inline-flex items-center gap-2', className)}>
        <ProgressRing
          progress={startedAt ? progress : 0}
          size={28}
          strokeWidth={3}
          tone={tone}
          aria-label="Blast chill progress"
        />
        <span
          className={cn(
            'text-sm font-semibold tabular-nums',
            finished ? 'text-success' : 'text-ink',
          )}
          aria-live="off"
        >
          {startedAt ? (finished ? 'Ready' : formatDuration(remainingMs)) : 'Not started'}
        </span>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      <ProgressRing
        progress={startedAt ? progress : 0}
        size={148}
        strokeWidth={9}
        tone={tone}
        aria-label="Blast chill countdown"
      >
        <div className="text-center">
          {finished ? (
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col items-center gap-1 text-success"
            >
              <Icon name="check-circle" size={30} />
              <span className="text-sm font-semibold">Chilled</span>
            </motion.div>
          ) : (
            <>
              <p
                className="text-3xl font-semibold tabular-nums tracking-tight text-ink"
                aria-live="off"
              >
                {formatDuration(remainingMs)}
              </p>
              <p className="mt-0.5 text-2xs uppercase tracking-[0.12em] text-ink-subtle">
                {startedAt ? 'remaining' : 'not started'}
              </p>
            </>
          )}
        </div>
      </ProgressRing>

      <Badge
        tone={finished ? 'success' : startedAt ? 'brand' : 'neutral'}
        icon={finished ? 'check' : 'snowflake'}
      >
        {finished
          ? 'Ready to vacuum pack'
          : startedAt
            ? `Blast chilling · ${durationMinutes} min hold`
            : `${durationMinutes} min blast chill`}
      </Badge>

      {/* Announced once rather than every tick, so screen readers aren't spammed. */}
      <span className="sr-only" aria-live="polite">
        {finished ? 'Blast chill complete. Ready to vacuum pack.' : ''}
      </span>
    </div>
  )
}
