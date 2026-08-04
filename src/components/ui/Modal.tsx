'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils/cn'
import { motion as motionTokens } from '@/lib/design/tokens'
import { useEscapeKey, useFocusTrap, useLockBodyScroll, useMounted } from '@/lib/hooks'
import { Button } from './Button'

export type OverlaySize = 'sm' | 'md' | 'lg' | 'xl' | 'full'

const widthClasses: Record<OverlaySize, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-[min(72rem,calc(100vw-2rem))]',
}

interface OverlayShellProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  /** Clicking the backdrop closes by default. */
  dismissOnBackdrop?: boolean
  labelledBy?: string
  describedBy?: string
}

/** Portal + backdrop + focus trap + scroll lock, shared by Modal and Drawer. */
function OverlayShell({
  open,
  onClose,
  children,
  dismissOnBackdrop = true,
  labelledBy,
  describedBy,
}: OverlayShellProps & { children: React.ReactNode }) {
  const mounted = useMounted()
  const panelRef = React.useRef<HTMLDivElement>(null)

  useLockBodyScroll(open)
  useEscapeKey(onClose, open)
  useFocusTrap(panelRef, open)

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-modal">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: motionTokens.duration.base }}
            onClick={dismissOnBackdrop ? onClose : undefined}
            className="absolute inset-0 bg-overlay/45 backdrop-blur-sm"
            aria-hidden="true"
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            aria-describedby={describedBy}
            className="pointer-events-none absolute inset-0"
          >
            {children}
          </div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: React.ReactNode
  description?: React.ReactNode
  size?: OverlaySize
  /** Rendered in a sticky footer, right-aligned. */
  footer?: React.ReactNode
  dismissOnBackdrop?: boolean
  hideCloseButton?: boolean
  children: React.ReactNode
  className?: string
}

export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  footer,
  dismissOnBackdrop = true,
  hideCloseButton = false,
  children,
  className,
}: ModalProps) {
  const titleId = React.useId()
  const descriptionId = React.useId()

  return (
    <OverlayShell
      open={open}
      onClose={onClose}
      dismissOnBackdrop={dismissOnBackdrop}
      labelledBy={titleId}
      describedBy={description ? descriptionId : undefined}
    >
      <div className="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-6">
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.98 }}
          transition={motionTokens.ease.spring}
          onClick={(event) => event.stopPropagation()}
          className={cn(
            'pointer-events-auto flex max-h-[92dvh] w-full flex-col overflow-hidden border border-border bg-surface shadow-2xl',
            'rounded-t-2xl sm:rounded-2xl',
            widthClasses[size],
            className,
          )}
        >
          <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <h2 id={titleId} className="text-lg font-semibold tracking-tight text-ink">
                {title}
              </h2>
              {description ? (
                <p id={descriptionId} className="mt-1 text-sm leading-relaxed text-ink-muted">
                  {description}
                </p>
              ) : null}
            </div>
            {hideCloseButton ? null : (
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                leadingIcon="x"
                aria-label="Close dialog"
                onClick={onClose}
              />
            )}
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>

          {footer ? (
            <footer className="flex flex-wrap items-center justify-end gap-2.5 border-t border-border bg-surface-sunken px-5 py-4 sm:px-6">
              {footer}
            </footer>
          ) : null}
        </motion.div>
      </div>
    </OverlayShell>
  )
}

export interface DrawerProps {
  open: boolean
  onClose: () => void
  title: React.ReactNode
  description?: React.ReactNode
  /** `right` on desktop; `bottom` gives a thumb-reachable sheet on tablets. */
  side?: 'right' | 'bottom'
  size?: OverlaySize
  footer?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function Drawer({
  open,
  onClose,
  title,
  description,
  side = 'right',
  size = 'md',
  footer,
  children,
  className,
}: DrawerProps) {
  const titleId = React.useId()

  const isBottom = side === 'bottom'

  return (
    <OverlayShell open={open} onClose={onClose} labelledBy={titleId}>
      <div
        className={cn(
          'flex h-full',
          isBottom ? 'items-end justify-center' : 'items-stretch justify-end',
        )}
      >
        <motion.div
          initial={isBottom ? { y: '100%' } : { x: '100%' }}
          animate={isBottom ? { y: 0 } : { x: 0 }}
          exit={isBottom ? { y: '100%' } : { x: '100%' }}
          transition={motionTokens.ease.softSpring}
          drag={isBottom ? 'y' : false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.4 }}
          onDragEnd={(_, info) => {
            // Swipe the sheet down far or fast enough and it dismisses.
            if (isBottom && (info.offset.y > 140 || info.velocity.y > 700)) onClose()
          }}
          className={cn(
            'pointer-events-auto flex flex-col border-border bg-surface shadow-2xl',
            isBottom
              ? cn('max-h-[88dvh] w-full rounded-t-2xl border-t', widthClasses[size])
              : cn('h-full w-full border-l', widthClasses[size]),
            className,
          )}
        >
          {isBottom ? (
            <div className="flex justify-center pt-2.5" aria-hidden="true">
              <span className="h-1.5 w-10 rounded-full bg-border-strong" />
            </div>
          ) : null}

          <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-lg font-semibold tracking-tight text-ink">
                {title}
              </h2>
              {description ? (
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">{description}</p>
              ) : null}
            </div>
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              leadingIcon="x"
              aria-label="Close panel"
              onClick={onClose}
            />
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>

          {footer ? (
            <footer className="flex flex-wrap items-center justify-end gap-2.5 border-t border-border bg-surface-sunken px-5 py-4">
              {footer}
            </footer>
          ) : null}
        </motion.div>
      </div>
    </OverlayShell>
  )
}

export interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title: React.ReactNode
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'primary' | 'destructive'
}

/** Small wrapper for the "are you sure?" cases (discard, deactivate, delete). */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'primary',
}: ConfirmDialogProps) {
  const [busy, setBusy] = React.useState(false)

  const handleConfirm = async () => {
    setBusy(true)
    try {
      await onConfirm()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={tone} onClick={handleConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-muted">
        This action will be recorded against your account.
      </p>
    </Modal>
  )
}
