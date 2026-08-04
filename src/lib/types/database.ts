/**
 * Hand-maintained mirror of the Supabase schema.
 *
 * Regenerate/verify with:
 *   npx supabase gen types typescript --project-id <ref> --schema public
 */

export type UserRole = 'manager' | 'staff'
export type BagSizeValue = '1L' | '2L'
export type PrepTypeValue = 'tuesday' | 'friday'
export type PlanStatus = 'draft' | 'confirmed' | 'completed' | 'cancelled'
export type BagStatus = 'sealed' | 'opened' | 'used' | 'discarded'
export type AlertType = 'expiry' | 'low_stock' | 'pattern'
export type AlertSeverity = 'info' | 'warning' | 'critical'

export interface Site {
  id: string
  name: string
  slug: string
  address: string | null
  created_at: string
  updated_at: string
}

export interface Profile {
  id: string
  email: string
  full_name: string
  role: UserRole
  site_id: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface Sauce {
  id: string
  name: string
  slug: string
  bag_size: BagSizeValue
  active: boolean
  sort_order: number
  introduced_on: string
  created_at: string
  updated_at: string
}

export interface ParLevel {
  id: string
  sauce_id: string
  site_id: string
  target_bags: number
  created_at: string
  updated_at: string
}

export interface PrepPlan {
  id: string
  site_id: string
  prep_date: string
  prep_type: PrepTypeValue
  covers_days: number
  status: PlanStatus
  created_by: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface PrepPlanItem {
  id: string
  plan_id: string
  sauce_id: string
  suggested_bags: number
  override_bags: number | null
  reasoning: ForecastReasoning | Record<string, never>
  created_at: string
  updated_at: string
}

export interface PrepSession {
  id: string
  site_id: string
  plan_id: string | null
  staff_id: string
  prep_date: string
  started_at: string
  ended_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface PrepChecklistRow {
  id: string
  session_id: string
  sauce_id: string
  planned_bags: number
  cooked_at: string | null
  blast_chilled_at: string | null
  vacuum_packed_at: string | null
  created_at: string
  updated_at: string
}

export interface Bag {
  id: string
  sauce_id: string
  site_id: string
  prep_session_id: string | null
  bag_size: BagSizeValue
  prep_date: string
  sealed_expiry: string
  status: BagStatus
  opened_at: string | null
  opened_expiry: string | null
  used_at: string | null
  discarded_at: string | null
  discard_reason: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface UsageLog {
  id: string
  site_id: string
  sauce_id: string
  usage_date: string
  bags_opened: number
  notes: string | null
  logged_by: string | null
  created_at: string
  updated_at: string
}

export interface SuggestedAction {
  key: 'emergency_top_up' | 'pull_from_other_site' | 'increase_next_batch' | string
  label: string
  description: string
}

export interface Alert {
  id: string
  type: AlertType
  severity: AlertSeverity
  site_id: string | null
  sauce_id: string | null
  title: string
  message: string
  suggested_actions: SuggestedAction[]
  metadata: Record<string, unknown>
  dedupe_key: string | null
  resolved: boolean
  resolved_at: string | null
  resolved_by: string | null
  created_at: string
}

export interface AppSettings {
  id: boolean
  timezone: string
  digest_hour: number
  digest_recipients: string[]
  low_stock_alerts_enabled: boolean
  forecast_buffer: number
  forecast_window_days: number
  updated_at: string
}

/* -------------------------------------------------------------------------- */
/* Views                                                                      */
/* -------------------------------------------------------------------------- */

export interface BagExpiryRow {
  id: string
  sauce_id: string
  site_id: string
  prep_session_id: string | null
  bag_size: BagSizeValue
  prep_date: string
  status: BagStatus
  sealed_expiry: string
  opened_at: string | null
  opened_expiry: string | null
  used_at: string | null
  discarded_at: string | null
  effective_expiry: string
  days_remaining: number
}

export interface LiveStockRow {
  sauce_id: string
  site_id: string
  sauce_name: string
  bag_size: BagSizeValue
  site_name: string
  par_level: number
  sealed_bags: number
  opened_bags: number
  usable_bags: number
  expiring_today: number
  expiring_soon: number
}

export interface OvertimeRow {
  session_id: string
  staff_id: string
  staff_name: string
  site_id: string
  site_name: string
  prep_date: string
  started_at: string
  ended_at: string | null
  month: string
  hours_worked: number
}

export interface PrepVsPlanRow {
  plan_id: string
  site_id: string
  prep_date: string
  prep_type: PrepTypeValue
  status: PlanStatus
  sauce_id: string
  sauce_name: string
  bag_size: BagSizeValue
  planned_bags: number
  suggested_bags: number
  override_bags: number | null
  actual_bags: number
  variance: number
}

/* -------------------------------------------------------------------------- */
/* RPC payloads                                                               */
/* -------------------------------------------------------------------------- */

export interface ForecastInputRow {
  sauce_id: string
  sauce_name: string
  bag_size: BagSizeValue
  introduced_on: string
  par_level: number
  usable_bags: number
  sealed_bags: number
  opened_bags: number
  usage: Array<{ date: string; bags: number }>
}

export interface OpenBagsResult {
  requested: number
  opened: number
  shortfall: number
  usage_total?: number
}

/**
 * The forecast engine's full working, stored on each plan item so the UI can
 * show exactly why a number was suggested.
 */
export interface ForecastReasoning {
  method: 'history' | 'par_fallback' | 'partial_history'
  confidence: 'high' | 'medium' | 'low'
  burnRatePerDay: number
  observedDays: number
  totalBagsUsed: number
  weekdayMultipliers: Record<string, number>
  coverageDates: Array<{ date: string; weekday: string; multiplier: number; projected: number }>
  projectedNeed: number
  usableStock: number
  bufferMultiplier: number
  parLevel: number
  parFloorApplied: boolean
  rawSuggestion: number
  suggestedBags: number
  notes: string[]
}
