'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils/cn'
import { motion as motionTokens } from '@/lib/design/tokens'
import { Icon, type IconName } from './Icon'

export interface TabItem<T extends string = string> {
  value: T
  label: string
  icon?: IconName
  /** Small count/indicator rendered after the label. */
  count?: number
  disabled?: boolean
}

export interface TabsProps<T extends string = string> {
  items: Array<TabItem<T>>
  value: T
  onChange: (value: T) => void
  /** `underline` for page-level nav, `pill` for in-card switching. */
  variant?: 'underline' | 'pill'
  size?: 'sm' | 'md'
  fullWidth?: boolean
  className?: string
  'aria-label'?: string
}

/**
 * Tab list with a shared-layout indicator. Arrow keys move between tabs
 * (WAI tabs pattern, automatic activation).
 */
export function Tabs<T extends string = string>({
  items,
  value,
  onChange,
  variant = 'underline',
  size = 'md',
  fullWidth = false,
  className,
  'aria-label': ariaLabel,
}: TabsProps<T>) {
  const layoutId = React.useId()
  const listRef = React.useRef<HTMLDivElement>(null)

  const move = (direction: 1 | -1) => {
    const enabled = items.filter((item) => !item.disabled)
    if (enabled.length === 0) return
    const currentIndex = enabled.findIndex((item) => item.value === value)
    const next = enabled[(currentIndex + direction + enabled.length) % enabled.length]
    onChange(next.value)
    window.requestAnimationFrame(() => {
      listRef.current?.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)?.focus()
    })
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') {
          event.preventDefault()
          move(1)
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault()
          move(-1)
        }
      }}
      className={cn(
        'flex items-center overflow-x-auto',
        variant === 'underline' && 'gap-1 border-b border-border',
        variant === 'pill' && 'gap-1 rounded-lg bg-surface-sunken p-1',
        fullWidth && 'w-full',
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value

        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            data-value={item.value}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            className={cn(
              'relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors duration-fast focus-ring',
              size === 'sm' ? 'text-xs' : 'text-sm',
              variant === 'underline' &&
                cn(
                  size === 'sm' ? 'h-9 px-2.5' : 'h-11 px-3.5',
                  active ? 'text-ink' : 'text-ink-muted hover:text-ink',
                ),
              variant === 'pill' &&
                cn(
                  'rounded-md',
                  size === 'sm' ? 'h-8 px-3' : 'h-9 px-3.5',
                  active ? 'text-ink' : 'text-ink-muted hover:text-ink',
                ),
              fullWidth && 'flex-1',
              item.disabled && 'cursor-not-allowed opacity-45',
            )}
          >
            {variant === 'pill' && active ? (
              <motion.span
                layoutId={`${layoutId}-pill`}
                transition={motionTokens.ease.spring}
                className="absolute inset-0 rounded-md bg-surface shadow-sm"
                aria-hidden="true"
              />
            ) : null}

            <span className="relative z-raised inline-flex items-center gap-2">
              {item.icon ? <Icon name={item.icon} size={size === 'sm' ? 14 : 16} /> : null}
              {item.label}
              {typeof item.count === 'number' ? (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-2xs font-semibold tabular-nums',
                    active ? 'bg-brand-soft text-brand-on-soft' : 'bg-surface-sunken text-ink-muted',
                  )}
                >
                  {item.count}
                </span>
              ) : null}
            </span>

            {variant === 'underline' && active ? (
              <motion.span
                layoutId={`${layoutId}-underline`}
                transition={motionTokens.ease.spring}
                className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-brand"
                aria-hidden="true"
              />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

export interface SegmentedControlProps<T extends string = string> {
  options: Array<{ value: T; label: string; icon?: IconName }>
  value: T
  onChange: (value: T) => void
  size?: 'sm' | 'md' | 'lg'
  fullWidth?: boolean
  className?: string
  'aria-label'?: string
}

/** Compact two-to-four-way switch — used for site scope and view toggles. */
export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  size = 'md',
  fullWidth,
  className,
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  const layoutId = React.useId()

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-1 rounded-lg border border-border bg-surface-sunken p-1',
        fullWidth && 'w-full',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors duration-fast focus-ring',
              size === 'sm' && 'h-8 px-2.5 text-xs',
              size === 'md' && 'h-9 px-3 text-sm',
              size === 'lg' && 'h-11 px-4 text-base',
              active ? 'text-ink' : 'text-ink-muted hover:text-ink',
            )}
          >
            {active ? (
              <motion.span
                layoutId={layoutId}
                transition={motionTokens.ease.spring}
                className="absolute inset-0 rounded-md bg-surface shadow-sm"
                aria-hidden="true"
              />
            ) : null}
            <span className="relative z-raised inline-flex items-center gap-1.5">
              {option.icon ? <Icon name={option.icon} size={size === 'sm' ? 13 : 15} /> : null}
              {option.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
