'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

let browserClient: SupabaseClient | undefined

/**
 * Browser-side Supabase client. Memoised so every hook shares one connection
 * (and therefore one realtime socket and one auth state listener).
 */
export function createClient(): SupabaseClient {
  if (browserClient) return browserClient

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill them in.',
    )
  }

  browserClient = createBrowserClient(url, anonKey)
  return browserClient
}
