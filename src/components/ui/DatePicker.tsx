'use client'

import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils/cn'
import { motion as motionTokens } from '@/lib/design/tokens'
import { useOnClickOutside } from '@/lib/hooks'
import {
  type DateOnly,
  addDaysTo,
  daysBetween,
  describePrepDays,
  formatDateOnly,
  isPrepDay,
  monthGrid,
  monthLabel,
  shiftMonth,
  today as todayFn,
} from '@/lib/date'
import { Icon } from './Icon'
import { Button } from './Button'
import {
  Field,
  controlBaseClasses,
  controlSizeClasses,
  controlStateClasses,
  type ControlSize,
} from './Field'

const WEEKDAY_HEADS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const

interface CalendarProps {
  /** Single mode: the selected date. Range mode: the start of the range. */
  value: DateOnly | null
  rangeEnd?: DateOnly | null
  mode?: 'single' | 'range'
  onSelect: (date: DateOnly) => void
  min?: DateOnly
  max?: DateOnly
  /** Ring prep days so they are findable at a glance. */
  highlightPrepDays?: boolean
  /** Which weekdays count as prep days. Defaults to Tuesday and Friday. */
  prepWeekdays?: number[]
  todayDate?: DateOnly
}

/** The month grid itself — reused by DatePicker and DateRangePicker. */
export function Calendar({
  value,
  rangeEnd = null,
  mode = 'single',
  onSelect,
  min,
  max,
  highlightPrepDays = false,
  prepWeekdays,
  todayDate = todayFn(),
}: CalendarProps) {
  const [anchor, setAnchor] = React.useState<DateOnly>(value ?? todayDate)
  const [focused, setFocused] = React.useState<DateOnly>(value ?? todayDate)
  const gridRef = React.useRef<HTMLDivElement>(null)
  const [direction, setDirection] = React.useState(0)

  const cells = React.useMemo(() => monthGrid(anchor, todayDate), [anchor, todayDate])

  const isDisabled = React.useCallback(
    (date: DateOnly) => {
      if (min && daysBetween(min, date) < 0) return true
      if (max && daysBetween(date, max) < 0) return true
      return false
    },
    [min, max],
  )

  const changeMonth = (delta: number) => {
    setDirection(delta)
    setAnchor((current) => shiftMonth(current, delta))
  }

  const moveFocus = (deltaDays: number) => {
    const next = addDaysTo(focused, deltaDays)
    setFocused(next)
    // Follow the cursor into the neighbouring month.
    if (!cells.some((cell) => cell.date === next && cell.inMonth)) {
      setDirection(deltaDays > 0 ? 1 : -1)
      setAnchor(next)
    }
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault()
        moveFocus(-1)
        break
      case 'ArrowRight':
        event.preventDefault()
        moveFocus(1)
        break
      case 'ArrowUp':
        event.preventDefault()
        moveFocus(-7)
        break
      case 'ArrowDown':
        event.preventDefault()
        moveFocus(7)
        break
      case 'PageUp':
        event.preventDefault()
        changeMonth(-1)
        break
      case 'PageDown':
        event.preventDefault()
        changeMonth(1)
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        if (!isDisabled(focused)) onSelect(focused)
        break
      default:
        break
    }
  }

  // Keep DOM focus on the focused day cell for screen-reader announcement.
  React.useEffect(() => {
    const node = gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)
    if (node && document.activeElement !== node && gridRef.current?.contains(document.activeElement)) {
      node.focus()
    }
  }, [focused])

  const inRange = (date: DateOnly) => {
    if (mode !== 'range' || !value || !rangeEnd) return false
    return daysBetween(value, date) > 0 && daysBetween(date, rangeEnd) > 0
  }

  return (
    <div className="w-[19.5rem] p-3">
      <div className="mb-2 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          leadingIcon="chevron-left"
          aria-label="Previous month"
          onClick={() => changeMonth(-1)}
        />
        <div className="relative h-6 flex-1 overflow-hidden text-center">
          <AnimatePresence initial={false} mode="popLayout" custom={direction}>
            <motion.p
              key={anchor.slice(0, 7)}
              custom={direction}
              initial={{ opacity: 0, x: direction * 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -12 }}
              transition={{ duration: motionTokens.duration.fast, ease: motionTokens.ease.out }}
              aria-live="polite"
              className="text-sm font-semibold text-ink"
            >
              {monthLabel(anchor)}
            </motion.p>
          </AnimatePresence>
        </div>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          leadingIcon="chevron-right"
          aria-label="Next month"
          onClick={() => changeMonth(1)}
        />
      </div>

      <div className="mb-1 grid grid-cols-7 gap-0.5" aria-hidden="true">
        {WEEKDAY_HEADS.map((day, index) => (
          <span
            key={`${day}-${index}`}
            className="grid h-7 place-items-center text-2xs font-semibold uppercase tracking-wide text-ink-subtle"
          >
            {day}
          </span>
        ))}
      </div>

      <div
        ref={gridRef}
        role="grid"
        aria-label={monthLabel(anchor)}
        onKeyDown={onKeyDown}
        className="grid grid-cols-7 gap-0.5"
      >
        {cells.map((cell) => {
          const selected =
            cell.date === value || (mode === 'range' && cell.date === rangeEnd)
          const disabled = isDisabled(cell.date)
          const between = inRange(cell.date)
          const prepDay = highlightPrepDays && isPrepDay(cell.date, prepWeekdays)

          return (
            <button
              key={cell.date}
              type="button"
              role="gridcell"
              data-date={cell.date}
              tabIndex={cell.date === focused ? 0 : -1}
              disabled={disabled}
              aria-selected={selected}
              aria-current={cell.isToday ? 'date' : undefined}
              aria-label={formatDateOnly(cell.date, 'EEEE d MMMM yyyy')}
              onClick={() => {
                setFocused(cell.date)
                onSelect(cell.date)
              }}
              className={cn(
                'relative grid h-10 w-full place-items-center rounded-md text-sm tabular-nums transition-colors duration-fast focus-ring',
                cell.inMonth ? 'text-ink' : 'text-ink-subtle/60',
                !disabled && !selected && 'hover:bg-surface-sunken',
                between && 'bg-brand-soft text-brand-on-soft',
                selected && 'bg-brand font-semibold text-brand-ink hover:bg-brand-hover',
                disabled && 'cursor-not-allowed opacity-35 hover:bg-transparent',
              )}
            >
              {Number(cell.date.slice(8, 10))}

              {cell.isToday && !selected ? (
                <span
                  aria-hidden="true"
                  className="absolute bottom-1 h-1 w-1 rounded-full bg-brand"
                />
              ) : null}
              {prepDay && !selected && !cell.isToday ? (
                <span
                  aria-hidden="true"
                  className="absolute bottom-1 h-1 w-1 rounded-full bg-warning"
                />
              ) : null}
            </button>
          )
        })}
      </div>

      {highlightPrepDays ? (
        <p className="mt-2 flex items-center gap-1.5 border-t border-border pt-2 text-2xs text-ink-subtle">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />
          {describePrepDays(prepWeekdays)}
        </p>
      ) : null}
    </div>
  )
}

