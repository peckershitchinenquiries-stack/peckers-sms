/**
 * Hand-maintained mirror of the Supabase schema.
 *
 * Regenerate/verify with:
 *   npx supabase gen types typescript --project-id <ref> --schema public
 */

import type { PackResult } from '@/lib/forecast/packing'

export type UserRole = 'manager' | 'staff'
export type PlanStatus = 'draft' | 'confirmed' | 'completed' | 'cancelled'
export type BagStatus = 'sealed' | 'opened' | 'used' | 'discarded'
export type AlertType = 'expiry' | 'low_stock' | 'pattern'
export type AlertSeverity = 'info' | 'warning' | 'critical'

export interface Site {
  id: string
  name: string
  slug: string
  address: string | null
  /** Sauce is cooked here and delivered out. Only prep sites see the checklist. */
  is_prep_site: boolean
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
  active: boolean
  sort_order: number
  introduced_on: string
  /** Days a sealed bag lasts from its prep date. Manager-editable, default 5. */
  sealed_shelf_life_days: number
  /** Days an opened bag lasts from the moment it was opened. Manager-editable, default 2. */
  opened_shelf_life_days: number
  created_at: string
  updated_at: string
}

export interface ParLevel {
  id: string
  sauce_id: string
  site_id: string
  target_ml: number
  created_at: string
  updated_at: string
}

export interface PrepPlan {
  id: string
  site_id: string
  prep_date: string
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
  suggested_ml: number
  override_ml: number | null
  reasoning: ForecastReasoning | Record<string, never>
  created_at: string
  updated_at: string
}

/** How much of a plan line is each restaurant's demand. Drives dispatch. */
export interface PrepPlanAllocation {
  id: string
  item_id: string
  site_id: string
  suggested_ml: number
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

/**
 * One line of a day's prep. Keyed by (site, date, sauce) rather than by
 * session, so it exists — and stays in step with the plan — whether or not
 * anyone has clocked in.
 */
export interface PrepChecklistRow {
  id: string
  site_id: string
  prep_date: string
  session_id: string | null
  sauce_id: string
  planned_ml: number
  /** What was actually made. Zero until the line is completed. */
  actual_ml: number
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface Bag {
  id: string
  sauce_id: string
  site_id: string
  prep_session_id: string | null
  size_ml: number
  /** How much is actually left in this bag. Drawn down by `consume_stock`. */
  remaining_ml: number
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
  ml_used: number
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
  /** The bag sizes (ml) available when packing a batch. Default 300/500/1000/2000. */
  bag_sizes_ml: number[]
  /** Weekdays sauce is prepared on, 0 = Sunday … 6 = Saturday. Default Tue + Fri. */
  prep_weekdays: number[]
  updated_at: string
}

export interface StockTransfer {
  id: string
  sauce_id: string
  from_site_id: string
  to_site_id: string
  transfer_date: string
  ml: number
  bags: number
  created_by: string | null
  created_at: string
}

/* -------------------------------------------------------------------------- */
/* Views                                                                      */
/* -------------------------------------------------------------------------- */

export interface BagExpiryRow {
  id: string
  sauce_id: string
  site_id: string
  prep_session_id: string | null
  size_ml: number
  remaining_ml: number
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
  site_name: string
  par_level_ml: number
  sealed_bags: number
  opened_bags: number
  usable_bags: number
  sealed_ml: number
  opened_ml: number
  usable_ml: number
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
  covers_days: number
  status: PlanStatus
  sauce_id: string
  sauce_name: string
  planned_ml: number
  suggested_ml: number
  override_ml: number | null
  actual_bags: number
  actual_ml: number
  variance_ml: number
}

/* -------------------------------------------------------------------------- */
/* RPC payloads                                                               */
/* -------------------------------------------------------------------------- */

export interface ForecastInputRow {
  sauce_id: string
  sauce_name: string
  introduced_on: string
  par_level_ml: number
  usable_bags: number
  sealed_bags: number
  opened_bags: number
  usable_ml: number
  sealed_ml: number
  opened_ml: number
  usage: Array<{ date: string; ml: number }>
}

export interface OpenStockResult {
  requested_ml: number
  opened_ml: number
  opened_bags: number
  shortfall_ml: number
  usage_total_ml?: number
}

/**
 * What `consume_stock` actually managed to draw down.
 *
 * `shortfall_ml` above zero means the kitchen used more than the system knew
 * about — worth telling the person logging it, not worth blocking them.
 */
export interface ConsumeStockResult {
  requested_ml: number
  consumed_ml: number
  bags_opened: number
  bags_emptied: number
  shortfall_ml: number
  usage_total_ml?: number
}

export interface TransferStockResult {
  requested_ml: number
  moved_ml: number
  moved_bags: number
  shortfall_ml: number
}

/**
 * What undo_usage_log() reports. `ml_unrecoverable` above zero means the bags
 * this entry drew from have since expired and been discarded — that stock is
 * genuinely gone, not silently un-wasted.
 */
export interface UndoUsageLogResult {
  ml_undone: number
  ml_restored_to_stock: number
  ml_unrecoverable: number
}

/** The nightly sweep's tally — how much was written off past its date. */
export interface ExpireStockResult {
  bags: number
  ml: number
}

export interface WasteLog {
  id: string
  site_id: string
  sauce_id: string
  bag_id: string | null
  waste_date: string
  ml: number
  reason: string | null
  /** 'expired' is the automatic sweep; 'manual' is someone pressing Discard. */
  source: 'expired' | 'manual'
  created_by: string | null
  created_at: string
}

/**
 * The forecast engine's full working, stored on each plan item so the number
 * is never a black box.
 */
export interface ForecastReasoning {
  method: 'history' | 'par_fallback' | 'partial_history'
  confidence: 'high' | 'medium' | 'low'
  /** ml/day. */
  burnRatePerDay: number
  observedDays: number
  totalMlUsed: number
  weekdayMultipliers: Record<string, number>
  coverageDates: Array<{ date: string; weekday: string; multiplier: number; projected: number }>
  projectedNeedMl: number
  usableStockMl: number
  bufferMultiplier: number
  parLevelMl: number
  parFloorApplied: boolean
  rawSuggestionMl: number
  suggestedMl: number
  pack: PackResult
  notes: string[]
  /**
   * How the total splits across the restaurants it feeds. Present on plan
   * items, absent on a bare single-site forecast.
   */
  siteBreakdown?: Array<{ siteId: string; siteName: string; ml: number }>
}
