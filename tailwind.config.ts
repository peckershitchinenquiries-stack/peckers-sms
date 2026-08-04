import type { Config } from 'tailwindcss'
import plugin from 'tailwindcss/plugin'
import {
  brand,
  danger,
  darkTheme,
  fontSize,
  lightTheme,
  motion,
  neutral,
  radii,
  semanticTokenNames,
  shadows,
  spacing,
  success,
  themeToCssVars,
  warning,
  zIndex,
} from './src/lib/design/tokens'

/**
 * Every semantic token becomes a Tailwind colour backed by a CSS variable, so
 * `bg-surface` / `text-ink-muted` automatically flip between light and dark
 * without a single `dark:` variant in feature code.
 */
const semanticColors = Object.fromEntries(
  semanticTokenNames.map((name) => [name, `rgb(var(--sms-${name}) / <alpha-value>)`]),
) as Record<string, string>

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ...semanticColors,
        // Raw scales — for the component gallery and the rare chart ramp.
        raw: { neutral, brand, success, warning, danger },
      },
      borderRadius: radii,
      spacing,
      fontSize: fontSize as unknown as Config['theme'],
      boxShadow: shadows,
      zIndex,
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      transitionTimingFunction: {
        out: `cubic-bezier(${motion.ease.out.join(',')})`,
        'in-out': `cubic-bezier(${motion.ease.inOut.join(',')})`,
      },
      transitionDuration: {
        fast: `${motion.duration.fast * 1000}ms`,
        base: `${motion.duration.base * 1000}ms`,
        slow: `${motion.duration.slow * 1000}ms`,
      },
      backdropBlur: {
        xs: '2px',
      },
      keyframes: {
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite',
        'pulse-soft': 'pulse-soft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [
    plugin(({ addBase, addUtilities }) => {
      addBase({
        ':root': themeToCssVars(lightTheme),
        '.dark': themeToCssVars(darkTheme),
      })
      addUtilities({
        // Consistent, visible focus ring used by every custom control.
        '.focus-ring': {
          outline: '2px solid transparent',
          outlineOffset: '2px',
          '&:focus-visible': {
            outline: 'none',
            boxShadow: `0 0 0 2px rgb(var(--sms-canvas)), 0 0 0 4px rgb(var(--sms-focus))`,
          },
        },
        '.focus-ring-inset': {
          '&:focus-visible': {
            outline: 'none',
            boxShadow: `inset 0 0 0 2px rgb(var(--sms-focus))`,
          },
        },
      })
    }),
  ],
}

export default config
