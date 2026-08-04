import * as React from 'react'
import { cn } from '@/lib/utils/cn'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** `flat` for dense grids, `raised` for hero panels. */
  elevation?: 'flat' | 'sm' | 'raised'
  padded?: boolean
  as?: 'div' | 'section' | 'article' | 'li'
}

export function Card({
  elevation = 'sm',
  padded = true,
  as = 'div',
  className,
  children,
  ...rest
}: CardProps) {
  const Tag = as as React.ElementType
  return (
    <Tag
      className={cn(
        'rounded-xl border border-border bg-surface',
        elevation === 'flat' && 'shadow-none',
        elevation === 'sm' && 'shadow-sm',
        elevation === 'raised' && 'shadow-lg',
        padded && 'p-5 sm:p-6',
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  )
}

export interface CardHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: React.ReactNode
  description?: React.ReactNode
  eyebrow?: React.ReactNode
  actions?: React.ReactNode
}

export function CardHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
  ...rest
}: CardHeaderProps) {
  return (
    <div className={cn('mb-5 flex items-start justify-between gap-4', className)} {...rest}>
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-1.5">{eyebrow}</p> : null}
        <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  )
}
