import 'server-only'

import { createServerSupabase } from '@/lib/supabase/server'
import type { AppSettings, ParLevel, Profile, Sauce, Site } from '@/lib/types/database'

export async function getSauces(options: { includeInactive?: boolean } = {}): Promise<Sauce[]> {
  const supabase = createServerSupabase()
  let query = supabase.from('sauces').select('*').order('sort_order').order('name')

  if (!options.includeInactive) query = query.eq('active', true)

  const { data, error } = await query.returns<Sauce[]>()
  if (error) throw new Error(`Loading sauces: ${error.message}`)
  return data ?? []
}

export async function getSites(): Promise<Site[]> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase.from('sites').select('*').order('name').returns<Site[]>()
  if (error) throw new Error(`Loading sites: ${error.message}`)
  return data ?? []
}

export async function getParLevels(): Promise<ParLevel[]> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase.from('par_levels').select('*').returns<ParLevel[]>()
  if (error) throw new Error(`Loading par levels: ${error.message}`)
  return data ?? []
}

/** `sauceId:siteId` -> target ml, for quick lookup in tables. */
export function indexParLevels(parLevels: ParLevel[]): Map<string, number> {
  return new Map(parLevels.map((par) => [`${par.sauce_id}:${par.site_id}`, par.target_ml]))
}

export async function getStaff(): Promise<Profile[]> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('role')
    .order('full_name')
    .returns<Profile[]>()
  if (error) throw new Error(`Loading staff: ${error.message}`)
  return data ?? []
}

export async function getAppSettings(): Promise<AppSettings> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('app_settings')
    .select('*')
    .eq('id', true)
    .single<AppSettings>()
  if (error) throw new Error(`Loading settings: ${error.message}`)
  return data
}
