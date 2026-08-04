'use client'

import * as React from 'react'
import { cn } from '@/lib/utils/cn'
import { Icon, type IconName } from './Icon'
import { Spinner } from './Spinner'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'soft'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl'

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-brand text-brand-ink shadow-sm hover:bg-brand-hover active:bg-brand-active disabled:bg-brand/40',
  secondary:
    'bg-surface text-ink border border-border shadow-xs hover:bg-surface-sunken hover:border-border-strong active:bg-surface-sunken',
  ghost: 'bg-transparent text-ink-muted hover:bg-surface-sunken hover:text-ink active:bg-surface-sunken',
  soft: 'bg-brand-soft text-brand-on-soft hover:bg-brand-soft-hover active:bg-brand-soft-hover',
  destructive:
    'bg-danger text-danger-ink shadow-sm hover:brightness-95 active:brightness-90 disabled:bg-danger/40',
}

/** Tablet-first sizing — `lg` and `xl` clear the 44px touch-target minimum. */
const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-md',
  md: 'h-10 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-tap px-5 text-base gap-2 rounded-lg',
  xl: 'h-tap-lg px-6 text-lg gap-2.5 rounded-xl',
}

const iconOnlySizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 w-8 p-0 rounded-md',
  md: 'h-10 w-10 p-0 rounded-lg',
  lg: 'h-tap w-tap p-0 rounded-lg',
  xl: 'h-tap-lg w-tap-lg p-0 rounded-xl',
}

const iconSizeFor: Record<ButtonSize, number> = { sm: 14, md: 16, lg: 18, xl: 20 }

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Shows a spinner, disables interaction, and preserves the button's width. */
  loading?: boolean
  leadingIcon?: IconName
  trailingIcon?: IconName
  /** Renders a square button. `aria-label` becomes required for a11y. */
  iconOnly?: boolean
  fullWidth?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    leadingIcon,
    trailingIcon,
    iconOnly = false,
    fullWidth = false,
    disabled,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading
  const glyph = iconSizeFor[size]

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        'relative inline-flex select-none items-center justify-center font-medium',
        'transition-[background-color,border-color,color,box-shadow,transform] duration-fast ease-out',
        'focus-ring active:scale-[0.985]',
        'disabled:pointer-events-none disabled:opacity-55 disabled:shadow-none',
        iconOnly ? iconOnlySizeClasses[size] : sizeClasses[size],
        variantClasses[variant],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span className="absolute inset-0 grid place-items-center">
          <Spinner size={glyph} />
        </span>
      ) : null}

      <span
        className={cn(
          'inline-flex items-center justify-center',
          iconOnly ? '' : 'gap-[inherit]',
          loading && 'invisible',
        )}
        style={iconOnly ? undefined : { gap: 'inherit' }}
      >
        {leadingIcon ? <Icon name={leadingIcon} size={glyph} /> : null}
        {children}
        {trailingIcon ? <Icon name={trailingIcon} size={glyph} /> : null}
      </span>
    </button>
  )
})
