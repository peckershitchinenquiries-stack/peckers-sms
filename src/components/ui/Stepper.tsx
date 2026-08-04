'use client'

import * as React from 'react'
import { cn } from '@/lib/utils/cn'
import { Icon } from './Icon'
import { Field } from './Field'

export interface StepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  label?: React.ReactNode
  hint?: React.ReactNode
  error?: string | null
  /** Static unit rendered under the number, e.g. "bags". */
  unit?: string
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  className?: string
  containerClassName?: string
  id?: string
  name?: string
}

const sizing = {
  sm: { wrap: 'h-9', button: 'w-9', text: 'text-sm', glyph: 14 },
  md: { wrap: 'h-11', button: 'w-11', text: 'text-base', glyph: 16 },
  lg: { wrap: 'h-tap-lg', button: 'w-tap-lg', text: 'text-xl', glyph: 20 },
} as const

/**
 * Number stepper sized for gloved hands on a tablet. The centre field is still
 * a real text input so a keyboard user can type a quantity directly.
 */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  label,
  hint,
  error,
  unit,
  size = 'md',
  disabled = false,
  className,
  containerClassName,
  id,
  name,
}: StepperProps) {
  const reactId = React.useId()
  const inputId = id ?? reactId
  const [draft, setDraft] = React.useState<string | null>(null)
  const config = sizing[size]

  const clamp = (next: number) => Math.min(max, Math.max(min, next))

  const commitDraft = () => {
    if (draft === null) return
    const parsed = Number.parseInt(draft, 10)
    onChange(Number.isFinite(parsed) ? clamp(parsed) : min)
    setDraft(null)
  }

  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      htmlFor={inputId}
      className={containerClassName}
    >
      <div
        className={cn(
          'inline-flex items-stretch overflow-hidden rounded-lg border bg-surface',
          error ? 'border-danger' : 'border-border',
          disabled && 'opacity-55',
          config.wrap,
          className,
        )}
      >
        {name ? <input type="hidden" name={name} value={value} /> : null}

        <button
          type="button"
          aria-label="Decrease"
          disabled={disabled || value <= min}
          onClick={() => onChange(clamp(value - step))}
          className={cn(
            'grid shrink-0 place-items-center border-r border-border text-ink-muted transition-colors duration-fast hover:bg-surface-sunken hover:text-ink focus-ring-inset disabled:pointer-events-none disabled:opacity-40',
            config.button,
          )}
        >
          <Icon name="minus" size={config.glyph} />
        </button>

        <div className="relative flex min-w-[3.5rem] flex-1 items-center justify-center px-1">
          <input
            id={inputId}
            type="number"
            inputMode="numeric"
            role="spinbutton"
            aria-valuenow={value}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-invalid={error ? true : undefined}
            disabled={disabled}
            value={draft ?? String(value)}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitDraft}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commitDraft()
                event.currentTarget.blur()
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                onChange(clamp(value + step))
              } else if (event.key === 'ArrowDown') {
                event.preventDefault()
                onChange(clamp(value - step))
              }
            }}
            className={cn(
              'w-full bg-transparent text-center font-semibold tabular-nums text-ink focus-ring-inset',
              config.text,
              unit && 'pb-3',
            )}
          />
          {unit ? (
            <span className="pointer-events-none absolute bottom-1 left-0 right-0 text-center text-2xs font-medium uppercase tracking-wide text-ink-subtle">
              {unit}
            </span>
          ) : null}
        </div>

        <button
          type="button"
          aria-label="Increase"
          disabled={disabled || value >= max}
          onClick={() => onChange(clamp(value + step))}
          className={cn(
            'grid shrink-0 place-items-center border-l border-border text-ink-muted transition-colors duration-fast hover:bg-surface-sunken hover:text-ink focus-ring-inset disabled:pointer-events-none disabled:opacity-40',
            config.button,
          )}
        >
          <Icon name="plus" size={config.glyph} />
        </button>
      </div>
    </Field>
  )
}
