'use client'

import * as React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from './ThemeProvider'
import { ToastProvider } from '@/components/ui'

export function Providers({ children }: { children: React.ReactNode }) {
  // One client per browser session; created lazily so SSR never shares state.
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Kitchen data changes on a human timescale — a short stale window
            // keeps the tablet responsive without hammering Supabase.
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: true,
            retry: 1,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>{children}</ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
