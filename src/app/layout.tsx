import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers/Providers'
import { themeInitScript } from '@/components/providers/ThemeProvider'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
})

export const metadata: Metadata = {
  title: {
    default: 'Sauce Management System · Peckers',
    template: '%s · Peckers SMS',
  },
  description:
    'Forecast, prep, track and use every house sauce across Peckers Stevenage and Hitchin.',
  applicationName: 'Peckers SMS',
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FBFAF8' },
    { media: '(prefers-color-scheme: dark)', color: '#131211' },
  ],
  width: 'device-width',
  initialScale: 1,
  // Kitchen tablets get pinch-zoom; we never lock it.
  maximumScale: 5,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-tooltip focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-brand-ink"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
