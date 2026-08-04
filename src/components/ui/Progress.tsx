'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils/cn'
import { motion as motionTokens } from '@/lib/design/tokens'

export type ProgressTone = 'brand' | 'success' | 'warning' | 'danger'

export interface ProgressBarProps {
  value: number
  max?: number
  tone?: ProgressTone
  size?: 'sm' | 'md' | 'lg'
  label?: React.ReactNode
  /** Shows "12 / 20" style figures on the right of the label row. */
  valueLabel?: React.ReactNode
  /** Dashed marker at this value — used to show par level on a stock bar. */
  marker?: number
  markerLabel?: string
  className?: string
}

const toneClasses: Record<ProgressTone, string> = {
  brand: 'bg-brand',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
}

const trackHeight = { sm: 'h-1.5', md: 'h-2.5', lg: 'h-3.5' } as const

export function ProgressBar({
  value,
  max = 100,
  tone = 'brand',
  size = 'md',
  label,
  valueLabel,
  marker,
  markerLabel,
  className,
}: ProgressBarProps) {
  const safeMax = max <= 0 ? 1 : max
  const percent = Math.min(100, Math.max(0, (value / safeMax) * 100))
  const markerPercent =
    typeof marker === 'number' ? Math.min(100, Math.max(0, (marker / safeMax) * 100)) : null

  return (
    <div className={className}>
      {label || valueLabel ? (
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          {label ? <span className="text-sm font-medium text-ink">{label}</span> : <span />}
          {valueLabel ? (
            <span className="text-xs font-semibold tabular-nums text-ink-muted">{valueLabel}</span>
          ) : null}
        </div>
      ) : null}

      <div
        role="progressbar"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-label={typeof label === 'string' ? label : undefined}
        className={cn(
          'relative w-full overflow-hidden rounded-full bg-surface-sunken',
          trackHeight[size],
        )}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: motionTokens.duration.slower, ease: motionTokens.ease.out }}
          className={cn('h-full rounded-full', toneClasses[tone])}
        />

        {markerPercent !== null ? (
          <span
            aria-hidden="true"
            title={markerLabel}
            style={{ left: `${markerPercent}%` }}
            className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-ink/45"
          />
        ) : null}
      </div>

      {markerLabel && markerPercent !== null ? (
        <p className="mt-1 text-2xs text-ink-subtle">{markerLabel}</p>
      ) : null}
    </div>
  )
}

export interface ProgressRingProps {
  /** 0–1. */
  progress: number
  size?: number
  strokeWidth?: number
  tone?: ProgressTone
  children?: React.ReactNode
  className?: string
  'aria-label'?: string
}

const ringStroke: Record<ProgressTone, string> = {
  brand: 'stroke-brand',
  success: 'stroke-success',
  warning: 'stroke-warning',
  danger: 'stroke-danger',
}

/** Circular progress — drives the blast-chill countdown dial. */
export function ProgressRing({
  progress,
  size = 120,
  strokeWidth = 8,
  tone = 'brand',
  children,
  className,
  'aria-label': ariaLabel,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.min(1, Math.max(0, progress))

  return (
    <div
      className={cn('relative inline-grid place-items-center', className)}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={Math.round(clamped * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-surface-sunken"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          className={ringStroke[tone]}
          animate={{ strokeDashoffset: circumference * (1 - clamped) }}
          transition={{ duration: motionTokens.duration.slow, ease: 'linear' }}
        />
      </svg>

      {children ? <div className="absolute inset-0 grid place-items-center">{children}</div> : null}
    </div>
  )
}
