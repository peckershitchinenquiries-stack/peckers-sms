'use client'

import * as React from 'react'
import { cn } from '@/lib/utils/cn'
import { Icon } from './Icon'

export interface FieldProps {
  label?: React.ReactNode
  /** Helper text shown under the control when there's no error. */
  hint?: React.ReactNode
  error?: string | null
  required?: boolean
  /** id of the control this label points at. */
  htmlFor?: string
  className?: string
  children: React.ReactNode
}

/**
 * Label + hint + error scaffold shared by every form control so spacing,
 * `aria-describedby` wiring and error styling stay identical across the app.
 */
export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label ? (
        <label
          htmlFor={htmlFor}
          className="flex items-center gap-1 text-sm font-medium text-ink"
        >
          {label}
          {required ? (
            <span className="text-danger" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
      ) : null}

      {children}

      {error ? (
        <p
          id={htmlFor ? `${htmlFor}-error` : undefined}
          role="alert"
          className="flex items-start gap-1.5 text-xs font-medium text-danger"
        >
          <Icon name="alert-circle" size={13} className="mt-px" />
          {error}
        </p>
      ) : hint ? (
        <p id={htmlFor ? `${htmlFor}-hint` : undefined} className="text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

/** Shared control chrome so Input, Select trigger and DatePicker trigger match. */
export const controlBaseClasses =
  'w-full rounded-lg border bg-surface text-ink placeholder:text-ink-subtle transition-[border-color,box-shadow,background-color] duration-fast ease-out focus-ring disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-subtle'

export const controlSizeClasses = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-3.5 text-base',
  lg: 'h-tap-lg px-4 text-lg',
} as const

export type ControlSize = keyof typeof controlSizeClasses

export function controlStateClasses(hasError?: boolean): string {
  return hasError
    ? 'border-danger hover:border-danger'
    : 'border-border hover:border-border-strong'
}
