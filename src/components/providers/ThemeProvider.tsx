'use client'

import * as React from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'peckers-sms-theme'

interface ThemeContextValue {
  /** What the user chose. */
  preference: ThemePreference
  /** What is actually rendered right now. */
  resolved: 'light' | 'dark'
  setPreference: (preference: ThemePreference) => void
  toggle: () => void
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null)

export function useTheme(): ThemeContextValue {
  const context = React.useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>')
  return context
}

/**
 * Inlined in <head> so the correct theme class is on <html> before first paint.
 * Without this the app flashes light before hydration.
 */
export const themeInitScript = `
(function(){
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = stored === 'dark' || ((!stored || stored === 'system') && prefersDark);
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch (e) {}
})();
`

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = React.useState<ThemePreference>('system')
  const [resolved, setResolved] = React.useState<'light' | 'dark'>('light')

  const apply = React.useCallback((next: ThemePreference) => {
    const dark = next === 'dark' || (next === 'system' && systemPrefersDark())
    document.documentElement.classList.toggle('dark', dark)
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
    setResolved(dark ? 'dark' : 'light')
  }, [])

  React.useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as ThemePreference | null) ?? 'system'
    setPreferenceState(stored)
    apply(stored)
  }, [apply])

  // Follow the OS while the preference is "system".
  React.useEffect(() => {
    if (preference !== 'system') return
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => apply('system')
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [preference, apply])

  const setPreference = React.useCallback(
    (next: ThemePreference) => {
      setPreferenceState(next)
      localStorage.setItem(STORAGE_KEY, next)
      apply(next)
    },
    [apply],
  )

  const value = React.useMemo<ThemeContextValue>(
    () => ({
      preference,
      resolved,
      setPreference,
      toggle: () => setPreference(resolved === 'dark' ? 'light' : 'dark'),
    }),
    [preference, resolved, setPreference],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
