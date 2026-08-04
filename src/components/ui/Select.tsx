'use client'

import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils/cn'
import { motion as motionTokens } from '@/lib/design/tokens'
import { useOnClickOutside } from '@/lib/hooks'
import { Icon, type IconName } from './Icon'
import {
  Field,
  controlBaseClasses,
  controlSizeClasses,
  controlStateClasses,
  type ControlSize,
} from './Field'

export interface SelectOption<T extends string = string> {
  value: T
  label: string
  description?: string
  icon?: IconName
  disabled?: boolean
}

export interface SelectProps<T extends string = string> {
  options: Array<SelectOption<T>>
  value: T | null
  onChange: (value: T) => void
  label?: React.ReactNode
  hint?: React.ReactNode
  error?: string | null
  placeholder?: string
  size?: ControlSize
  disabled?: boolean
  required?: boolean
  /** Adds a filter box above the list. Auto-enables at 8+ options. */
  searchable?: boolean
  className?: string
  containerClassName?: string
  id?: string
  name?: string
}

/**
 * Fully custom listbox — no native `<select>` anywhere in the app.
 *
 * Keyboard: Enter/Space/ArrowDown/ArrowUp open; ArrowUp/Down move the active
 * option; Home/End jump; typing does prefix typeahead; Enter selects; Escape
 * closes and returns focus to the trigger; Tab closes.
 */
