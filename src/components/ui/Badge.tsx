import * as React from 'react'
import { cn } from '@/lib/utils/cn'
import { Icon, type IconName } from './Icon'

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger'
export type BadgeSize = 'sm' | 'md' | 'lg'

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'bg-surface-sunken text-ink-muted ring-border',
  brand: 'bg-brand-soft text-brand-on-soft ring-brand/20',
  success: 'bg-success-soft text-success-on-soft ring-success/25',
  warning: 'bg-warning-soft text-warning-on-soft ring-warning/25',
  danger: 'bg-danger-soft text-danger-on-soft ring-danger/25',
}

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'h-5 px-1.5 text-2xs gap-1',
  md: 'h-6 px-2 text-xs gap-1.5',
  lg: 'h-7 px-2.5 text-sm gap-1.5',
}

const glyphFor: Record<BadgeSize, number> = { sm: 11, md: 13, lg: 14 }

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  size?: BadgeSize
  icon?: IconName
  /** Small filled circle instead of an icon — for compact status columns. */
  dot?: boolean
}

/**
 * Status pill. Colour is never the only signal: pass an `icon` or `dot` so the
 * meaning survives greyscale printing and colour-vision deficiency.
 */
export function Badge({
  tone = 'neutral',
  size = 'md',
  icon,
  dot = false,
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full font-medium ring-1 ring-inset',
        toneClasses[tone],
        sizeClasses[size],
        className,
      )}
      {...rest}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className={cn(
            'rounded-full',
            size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2',
            tone === 'neutral' && 'bg-ink-subtle',
            tone === 'brand' && 'bg-brand',
            tone === 'success' && 'bg-success',
            tone === 'warning' && 'bg-warning',
            tone === 'danger' && 'bg-danger',
          )}
        />
      ) : null}
      {icon ? <Icon name={icon} size={glyphFor[size]} /> : null}
      {children}
    </span>
  )
}
