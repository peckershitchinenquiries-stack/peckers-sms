'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils/cn'
import { motion as motionTokens } from '@/lib/design/tokens'
import { useMounted } from '@/lib/hooks'
import { Icon, type IconName } from './Icon'

export type ToastTone = 'info' | 'success' | 'warning' | 'danger'

export interface ToastOptions {
  title: string
  description?: string
  tone?: ToastTone
  /** Milliseconds before auto-dismiss. Pass `0` to keep it until dismissed. */
  duration?: number
  action?: { label: string; onClick: () => void }
}

interface ToastRecord extends Required<Pick<ToastOptions, 'title' | 'tone' | 'duration'>> {
  id: string
  description?: string
  action?: ToastOptions['action']
}

interface ToastContextValue {
  toast: (options: ToastOptions) => string
  dismiss: (id: string) => void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used inside <ToastProvider>')
  }
  return context
}

const toneConfig: Record<ToastTone, { icon: IconName; accent: string; iconColor: string }> = {
  info: { icon: 'info', accent: 'bg-brand', iconColor: 'text-brand' },
  success: { icon: 'check-circle', accent: 'bg-success', iconColor: 'text-success' },
  warning: { icon: 'alert-circle', accent: 'bg-warning', iconColor: 'text-warning' },
  danger: { icon: 'alert-triangle', accent: 'bg-danger', iconColor: 'text-danger' },
}

let toastCounter = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastRecord[]>([])
  const timers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const mounted = useMounted()

  const dismiss = React.useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const toast = React.useCallback(
    (options: ToastOptions) => {
      toastCounter += 1
      const id = `toast-${toastCounter}`
      const record: ToastRecord = {
        id,
        title: options.title,
        description: options.description,
        tone: options.tone ?? 'info',
        duration: options.duration ?? 4500,
        action: options.action,
      }

      // Cap the stack so a burst of events can't bury the screen.
      setToasts((current) => [...current.slice(-3), record])

      if (record.duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), record.duration),
        )
      }
      return id
    },
    [dismiss],
  )

  React.useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach(clearTimeout)
      pending.clear()
    }
  }, [])

  const value = React.useMemo(() => ({ toast, dismiss }), [toast, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted
        ? createPortal(
            <div
              role="region"
              aria-label="Notifications"
              className="pointer-events-none fixed inset-x-0 bottom-0 z-toast flex flex-col items-center gap-2.5 p-4 sm:inset-x-auto sm:right-0 sm:top-0 sm:bottom-auto sm:items-end sm:p-6"
            >
              <AnimatePresence initial={false}>
                {toasts.map((item) => (
                  <ToastCard key={item.id} toast={item} onDismiss={() => dismiss(item.id)} />
                ))}
              </AnimatePresence>
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  )
}

function ToastCard({ toast, onDismiss }: { toast: ToastRecord; onDismiss: () => void }) {
  const config = toneConfig[toast.tone]

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, scale: 0.96, transition: { duration: motionTokens.duration.fast } }}
      transition={motionTokens.ease.spring}
      role="status"
      aria-live={toast.tone === 'danger' ? 'assertive' : 'polite'}
      className="pointer-events-auto relative flex w-full max-w-sm gap-3 overflow-hidden rounded-xl border border-border bg-surface p-4 shadow-xl"
    >
      <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1', config.accent)} />

      <Icon name={config.icon} size={18} className={cn('mt-0.5 shrink-0', config.iconColor)} />

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{toast.title}</p>
        {toast.description ? (
          <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{toast.description}</p>
        ) : null}
        {toast.action ? (
          <button
            type="button"
            onClick={() => {
              toast.action?.onClick()
              onDismiss()
            }}
            className="mt-2 text-xs font-semibold text-brand underline-offset-2 hover:underline focus-ring"
          >
            {toast.action.label}
          </button>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="-m-1 h-6 w-6 shrink-0 rounded-md p-1 text-ink-subtle transition-colors hover:bg-surface-sunken hover:text-ink focus-ring"
      >
        <Icon name="x" size={16} />
      </button>
    </motion.div>
  )
}
