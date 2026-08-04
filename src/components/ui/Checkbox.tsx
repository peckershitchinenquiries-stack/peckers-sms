'use client'

import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils/cn'
import { motion as motionTokens } from '@/lib/design/tokens'

export interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: React.ReactNode
  description?: React.ReactNode
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
  error?: boolean
  className?: string
  id?: string
}

const boxSize = { sm: 'h-4 w-4', md: 'h-5 w-5', lg: 'h-6 w-6' } as const
const tickSize = { sm: 11, md: 13, lg: 16 } as const

/**
 * Custom checkbox with a stroke-drawn tick. The visible control is a button
 * with `role="checkbox"` — there is no native input to fight with.
 */
export function Checkbox({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  size = 'md',
  error = false,
  className,
  id,
}: CheckboxProps) {
  const reactId = React.useId()
  const boxId = id ?? reactId
  const descriptionId = description ? `${boxId}-description` : undefined

  const control = (
    <button
      id={boxId}
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-describedby={descriptionId}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'grid shrink-0 place-items-center rounded-[6px] border-2 transition-colors duration-fast ease-out focus-ring',
        boxSize[size],
        checked
          ? 'border-brand bg-brand text-brand-ink'
          : error
            ? 'border-danger bg-surface'
            : 'border-border-strong bg-surface hover:border-brand',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <AnimatePresence initial={false}>
        {checked ? (
          <motion.svg
            key="tick"
            viewBox="0 0 24 24"
            width={tickSize[size]}
            height={tickSize[size]}
            fill="none"
            aria-hidden="true"
          >
            <motion.path
              d="M20 6 9 17l-5-5"
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              exit={{ pathLength: 0 }}
              transition={{ duration: motionTokens.duration.base, ease: motionTokens.ease.out }}
            />
          </motion.svg>
        ) : null}
      </AnimatePresence>
    </button>
  )

  if (!label && !description) {
    return <span className={className}>{control}</span>
  }

  return (
    <div className={cn('flex items-start gap-3', className)}>
      {control}
      <div className="min-w-0 flex-1">
        {label ? (
          <label
            htmlFor={boxId}
            className={cn(
              'block text-sm font-medium text-ink',
              !disabled && 'cursor-pointer',
              disabled && 'opacity-60',
            )}
          >
            {label}
          </label>
        ) : null}
        {description ? (
          <p id={descriptionId} className="mt-0.5 text-xs leading-relaxed text-ink-muted">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  )
}

export interface RadioOption<T extends string = string> {
  value: T
  label: React.ReactNode
  description?: React.ReactNode
  disabled?: boolean
}

export interface RadioGroupProps<T extends string = string> {
  options: Array<RadioOption<T>>
  value: T | null
  onChange: (value: T) => void
  label?: React.ReactNode
  name?: string
  /** `card` renders each option as a large tappable panel (tablet-friendly). */
  variant?: 'inline' | 'card'
  columns?: 1 | 2 | 3
  className?: string
}

/**
 * Roving-tabindex radio group. Arrow keys move and select, matching the WAI
 * radiogroup pattern.
 */
export function RadioGroup<T extends string = string>({
  options,
  value,
  onChange,
  label,
  name,
  variant = 'inline',
  columns = 1,
  className,
}: RadioGroupProps<T>) {
  const groupId = React.useId()
  const containerRef = React.useRef<HTMLDivElement>(null)

  const moveSelection = (direction: 1 | -1) => {
    const enabled = options.filter((option) => !option.disabled)
    if (enabled.length === 0) return
    const currentIndex = enabled.findIndex((option) => option.value === value)
    const nextIndex =
      currentIndex < 0
        ? 0
        : (currentIndex + direction + enabled.length) % enabled.length
    const next = enabled[nextIndex]
    onChange(next.value)
    window.requestAnimationFrame(() => {
      containerRef.current
        ?.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)
        ?.focus()
    })
  }

  return (
    <div className={className}>
      {label ? (
        <p id={`${groupId}-label`} className="mb-2 text-sm font-medium text-ink">
          {label}
        </p>
      ) : null}

      <div
        ref={containerRef}
        role="radiogroup"
        aria-labelledby={label ? `${groupId}-label` : undefined}
        onKeyDown={(event) => {
          if (['ArrowDown', 'ArrowRight'].includes(event.key)) {
            event.preventDefault()
            moveSelection(1)
          } else if (['ArrowUp', 'ArrowLeft'].includes(event.key)) {
            event.preventDefault()
            moveSelection(-1)
          }
        }}
        className={cn(
          variant === 'card' ? 'grid gap-2.5' : 'flex flex-wrap gap-4',
          variant === 'card' && columns === 2 && 'sm:grid-cols-2',
          variant === 'card' && columns === 3 && 'sm:grid-cols-3',
        )}
      >
        {name ? <input type="hidden" name={name} value={value ?? ''} /> : null}

        {options.map((option) => {
          const selected = option.value === value

          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              data-value={option.value}
              aria-checked={selected}
              disabled={option.disabled}
              tabIndex={selected || (!value && options[0]?.value === option.value) ? 0 : -1}
              onClick={() => onChange(option.value)}
              className={cn(
                'group text-left transition-[border-color,background-color,box-shadow] duration-fast ease-out focus-ring',
                variant === 'card'
                  ? cn(
                      'flex items-start gap-3 rounded-lg border-2 p-3.5',
                      selected
                        ? 'border-brand bg-brand-soft'
                        : 'border-border bg-surface hover:border-border-strong',
                    )
                  : 'flex items-center gap-2.5',
                option.disabled && 'cursor-not-allowed opacity-50',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition-colors duration-fast',
                  selected ? 'border-brand' : 'border-border-strong group-hover:border-brand',
                )}
              >
                <AnimatePresence initial={false}>
                  {selected ? (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      transition={motionTokens.ease.spring}
                      className="h-2.5 w-2.5 rounded-full bg-brand"
                    />
                  ) : null}
                </AnimatePresence>
              </span>

              <span className="min-w-0">
                <span
                  className={cn(
                    'block text-sm font-medium',
                    selected ? 'text-brand-on-soft' : 'text-ink',
                  )}
                >
                  {option.label}
                </span>
                {option.description ? (
                  <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">
                    {option.description}
                  </span>
                ) : null}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
