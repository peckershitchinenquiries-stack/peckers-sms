import 'server-only'

import { redirect } from 'next/navigation'
import { cache } from 'react'
import { createServerSupabase } from '@/lib/supabase/server'
import type { AppSettings, Profile, Site } from '@/lib/types/database'

export interface SessionContext {
  profile: Profile
  /** Both sites for a manager; just their own for staff. */
  sites: Site[]
  settings: AppSettings
  isManager: boolean
}

/**
 * The signed-in user's profile, sites and app settings.
 *
 * `cache()` de-duplicates this across a single render pass, so a page and its
 * children can each ask for the session without extra round trips.
 */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = createServerSupabase()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const [{ data: profile }, { data: sites }, { data: settings }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single<Profile>(),
    supabase.from('sites').select('*').order('name').returns<Site[]>(),
    supabase.from('app_settings').select('*').eq('id', true).single<AppSettings>(),
  ])

  if (!profile || !profile.active) return null

  const isManager = profile.role === 'manager'
  const allSites = sites ?? []

  return {
    profile,
    sites: isManager ? allSites : allSites.filter((site) => site.id === profile.site_id),
    settings:
      settings ??
      ({
        id: true,
        timezone: 'Europe/London',
        digest_hour: 8,
        digest_recipients: [],
        low_stock_alerts_enabled: true,
        forecast_buffer: 1.1,
        forecast_window_days: 28,
        bag_sizes_ml: [300, 500, 1000, 2000],
        updated_at: new Date().toISOString(),
      } satisfies AppSettings),
    isManager,
  }
})

/** Requires a session; redirects to /login otherwise. */
export async function requireSession(): Promise<SessionContext> {
  const context = await getSessionContext()
  if (!context) redirect('/login')
  return context
}

/** Requires a manager; sends kitchen staff back to their own home view. */
export async function requireManager(): Promise<SessionContext> {
  const context = await requireSession()
  if (!context.isManager) redirect('/today')
  return context
}

/**
 * Resolves which site a request should act on.
 *
 * Staff are pinned to their own site regardless of what the URL asks for.
 * Managers may pass `?site=<id>`; with no parameter they see both sites, which
 * the caller represents as `null`.
 */
export function resolveSiteScope(
  context: SessionContext,
  requestedSiteId?: string | null,
): string | null {
  if (!context.isManager) return context.profile.site_id
  if (!requestedSiteId || requestedSiteId === 'all') return null
  return context.sites.some((site) => site.id === requestedSiteId) ? requestedSiteId : null
}

/** The site a write must be attributed to. Managers must choose explicitly. */
export function requireWriteSite(
  context: SessionContext,
  requestedSiteId?: string | null,
): string {
  if (!context.isManager) {
    if (!context.profile.site_id) {
      throw new Error('Your account is not linked to a site. Ask a manager to fix this.')
    }
    return context.profile.site_id
  }

  if (!requestedSiteId) {
    throw new Error('Choose a site before saving.')
  }
  if (!context.sites.some((site) => site.id === requestedSiteId)) {
    throw new Error('You do not have access to that site.')
  }
  return requestedSiteId
}
