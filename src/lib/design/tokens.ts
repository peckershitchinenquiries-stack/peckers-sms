/**
 * Peckers SMS — Design Tokens
 * ---------------------------------------------------------------------------
 * THE single source of truth for the visual language. Tailwind's config imports
 * this file and (a) generates the utility scales and (b) injects the semantic
 * CSS custom properties for light + dark themes.
 *
 * Rule: no hardcoded hex values anywhere else in the codebase. If you need a
 * colour, it must exist here first and be reached via a semantic Tailwind class
 * (e.g. `bg-surface`, `text-ink-muted`, `border-border`).
 */

/* -------------------------------------------------------------------------- */
/* Raw palette                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Warm neutrals. Slightly cream-shifted greys — the "editorial paper" base that
 * stops the UI feeling like a cold admin panel.
 */
export const neutral = {
  0: '#FFFFFF',
  25: '#FDFCFA',
  50: '#FBFAF8',
  100: '#F5F3EF',
  150: '#EFECE6',
  200: '#E7E2DA',
  300: '#D6CFC4',
  400: '#B0A79A',
  500: '#8A8177',
  600: '#6E6862',
  700: '#524D48',
  800: '#3A3633',
  850: '#2B2826',
  900: '#232120',
  925: '#1B1A18',
  950: '#131211',
  1000: '#0B0A0A',
} as const

/**
 * Brand — deep petrol blue. Deliberately chosen to sit outside the
 * green/amber/red status hues so an accent can never be misread as a status.
 */
export const brand = {
  50: '#F0F6F9',
  100: '#DCEAF0',
  200: '#B6D3E0',
  300: '#86B6CB',
  400: '#4E93AF',
  500: '#2A7691',
  600: '#1E5F74',
  700: '#1A4C5D',
  800: '#173F4C',
  900: '#142F39',
  950: '#0C1E25',
} as const

/** Green = healthy (2+ days of life / stock comfortably above par). */
export const success = {
  50: '#EAF6EF',
  100: '#D2ECDD',
  200: '#A8DABF',
  300: '#74C199',
  400: '#48A575',
  500: '#2F8F5B',
  600: '#257247',
  700: '#1D5A38',
  800: '#17462C',
  900: '#0F2E1D',
} as const

/** Amber = warning (1–2 days of life / trending toward a stock-out). */
export const warning = {
  50: '#FCF4E6',
  100: '#F8E6C4',
  200: '#EFCC8B',
  300: '#E0AC50',
  400: '#CE9128',
  500: '#B8791F',
  600: '#96620F',
  700: '#7A5010',
  800: '#5E3D0D',
  900: '#3D2809',
} as const

/** Red = expiring today / already expired / stock-out. */
export const danger = {
  50: '#FCEEEC',
  100: '#F8D8D3',
  200: '#F0B3AA',
  300: '#E28679',
  400: '#D05C4B',
  500: '#C2402D',
  600: '#A2331F',
  700: '#83291A',
  800: '#672016',
  900: '#43150E',
} as const

/* -------------------------------------------------------------------------- */
/* Semantic tokens (per theme)                                                */
/* -------------------------------------------------------------------------- */

export type SemanticTokenName =
  | 'canvas'
  | 'surface'
  | 'surface-raised'
  | 'surface-sunken'
  | 'surface-inverse'
  | 'overlay'
  | 'border'
  | 'border-strong'
  | 'ink'
  | 'ink-muted'
  | 'ink-subtle'
  | 'ink-inverse'
  | 'brand'
  | 'brand-hover'
  | 'brand-active'
  | 'brand-soft'
  | 'brand-soft-hover'
  | 'brand-ink'
  | 'brand-on-soft'
  | 'success'
  | 'success-soft'
  | 'success-on-soft'
  | 'success-ink'
  | 'warning'
  | 'warning-soft'
  | 'warning-on-soft'
  | 'warning-ink'
  | 'danger'
  | 'danger-soft'
  | 'danger-on-soft'
  | 'danger-ink'
  | 'focus'

export type SemanticTheme = Record<SemanticTokenName, string>

/**
 * Contrast note: every `*-on-soft` / `ink*` pairing below was picked to clear
 * WCAG AA (4.5:1 for body text, 3:1 for large text and UI boundaries) against
 * its intended background token.
 */
export const lightTheme: SemanticTheme = {
  canvas: neutral[50],
  surface: neutral[0],
  'surface-raised': neutral[0],
  'surface-sunken': neutral[100],
  'surface-inverse': neutral[900],
  overlay: neutral[950],

  border: neutral[200],
  'border-strong': neutral[300],

  ink: neutral[900],
  'ink-muted': neutral[600],
  'ink-subtle': neutral[500],
  'ink-inverse': neutral[25],

  brand: brand[600],
  'brand-hover': brand[700],
  'brand-active': brand[800],
  'brand-soft': brand[50],
  'brand-soft-hover': brand[100],
  'brand-ink': neutral[0],
  'brand-on-soft': brand[700],

  success: success[600],
  'success-soft': success[50],
  'success-on-soft': success[700],
  'success-ink': neutral[0],

  warning: warning[600],
  'warning-soft': warning[50],
  'warning-on-soft': warning[700],
  'warning-ink': neutral[0],

  danger: danger[600],
  'danger-soft': danger[50],
  'danger-on-soft': danger[700],
  'danger-ink': neutral[0],

  focus: brand[500],
}

