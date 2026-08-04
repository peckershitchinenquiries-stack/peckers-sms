'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils/cn'
import { motion as motionTokens } from '@/lib/design/tokens'

export interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: React.ReactNode
  description?: React.ReactNode
  disabled?: boolean
  size?: 'sm' | 'md'
  /** Places the switch on the left of the label instead of the right. */
  switchFirst?: boolean
  className?: string
  id?: string
  name?: string
}

/** Custom switch. Uses a real `role="switch"` button, never a checkbox input. */
export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  size = 'md',
  switchFirst = false,
  className,
  id,
  name,
}: ToggleProps) {
  const reactId = React.useId()
  const switchId = id ?? reactId
  const descriptionId = description ? `${switchId}-description` : undefined

  const track = size === 'sm' ? 'h-5 w-9' : 'h-6 w-11'
  const thumb = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4.5 w-4.5'
  const travel = size === 'sm' ? 16 : 20

  const control = (
    <button
      id={switchId}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={descriptionId}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full p-0.5 transition-colors duration-base ease-out focus-ring',
        track,
        checked ? 'bg-brand' : 'bg-border-strong',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <motion.span
        aria-hidden="true"
        animate={{ x: checked ? travel : 0 }}
        transition={motionTokens.ease.spring}
        className={cn('rounded-full bg-surface shadow-sm', thumb)}
      />
    </button>
  )

  if (!label && !description) {
    return <span className={className}>{control}</span>
  }

  return (
    <div className={cn('flex items-start gap-3', switchFirst && 'flex-row', className)}>
      {switchFirst ? control : null}
      <div className="min-w-0 flex-1">
        {label ? (
          <label
            htmlFor={switchId}
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
      {switchFirst ? null : control}
    </div>
  )
}
