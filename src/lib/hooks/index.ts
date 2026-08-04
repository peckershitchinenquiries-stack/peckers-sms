'use client'

import * as React from 'react'

export const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect

/** Fires when a pointer goes down outside every supplied ref. */
export function useOnClickOutside(
  refs: Array<React.RefObject<HTMLElement>>,
  handler: (event: MouseEvent | TouchEvent) => void,
  enabled = true,
): void {
  const savedHandler = React.useRef(handler)
  savedHandler.current = handler

  React.useEffect(() => {
    if (!enabled) return

    const listener = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null
      if (!target) return
      const isInside = refs.some((ref) => ref.current?.contains(target))
      if (isInside) return
      savedHandler.current(event)
    }

    document.addEventListener('mousedown', listener)
    document.addEventListener('touchstart', listener, { passive: true })
    return () => {
      document.removeEventListener('mousedown', listener)
      document.removeEventListener('touchstart', listener)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...refs])
}

/** Prevents background scroll while a modal/drawer is open, without layout shift. */
export function useLockBodyScroll(locked: boolean): void {
  useIsomorphicLayoutEffect(() => {
    if (!locked) return

    const { overflow, paddingRight } = document.body.style
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth

    document.body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`
    }

    return () => {
      document.body.style.overflow = overflow
      document.body.style.paddingRight = paddingRight
    }
  }, [locked])
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(false)

  React.useEffect(() => {
    const mql = window.matchMedia(query)
    setMatches(mql.matches)
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/** Calls `onEscape` on Escape keydown while `enabled`. */
export function useEscapeKey(onEscape: () => void, enabled = true): void {
  const saved = React.useRef(onEscape)
  saved.current = onEscape

  React.useEffect(() => {
    if (!enabled) return
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        saved.current()
      }
    }
    document.addEventListener('keydown', listener)
    return () => document.removeEventListener('keydown', listener)
  }, [enabled])
}

/**
 * Traps Tab focus inside `containerRef` and restores focus to whatever was
 * focused before the overlay opened.
 */
export function useFocusTrap(
  containerRef: React.RefObject<HTMLElement>,
  active: boolean,
): void {
  React.useEffect(() => {
    if (!active) return
    const container = containerRef.current
    if (!container) return

    const previouslyFocused = document.activeElement as HTMLElement | null

    const focusablesIn = (root: HTMLElement) =>
      Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement)

    // Move focus in on open.
    const initial = focusablesIn(container)[0] ?? container
    window.requestAnimationFrame(() => initial.focus())

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const focusables = focusablesIn(container)
      if (focusables.length === 0) {
        event.preventDefault()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    container.addEventListener('keydown', onKeyDown)
    return () => {
      container.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [active, containerRef])
}

/** Debounces a rapidly-changing value (search boxes, filters). */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = React.useState(value)

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}

/** `true` only after hydration — for client-only UI like the theme toggle. */
export function useMounted(): boolean {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  return mounted
}

/**
 * Ticks every `intervalMs` and returns the current epoch ms. Used by countdown
 * timers and "expires in" labels so they stay live without a page refresh.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = React.useState<number>(() => Date.now())

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return now
}