export const darkTheme: SemanticTheme = {
  canvas: neutral[950],
  surface: neutral[925],
  'surface-raised': neutral[900],
  'surface-sunken': neutral[1000],
  'surface-inverse': neutral[100],
  overlay: neutral[1000],

  border: neutral[850],
  'border-strong': neutral[800],

  ink: neutral[100],
  'ink-muted': neutral[400],
  'ink-subtle': neutral[500],
  'ink-inverse': neutral[950],

  brand: brand[300],
  'brand-hover': brand[200],
  'brand-active': brand[100],
  'brand-soft': brand[950],
  'brand-soft-hover': brand[900],
  'brand-ink': brand[950],
  'brand-on-soft': brand[200],

  success: success[300],
  'success-soft': success[900],
  'success-on-soft': success[200],
  'success-ink': success[900],

  warning: warning[300],
  'warning-soft': warning[900],
  'warning-on-soft': warning[200],
  'warning-ink': warning[900],

  danger: danger[300],
  'danger-soft': danger[900],
  'danger-on-soft': danger[200],
  'danger-ink': danger[900],

  focus: brand[300],
}

/* -------------------------------------------------------------------------- */
/* Radii, spacing, type, elevation, motion, z-index                           */
/* -------------------------------------------------------------------------- */

export const radii = {
  none: '0px',
  xs: '4px',
  sm: '6px',
  md: '10px',
  lg: '14px',
  xl: '20px',
  '2xl': '28px',
  '3xl': '36px',
  full: '9999px',
} as const

/** Extra steps on top of Tailwind's 4px scale — includes tablet tap sizing. */
export const spacing = {
  '4.5': '1.125rem',
  '13': '3.25rem',
  '15': '3.75rem',
  '18': '4.5rem',
  '22': '5.5rem',
  '30': '7.5rem',
  tap: '2.75rem', // 44px — minimum touch target
  'tap-lg': '3.25rem', // 52px — primary kitchen actions
} as const

export const fontSize = {
  '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.02em' }],
  xs: ['0.75rem', { lineHeight: '1.125rem', letterSpacing: '0.01em' }],
  sm: ['0.8125rem', { lineHeight: '1.25rem' }],
  base: ['0.9375rem', { lineHeight: '1.5rem' }],
  lg: ['1.0625rem', { lineHeight: '1.625rem' }],
  xl: ['1.25rem', { lineHeight: '1.75rem', letterSpacing: '-0.01em' }],
  '2xl': ['1.5rem', { lineHeight: '2rem', letterSpacing: '-0.015em' }],
  '3xl': ['1.875rem', { lineHeight: '2.25rem', letterSpacing: '-0.02em' }],
  '4xl': ['2.375rem', { lineHeight: '2.75rem', letterSpacing: '-0.025em' }],
  '5xl': ['3rem', { lineHeight: '3.25rem', letterSpacing: '-0.03em' }],
  '6xl': ['3.75rem', { lineHeight: '4rem', letterSpacing: '-0.035em' }],
} as const

/**
 * Soft, layered elevation. Warm-tinted shadow colour (not pure black) so cards
 * feel like paper on paper rather than floating plastic.
 */
export const shadows = {
  xs: '0 1px 2px 0 rgb(35 33 32 / 0.04)',
  sm: '0 1px 3px 0 rgb(35 33 32 / 0.06), 0 1px 2px -1px rgb(35 33 32 / 0.04)',
  md: '0 4px 12px -2px rgb(35 33 32 / 0.07), 0 2px 4px -2px rgb(35 33 32 / 0.04)',
  lg: '0 12px 28px -6px rgb(35 33 32 / 0.10), 0 4px 8px -4px rgb(35 33 32 / 0.05)',
  xl: '0 24px 48px -12px rgb(35 33 32 / 0.16), 0 8px 16px -8px rgb(35 33 32 / 0.06)',
  '2xl': '0 40px 80px -20px rgb(35 33 32 / 0.24)',
  inner: 'inset 0 1px 2px 0 rgb(35 33 32 / 0.05)',
  focus: '0 0 0 3px rgb(42 118 145 / 0.28)',
} as const

export const zIndex = {
  base: '0',
  raised: '10',
  sticky: '20',
  header: '30',
  drawer: '40',
  backdrop: '50',
  modal: '60',
  popover: '70',
  toast: '80',
  tooltip: '90',
} as const

/** Motion — fast and tasteful. Nothing here should exceed 300ms. */
export const motion = {
  duration: {
    instant: 0.1,
    fast: 0.15,
    base: 0.2,
    slow: 0.25,
    slower: 0.3,
  },
  ease: {
    /** Default UI easing — quick out, gentle settle. */
    out: [0.16, 1, 0.3, 1] as [number, number, number, number],
    inOut: [0.65, 0, 0.35, 1] as [number, number, number, number],
    spring: { type: 'spring', stiffness: 420, damping: 34, mass: 0.7 } as const,
    softSpring: { type: 'spring', stiffness: 260, damping: 28, mass: 0.9 } as const,
  },
} as const

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** `#1E5F74` -> `30 95 116` so Tailwind's `<alpha-value>` slot works. */
export function hexToRgbChannels(hex: string): string {
  const normalised = hex.replace('#', '')
  const full =
    normalised.length === 3
      ? normalised
          .split('')
          .map((c) => c + c)
          .join('')
      : normalised
  const int = parseInt(full, 16)
  const r = (int >> 16) & 255
  const g = (int >> 8) & 255
  const b = int & 255
  return `${r} ${g} ${b}`
}

/** Turns a semantic theme into the CSS custom properties Tailwind consumes. */
export function themeToCssVars(theme: SemanticTheme): Record<string, string> {
  return Object.fromEntries(
    Object.entries(theme).map(([name, hex]) => [`--sms-${name}`, hexToRgbChannels(hex)]),
  )
}

/** Semantic colour names exposed as Tailwind colours backed by CSS vars. */
export const semanticTokenNames = Object.keys(lightTheme) as SemanticTokenName[]
