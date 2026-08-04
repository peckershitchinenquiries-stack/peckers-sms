import * as React from 'react'
import { cn } from '@/lib/utils/cn'

export interface PageHeaderProps {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}

/** Consistent page-level heading block across every route. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted sm:text-base">
            {description}
          </p>
        ) : null}
      </div>

      {actions ? (
        <div className="flex flex-wrap items-center gap-2.5 sm:shrink-0">{actions}</div>
      ) : null}
    </header>
  )
}
