import 'server-only'

import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

/** Shape `@supabase/ssr` hands to `setAll` when it rotates the session. */
type CookieToSet = { name: string; value: string; options: CookieOptions }

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`)
  }
  return value
}

/**
 * Request-scoped Supabase client for Server Components, Route Handlers and
 * Server Actions. Runs as the signed-in user, so RLS applies.
 */
export function createServerSupabase(): SupabaseClient {
  const cookieStore = cookies()

  return createServerClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // The middleware refreshes the session instead, so this is safe.
          }
        },
      },
    },
  )
}

/**
 * Service-role client. Bypasses RLS entirely — only for trusted server-side
 * jobs (seeding, the scheduled digest, admin user management). Never import
 * this into anything that reaches the browser.
 */
export function createAdminSupabase(): SupabaseClient {
  return createSupabaseClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  )
}