export interface DatePickerProps {
  value: DateOnly | null
  onChange: (date: DateOnly) => void
  label?: React.ReactNode
  hint?: React.ReactNode
  error?: string | null
  placeholder?: string
  size?: ControlSize
  min?: DateOnly
  max?: DateOnly
  disabled?: boolean
  required?: boolean
  highlightPrepDays?: boolean
  /** Which weekdays count as prep days. Defaults to Tuesday and Friday. */
  prepWeekdays?: number[]
  className?: string
  containerClassName?: string
  id?: string
  name?: string
}

/** Custom calendar popover — never the browser's native date input. */
export function DatePicker({
  value,
  onChange,
  label,
  hint,
  error,
  placeholder = 'Pick a date',
  size = 'md',
  min,
  max,
  disabled,
  required,
  highlightPrepDays,
  prepWeekdays,
  className,
  containerClassName,
  id,
  name,
}: DatePickerProps) {
  const reactId = React.useId()
  const triggerId = id ?? reactId
  const [open, setOpen] = React.useState(false)
  const rootRef = React.useRef<HTMLDivElement>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)

  useOnClickOutside([rootRef], () => setOpen(false), open)

  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      htmlFor={triggerId}
      className={containerClassName}
    >
      <div
        ref={rootRef}
        className="relative"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            event.preventDefault()
            setOpen(false)
            triggerRef.current?.focus()
          }
        }}
      >
        {name ? <input type="hidden" name={name} value={value ?? ''} /> : null}

        <button
          ref={triggerRef}
          id={triggerId}
          type="button"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-describedby={error ? `${triggerId}-error` : undefined}
          onClick={() => setOpen((current) => !current)}
          className={cn(
            controlBaseClasses,
            controlSizeClasses[size],
            controlStateClasses(Boolean(error)),
            'flex items-center justify-between gap-2 text-left',
            open && 'border-brand',
            className,
          )}
        >
          <span className={cn('truncate', !value && 'text-ink-subtle')}>
            {value ? formatDateOnly(value, 'EEE d MMM yyyy') : placeholder}
          </span>
          <Icon name="calendar" size={16} className="text-ink-subtle" />
        </button>

        <AnimatePresence>
          {open ? (
            <motion.div
              role="dialog"
              aria-label="Choose a date"
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: motionTokens.duration.fast, ease: motionTokens.ease.out }}
              className="absolute left-0 top-[calc(100%+6px)] z-popover rounded-xl border border-border bg-surface shadow-xl"
            >
              <Calendar
                value={value}
                onSelect={(date) => {
                  onChange(date)
                  setOpen(false)
                  triggerRef.current?.focus()
                }}
                min={min}
                max={max}
                highlightPrepDays={highlightPrepDays}
                prepWeekdays={prepWeekdays}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </Field>
  )
}

