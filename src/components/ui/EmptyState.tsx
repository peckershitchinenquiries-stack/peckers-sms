import * as React from 'react'
import { cn } from '@/lib/utils/cn'
import { Icon, type IconName } from './Icon'

export interface EmptyStateProps {
  icon?: IconName
  title: string
  /** One short sentence explaining why it's empty and what to do next. */
  description?: string
  action?: React.ReactNode
  tone?: 'neutral' | 'success'
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Every list and table in the app gets one of these — never a bare
 * "No results". The description must always suggest the next action.
 */
export function EmptyState({
  icon = 'package',
  title,
  description,
  action,
  tone = 'neutral',
  size = 'md',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        size === 'sm' ? 'px-6 py-10' : 'px-6 py-16',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'mb-4 grid place-items-center rounded-2xl',
          size === 'sm' ? 'h-11 w-11' : 'h-14 w-14',
          tone === 'success' ? 'bg-success-soft text-success' : 'bg-surface-sunken text-ink-subtle',
        )}
      >
        <Icon name={icon} size={size === 'sm' ? 20 : 24} />
      </span>

      <h3
        className={cn(
          'font-semibold tracking-tight text-ink',
          size === 'sm' ? 'text-sm' : 'text-base',
        )}
      >
        {title}
      </h3>

      {description ? (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-muted">{description}</p>
      ) : null}

      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}
