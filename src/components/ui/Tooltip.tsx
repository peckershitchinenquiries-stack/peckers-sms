'use client'

import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils/cn'
import { motion as motionTokens } from '@/lib/design/tokens'

export interface TooltipProps {
  content: React.ReactNode
  side?: 'top' | 'bottom'
  /** Delay before showing, in ms. */
  delay?: number
  children: React.ReactElement
  className?: string
}

/**
 * Hover/focus tooltip. Opens on keyboard focus too, so the reasoning hints on
 * the forecast panel are reachable without a mouse.
 */
export function Tooltip({ content, side = 'top', delay = 250, children, className }: TooltipProps) {
  const [open, setOpen] = React.useState(false)
  const timer = React.useRef<ReturnType<typeof setTimeout>>()
  const id = React.useId()

  const show = () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setOpen(true), delay)
  }
  const hide = () => {
    clearTimeout(timer.current)
    setOpen(false)
  }

  React.useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusCapture={show}
      onBlurCapture={hide}
    >
      {React.cloneElement(children, { 'aria-describedby': open ? id : undefined })}

      <AnimatePresence>
        {open ? (
          <motion.span
            id={id}
            role="tooltip"
            initial={{ opacity: 0, y: side === 'top' ? 4 : -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: side === 'top' ? 4 : -4, scale: 0.96 }}
            transition={{ duration: motionTokens.duration.fast, ease: motionTokens.ease.out }}
            className={cn(
              'pointer-events-none absolute left-1/2 z-tooltip w-max max-w-[16rem] -translate-x-1/2 rounded-lg bg-surface-inverse px-2.5 py-1.5 text-xs font-medium leading-relaxed text-ink-inverse shadow-lg',
              side === 'top' ? 'bottom-[calc(100%+6px)]' : 'top-[calc(100%+6px)]',
              className,
            )}
          >
            {content}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  )
}

/** A small "?" affordance that reveals an explanation — used by the forecast. */
export function InfoHint({ content }: { content: React.ReactNode }) {
  return (
    <Tooltip content={content}>
      <button
        type="button"
        aria-label="More information"
        className="grid h-4 w-4 place-items-center rounded-full border border-border-strong text-[9px] font-bold leading-none text-ink-subtle transition-colors hover:border-brand hover:text-brand focus-ring"
      >
        ?
      </button>
    </Tooltip>
  )
}