export interface DateRangePickerProps {
  from: DateOnly | null
  to: DateOnly | null
  onChange: (range: { from: DateOnly | null; to: DateOnly | null }) => void
  label?: React.ReactNode
  hint?: React.ReactNode
  size?: ControlSize
  className?: string
  containerClassName?: string
}

/** Two-tap range selection: first tap sets the start, second sets the end. */
export function DateRangePicker({
  from,
  to,
  onChange,
  label,
  hint,
  size = 'md',
  className,
  containerClassName,
}: DateRangePickerProps) {
  const triggerId = React.useId()
  const [open, setOpen] = React.useState(false)
  const rootRef = React.useRef<HTMLDivElement>(null)

  useOnClickOutside([rootRef], () => setOpen(false), open)

  const handleSelect = (date: DateOnly) => {
    // No start yet, or the range is already complete → start a new range.
    if (!from || (from && to)) {
      onChange({ from: date, to: null })
      return
    }
    // Clicking before the start flips the range rather than rejecting it.
    if (daysBetween(from, date) < 0) {
      onChange({ from: date, to: from })
    } else {
      onChange({ from, to: date })
    }
    setOpen(false)
  }

  const summary =
    from && to
      ? `${formatDateOnly(from, 'd MMM')} – ${formatDateOnly(to, 'd MMM yyyy')}`
      : from
        ? `${formatDateOnly(from, 'd MMM yyyy')} – …`
        : 'All dates'

  return (
    <Field label={label} hint={hint} htmlFor={triggerId} className={containerClassName}>
      <div ref={rootRef} className="relative">
        <button
          id={triggerId}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className={cn(
            controlBaseClasses,
            controlSizeClasses[size],
            controlStateClasses(false),
            'flex items-center justify-between gap-2 text-left',
            open && 'border-brand',
            className,
          )}
        >
          <span className={cn('truncate', !from && 'text-ink-subtle')}>{summary}</span>
          <Icon name="calendar" size={16} className="text-ink-subtle" />
        </button>

        <AnimatePresence>
          {open ? (
            <motion.div
              role="dialog"
              aria-label="Choose a date range"
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: motionTokens.duration.fast, ease: motionTokens.ease.out }}
              className="absolute right-0 top-[calc(100%+6px)] z-popover rounded-xl border border-border bg-surface shadow-xl"
            >
              <Calendar mode="range" value={from} rangeEnd={to} onSelect={handleSelect} />
              <div className="flex justify-between border-t border-border p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onChange({ from: null, to: null })
                    setOpen(false)
                  }}
                >
                  Clear
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
                  Done
                </Button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </Field>
  )
}
