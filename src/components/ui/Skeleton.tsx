import * as React from 'react'
import { cn } from '@/lib/utils/cn'

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** `text` gets a slightly reduced height so it sits on a text baseline. */
  variant?: 'block' | 'text' | 'circle'
}

/** Shimmering placeholder. Always `aria-hidden` — the region announces "loading". */
export function Skeleton({ variant = 'block', className, ...rest }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative overflow-hidden bg-surface-sunken',
        variant === 'circle' ? 'rounded-full' : 'rounded-md',
        variant === 'text' && 'h-3.5',
        className,
      )}
      {...rest}
    >
      <span className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-border/70 to-transparent" />
    </div>
  )
}

/** Card-shaped skeleton used while dashboard panels load. */
export function SkeletonCard({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading"
      className={cn('rounded-xl border border-border bg-surface p-5 sm:p-6', className)}
    >
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-4 h-9 w-40" />
      <div className="mt-5 space-y-2.5">
        {Array.from({ length: lines }).map((_, index) => (
          <Skeleton
            key={index}
            variant="text"
            className={index === lines - 1 ? 'w-2/3' : 'w-full'}
          />
        ))}
      </div>
    </div>
  )
}

export function SkeletonStatGrid({ count = 4 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading statistics"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="rounded-xl border border-border bg-surface p-5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="mt-3.5 h-8 w-20" />
          <Skeleton className="mt-3 h-3 w-32" />
        </div>
      ))}
    </div>
  )
}

/** Matches the checklist/list row rhythm so the swap-in isn't jarring. */
export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading list"
      className="divide-y divide-border rounded-xl border border-border bg-surface"
    >
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-4 p-4">
          <Skeleton variant="circle" className="h-10 w-10" />
          <div className="flex-1 space-y-2">
            <Skeleton variant="text" className="w-1/3" />
            <Skeleton variant="text" className="w-1/5" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  )
}