export function Select<T extends string = string>({
  options,
  value,
  onChange,
  label,
  hint,
  error,
  placeholder = 'Select…',
  size = 'md',
  disabled = false,
  required = false,
  searchable,
  className,
  containerClassName,
  id,
  name,
}: SelectProps<T>) {
  const reactId = React.useId()
  const triggerId = id ?? reactId
  const listboxId = `${triggerId}-listbox`

  const [open, setOpen] = React.useState(false)
  const [activeIndex, setActiveIndex] = React.useState(-1)
  const [query, setQuery] = React.useState('')

  const rootRef = React.useRef<HTMLDivElement>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const listRef = React.useRef<HTMLUListElement>(null)
  const searchRef = React.useRef<HTMLInputElement>(null)
  const typeahead = React.useRef({ buffer: '', timer: 0 })

  const isSearchable = searchable ?? options.length >= 8

  const visibleOptions = React.useMemo(() => {
    if (!isSearchable || !query.trim()) return options
    const needle = query.trim().toLowerCase()
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(needle) ||
        option.description?.toLowerCase().includes(needle),
    )
  }, [options, query, isSearchable])

  const selected = React.useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  )

  useOnClickOutside([rootRef], () => setOpen(false), open)

  const close = React.useCallback(
    (returnFocus = true) => {
      setOpen(false)
      setQuery('')
      if (returnFocus) triggerRef.current?.focus()
    },
    [],
  )

  const openList = React.useCallback(() => {
    if (disabled) return
    setOpen(true)
    const currentIndex = visibleOptions.findIndex((option) => option.value === value)
    setActiveIndex(currentIndex >= 0 ? currentIndex : firstEnabledIndex(visibleOptions))
  }, [disabled, visibleOptions, value])

  const commit = React.useCallback(
    (index: number) => {
      const option = visibleOptions[index]
      if (!option || option.disabled) return
      onChange(option.value)
      close()
    },
    [visibleOptions, onChange, close],
  )

  // Keep the active option scrolled into view as it moves.
  React.useEffect(() => {
    if (!open || activeIndex < 0) return
    const node = listRef.current?.children[activeIndex] as HTMLElement | undefined
    node?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  React.useEffect(() => {
    if (open && isSearchable) {
      window.requestAnimationFrame(() => searchRef.current?.focus())
    }
  }, [open, isSearchable])

  const move = (direction: 1 | -1) => {
    setActiveIndex((current) => nextEnabledIndex(visibleOptions, current, direction))
  }

  const onTriggerKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return

    if (!open) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault()
        openList()
      }
      return
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        move(1)
        break
      case 'ArrowUp':
        event.preventDefault()
        move(-1)
        break
      case 'Home':
        event.preventDefault()
        setActiveIndex(firstEnabledIndex(visibleOptions))
        break
      case 'End':
        event.preventDefault()
        setActiveIndex(nextEnabledIndex(visibleOptions, visibleOptions.length, -1))
        break
      case 'Enter':
      case ' ':
        // While searching, space is a literal character.
        if (event.key === ' ' && isSearchable && document.activeElement === searchRef.current) break
        event.preventDefault()
        commit(activeIndex)
        break
      case 'Escape':
        event.preventDefault()
        close()
        break
      case 'Tab':
        close(false)
        break
      default:
        if (!isSearchable && event.key.length === 1) {
          runTypeahead(event.key)
        }
    }
  }

  const runTypeahead = (char: string) => {
    window.clearTimeout(typeahead.current.timer)
    typeahead.current.buffer += char.toLowerCase()
    const buffer = typeahead.current.buffer
    const match = visibleOptions.findIndex(
      (option) => !option.disabled && option.label.toLowerCase().startsWith(buffer),
    )
    if (match >= 0) setActiveIndex(match)
    typeahead.current.timer = window.setTimeout(() => {
      typeahead.current.buffer = ''
    }, 600)
  }

  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      htmlFor={triggerId}
      className={containerClassName}
    >
      <div ref={rootRef} className="relative" onKeyDown={onTriggerKeyDown}>
        {/* Mirrors the value for uncontrolled <form> submissions. */}
        {name ? <input type="hidden" name={name} value={value ?? ''} /> : null}

        <button
          ref={triggerRef}
          id={triggerId}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-invalid={error ? true : undefined}
          disabled={disabled}
          onClick={() => (open ? close() : openList())}
          className={cn(
            controlBaseClasses,
            controlSizeClasses[size],
            controlStateClasses(Boolean(error)),
            'flex items-center justify-between gap-2 text-left',
            open && 'border-brand',
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected?.icon ? (
              <Icon name={selected.icon} size={16} className="text-ink-muted" />
            ) : null}
            <span className={cn('truncate', !selected && 'text-ink-subtle')}>
              {selected?.label ?? placeholder}
            </span>
          </span>
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: motionTokens.duration.fast, ease: motionTokens.ease.out }}
            className="text-ink-subtle"
          >
            <Icon name="chevron-down" size={16} />
          </motion.span>
        </button>

        <AnimatePresence>
          {open ? (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: motionTokens.duration.fast, ease: motionTokens.ease.out }}
              className="absolute left-0 right-0 top-[calc(100%+6px)] z-popover overflow-hidden rounded-lg border border-border bg-surface shadow-xl"
            >
              {isSearchable ? (
                <div className="border-b border-border p-2">
                  <div className="relative">
                    <Icon
                      name="search"
                      size={15}
                      className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle"
                    />
                    <input
                      ref={searchRef}
                      value={query}
                      onChange={(event) => {
                        setQuery(event.target.value)
                        setActiveIndex(0)
                      }}
                      placeholder="Search…"
                      aria-label="Filter options"
                      className="h-9 w-full rounded-md border border-border bg-surface-sunken pl-8 pr-3 text-sm text-ink placeholder:text-ink-subtle focus-ring"
                    />
                  </div>
                </div>
              ) : null}

              <ul
                ref={listRef}
                id={listboxId}
                role="listbox"
                aria-labelledby={triggerId}
                tabIndex={-1}
                className="max-h-64 overflow-y-auto p-1.5"
              >
                {visibleOptions.length === 0 ? (
                  <li className="px-3 py-6 text-center text-sm text-ink-subtle">
                    No matches for “{query}”
                  </li>
                ) : (
                  visibleOptions.map((option, index) => {
                    const isSelected = option.value === value
                    const isActive = index === activeIndex

                    return (
                      <li
                        key={option.value}
                        role="option"
                        aria-selected={isSelected}
                        aria-disabled={option.disabled || undefined}
                        onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                        onClick={() => commit(index)}
                        className={cn(
                          'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors duration-fast',
                          isActive && !option.disabled && 'bg-surface-sunken',
                          isSelected && 'font-medium text-brand-on-soft',
                          option.disabled && 'cursor-not-allowed opacity-45',
                        )}
                      >
                        {option.icon ? (
                          <Icon name={option.icon} size={16} className="text-ink-muted" />
                        ) : null}

                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{option.label}</span>
                          {option.description ? (
                            <span className="mt-0.5 block truncate text-xs text-ink-subtle">
                              {option.description}
                            </span>
                          ) : null}
                        </span>

                        {/* Custom checkmark — never a native control glyph. */}
                        <span className="w-4 shrink-0">
                          <AnimatePresence>
                            {isSelected ? (
                              <motion.span
                                initial={{ scale: 0.5, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.5, opacity: 0 }}
                                transition={motionTokens.ease.spring}
                                className="block text-brand"
                              >
                                <Icon name="check" size={16} strokeWidth={2.5} />
                              </motion.span>
                            ) : null}
                          </AnimatePresence>
                        </span>
                      </li>
                    )
                  })
                )}
              </ul>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </Field>
  )
}

function firstEnabledIndex(options: Array<SelectOption<string>>): number {
  const index = options.findIndex((option) => !option.disabled)
  return index
}

function nextEnabledIndex(
  options: Array<SelectOption<string>>,
  from: number,
  direction: 1 | -1,
): number {
  if (options.length === 0) return -1
  let cursor = from
  for (let step = 0; step < options.length; step += 1) {
    cursor = (cursor + direction + options.length) % options.length
    if (!options[cursor]?.disabled) return cursor
  }
  return from
}
