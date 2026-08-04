import * as React from 'react'
import { cn } from '@/lib/utils/cn'
import { Icon, type IconName } from './Icon'

export type StatTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger'

const toneRing: Record<StatTone, string> = {
  neutral: 'bg-surface-sunken text-ink-muted',
  brand: 'bg-brand-soft text-brand-on-soft',
  success: 'bg-success-soft text-success-on-soft',
  warning: 'bg-warning-soft text-warning-on-soft',
  danger: 'bg-danger-soft text-danger-on-soft',
}

export interface StatCardProps {
  label: string
  value: React.ReactNode
  unit?: string
  icon?: IconName
  tone?: StatTone
  /** Small supporting line under the number. */
  hint?: React.ReactNode
  trend?: { direction: 'up' | 'down' | 'flat'; label: string }
  className?: string
}

/** The dashboard's headline number tile. */
export function StatCard({
  label,
  value,
  unit,
  icon,
  tone = 'neutral',
  hint,
  trend,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-surface p-5 transition-shadow duration-base hover:shadow-md',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-ink-muted">{label}</p>
        {icon ? (
          <span className={cn('grid h-8 w-8 place-items-center rounded-lg', toneRing[tone])}>
            <Icon name={icon} size={16} />
          </span>
        ) : null}
      </div>

      <p className="mt-3 flex items-baseline gap-1.5">
        <span className="text-3xl font-semibold tracking-tight tabular-nums text-ink">{value}</span>
        {unit ? <span className="text-sm font-medium text-ink-muted">{unit}</span> : null}
      </p>

      {trend || hint ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {trend ? (
            <span
              className={cn(
                'inline-flex items-center gap-1 text-xs font-semibold',
                trend.direction === 'up' && 'text-success',
                trend.direction === 'down' && 'text-danger',
                trend.direction === 'flat' && 'text-ink-muted',
              )}
            >
              <Icon
                name={
                  trend.direction === 'up'
                    ? 'trending-up'
                    : trend.direction === 'down'
                      ? 'trending-down'
                      : 'activity'
                }
                size={13}
              />
              {trend.label}
            </span>
          ) : null}
          {hint ? <span className="text-xs text-ink-muted">{hint}</span> : null}
        </div>
      ) : null}
    </div>
  )
}

export interface CalloutProps {
  tone?: 'info' | 'success' | 'warning' | 'danger'
  title?: React.ReactNode
  icon?: IconName
  children: React.ReactNode
  action?: React.ReactNode
  className?: string
}

const calloutTone = {
  info: { wrap: 'border-brand/25 bg-brand-soft', text: 'text-brand-on-soft', icon: 'info' },
  success: {
    wrap: 'border-success/25 bg-success-soft',
    text: 'text-success-on-soft',
    icon: 'check-circle',
  },
  warning: {
    wrap: 'border-warning/30 bg-warning-soft',
    text: 'text-warning-on-soft',
    icon: 'alert-circle',
  },
  danger: {
    wrap: 'border-danger/30 bg-danger-soft',
    text: 'text-danger-on-soft',
    icon: 'alert-triangle',
  },
} as const

/** Inline message block — used for alerts, warnings and forecast explanations. */
export function Callout({ tone = 'info', title, icon, children, action, className }: CalloutProps) {
  const config = calloutTone[tone]

  return (
    <div className={cn('rounded-lg border p-4', config.wrap, className)}>
      <div className="flex gap-3">
        <Icon
          name={icon ?? (config.icon as IconName)}
          size={18}
          className={cn('mt-0.5 shrink-0', config.text)}
        />
        <div className="min-w-0 flex-1">
          {title ? (
            <p className={cn('text-sm font-semibold', config.text)}>{title}</p>
          ) : null}
          <div className={cn('text-sm leading-relaxed', title ? 'mt-1' : '', config.text)}>
            {children}
          </div>
          {action ? <div className="mt-3 flex flex-wrap gap-2">{action}</div> : null}
        </div>
      </div>
    </div>
  )
}
