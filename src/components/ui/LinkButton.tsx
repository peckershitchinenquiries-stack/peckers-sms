import * as React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils/cn'
import { Icon, type IconName } from './Icon'
import type { ButtonSize, ButtonVariant } from './Button'

/**
 * An anchor that looks like a Button. Navigation must be a real link — never a
 * <button> with a Link inside it (invalid markup, and it breaks
 * middle-click/open-in-new-tab).
 */
const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-brand-ink shadow-sm hover:bg-brand-hover active:bg-brand-active',
  secondary:
    'bg-surface text-ink border border-border shadow-xs hover:bg-surface-sunken hover:border-border-strong',
  ghost: 'bg-transparent text-ink-muted hover:bg-surface-sunken hover:text-ink',
  soft: 'bg-brand-soft text-brand-on-soft hover:bg-brand-soft-hover',
  destructive: 'bg-danger text-danger-ink shadow-sm hover:brightness-95',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-md',
  md: 'h-10 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-tap px-5 text-base gap-2 rounded-lg',
  xl: 'h-tap-lg px-6 text-lg gap-2.5 rounded-xl',
}

const glyphFor: Record<ButtonSize, number> = { sm: 14, md: 16, lg: 18, xl: 20 }

export interface LinkButtonProps extends React.ComponentPropsWithoutRef<typeof Link> {
  variant?: ButtonVariant
  size?: ButtonSize
  leadingIcon?: IconName
  trailingIcon?: IconName
  fullWidth?: boolean
}

export function LinkButton({
  variant = 'primary',
  size = 'md',
  leadingIcon,
  trailingIcon,
  fullWidth = false,
  className,
  children,
  ...rest
}: LinkButtonProps) {
  const glyph = glyphFor[size]

  return (
    <Link
      className={cn(
        'inline-flex select-none items-center justify-center font-medium',
        'transition-[background-color,border-color,color,box-shadow,transform] duration-fast ease-out',
        'focus-ring active:scale-[0.985]',
        sizeClasses[size],
        variantClasses[variant],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {leadingIcon ? <Icon name={leadingIcon} size={glyph} /> : null}
      {children}
      {trailingIcon ? <Icon name={trailingIcon} size={glyph} /> : null}
    </Link>
  )
}
