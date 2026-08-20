'use client'

import * as React from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

/**
 * Thin progress bar pinned to the top of the viewport, giving instant feedback
 * the moment a navigation is requested — well before the next page's RSC
 * payload has streamed back. It listens for clicks on same-page links rather
 * than hooking into the router (App Router in this Next version exposes no
 * navigation-start event), so it covers the sidebar and every in-app <Link>.
 */
export function RouteProgress() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [visible, setVisible] = React.useState(false)
  const [value, setValue] = React.useState(0)
  const timers = React.useRef<ReturnType<typeof setTimeout>[]>([])
  const navigatingTo = React.useRef<string | null>(null)

  const clearTimers = React.useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }, [])

  const finish = React.useCallback(() => {
    if (!navigatingTo.current) return
    navigatingTo.current = null
    clearTimers()
    setValue(100)
    timers.current.push(
      setTimeout(() => {
        setVisible(false)
        setValue(0)
      }, 200),
    )
  }, [clearTimers])

  const start = React.useCallback(
    (target: string) => {
      navigatingTo.current = target
      clearTimers()
      setVisible(true)
      setValue(12)
      timers.current.push(setTimeout(() => setValue(40), 100))
      timers.current.push(setTimeout(() => setValue(65), 400))
      timers.current.push(setTimeout(() => setValue(80), 1200))
    },
    [clearTimers],
  )

  React.useEffect(() => {
    const current = `${pathname}?${searchParams.toString()}`
    if (navigatingTo.current && navigatingTo.current === current) finish()
  }, [pathname, searchParams, finish])

  React.useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const anchor = (event.target as HTMLElement | null)?.closest('a')
      if (!anchor) return
      if (anchor.target && anchor.target !== '_self') return
      if (anchor.hasAttribute('download')) return

      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#')) return

      let url: URL
      try {
        url = new URL(href, window.location.href)
      } catch {
        return
      }
      if (url.origin !== window.location.origin) return

      const target = `${url.pathname}?${url.searchParams.toString()}`
      const currentUrl = `${window.location.pathname}?${new URLSearchParams(window.location.search).toString()}`
      if (target === currentUrl) return

      start(target)
    }

    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [start])

  React.useEffect(() => () => clearTimers(), [clearTimers])

  if (!visible) return null

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[9999] h-[3px] bg-transparent"
    >
      <div
        className="h-full bg-brand shadow-[0_0_8px_var(--color-brand)] transition-[width] duration-300 ease-out"
        style={{ width: `${value}%` }}
      />
    </div>
  )
}
