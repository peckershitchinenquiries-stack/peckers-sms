'use client'

import * as React from 'react'
import { cn } from '@/lib/utils/cn'
import { Icon, type IconName } from './Icon'
import {
  Field,
  controlBaseClasses,
  controlSizeClasses,
  controlStateClasses,
  type ControlSize,
} from './Field'

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: React.ReactNode
  hint?: React.ReactNode
  error?: string | null
  size?: ControlSize
  leadingIcon?: IconName
  /** Static suffix like "bags" or "L" rendered inside the control. */
  suffix?: React.ReactNode
  containerClassName?: string
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    hint,
    error,
    size = 'md',
    leadingIcon,
    suffix,
    required,
    className,
    containerClassName,
    id,
    ...rest
  },
  ref,
) {
  const reactId = React.useId()
  const inputId = id ?? reactId
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined

  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      htmlFor={inputId}
      className={containerClassName}
    >
      <div className="relative">
        {leadingIcon ? (
          <Icon
            name={leadingIcon}
            size={size === 'sm' ? 15 : 17}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
          />
        ) : null}

        <input
          ref={ref}
          id={inputId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            controlBaseClasses,
            controlSizeClasses[size],
            controlStateClasses(Boolean(error)),
            leadingIcon && 'pl-10',
            Boolean(suffix) && 'pr-14',
            className,
          )}
          {...rest}
        />

        {suffix ? (
          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-ink-subtle">
            {suffix}
          </span>
        ) : null}
      </div>
    </Field>
  )
})

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: React.ReactNode
  hint?: React.ReactNode
  error?: string | null
  containerClassName?: string
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, required, className, containerClassName, id, rows = 4, ...rest },
  ref,
) {
  const reactId = React.useId()
  const fieldId = id ?? reactId

  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      htmlFor={fieldId}
      className={containerClassName}
    >
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        className={cn(
          controlBaseClasses,
          controlStateClasses(Boolean(error)),
          'resize-y px-3.5 py-2.5 text-base leading-relaxed',
          className,
        )}
        {...rest}
      />
    </Field>
  )
})
