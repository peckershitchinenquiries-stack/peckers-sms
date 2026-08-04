import * as React from 'react'
import { cn } from '@/lib/utils/cn'

export interface SpinnerProps {
  size?: number
  className?: string
  label?: string
}

/** Ring spinner — inherits `currentColor` so it works inside any button variant. */
export function Spinner({ size = 16, className, label }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={label ?? 'Loading'}
      className={cn('inline-block', className)}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        className="animate-spin"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.22" />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    </span>
  )
}
