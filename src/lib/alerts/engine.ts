import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  type DateOnly,
  addDaysTo,
  daysUntilNextPrep,
  nextPrepDayAfter,
  today,
  formatShort,
} from '@/lib/date'
import { detectWeekdaySpikes, type UsageObservation } from '@/lib/forecast/engine'
import { formatMl } from '@/lib/utils/volume'
import type {
  AlertSeverity,
  AlertType,
  ForecastInputRow,
  SuggestedAction,
} from '@/lib/types/database'

export interface AlertDraft {
  type: AlertType
  severity: AlertSeverity
  siteId: string
  sauceId: string | null
  title: string
  message: string
  suggestedActions: SuggestedAction[]
  metadata: Record<string, unknown>
  /** Keeps the daily scan from raising the same alert twice. */
  dedupeKey: string
}

/**
 * The three actions offered on every low-stock alert. The manager picks one;
 * the app knows how to carry out each.
 */
function lowStockActions(context: {
  sauceName: string
  shortfallMl: number
  otherSiteName: string | null
}): SuggestedAction[] {
  const actions: SuggestedAction[] = [
    {
      key: 'emergency_top_up',
      label: 'Emergency top-up',
      description: `Run a small out-of-cycle batch of ${formatMl(context.shortfallMl)} of ${context.sauceName} to bridge the gap.`,
    },
  ]

  if (context.otherSiteName) {
    actions.push({
      key: 'pull_from_other_site',
      label: `Pull from ${context.otherSiteName}`,
      description: `Move sealed bags across from ${context.otherSiteName} if they have spare.`,
    })
  }

  actions.push({
    key: 'increase_next_batch',
    label: 'Increase the next batch',
    description: `Add ${formatMl(context.shortfallMl)} to the next prep plan so this doesn't repeat.`,
  })

  return actions
}

/* -------------------------------------------------------------------------- */
/* Scans                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Flags sauces on track to run out before the next prep day.
 *
 * Compares current usable stock against burn rate × days until restock, which
 * is exactly the question staff care about: "will this last until Friday?"
 */
export async function scanLowStock(
  supabase: SupabaseClient,
  site: { id: string; name: string },
  otherSiteName: string | null,
  options: { windowDays: number; asOf?: DateOnly },
): Promise<AlertDraft[]> {
  const asOf = options.asOf ?? today()
  const daysToRestock = daysUntilNextPrep(asOf)
  const nextPrep = nextPrepDayAfter(asOf)

  const { data, error } = await supabase.rpc('forecast_inputs', {
    p_site_id: site.id,
    p_window_days: options.windowDays,
    p_as_of: asOf,
  })
  if (error) throw new Error(`Low-stock scan: ${error.message}`)

  const drafts: AlertDraft[] = []

  for (const row of (data ?? []) as ForecastInputRow[]) {
    const usage = row.usage ?? []
    const totalUsed = usage.reduce((sum, entry) => sum + entry.ml, 0)
    if (totalUsed === 0) continue

    const burnRate = totalUsed / options.windowDays
    const expectedDemandMl = burnRate * daysToRestock
    const usableMl = Number(row.usable_ml)

    if (usableMl >= expectedDemandMl) continue

    const shortfallMl = Math.max(1, Math.ceil(expectedDemandMl - usableMl))
    // Out already, or out before restock — the difference matters to a manager.
    const severity: AlertSeverity = usableMl === 0 ? 'critical' : 'warning'

    drafts.push({
      type: 'low_stock',
      severity,
      siteId: site.id,
      sauceId: row.sauce_id,
      title: `${row.sauce_name} will run out at ${site.name}`,
      message:
        `${formatMl(usableMl)} in stock against ${formatMl(expectedDemandMl)} ` +
        `of expected demand before the ${formatShort(nextPrep.date)} prep ` +
        `(${formatMl(burnRate)}/day over the last ${options.windowDays} days).`,
      suggestedActions: lowStockActions({
        sauceName: row.sauce_name,
        shortfallMl,
        otherSiteName,
      }),
      metadata: {
        burnRateMl: Number(burnRate.toFixed(2)),
        usableMl,
        expectedDemandMl: Number(expectedDemandMl.toFixed(2)),
        shortfallMl,
        daysToRestock,
        nextPrepDate: nextPrep.date,
      },
      dedupeKey: `low_stock:${site.id}:${row.sauce_id}:${asOf}`,
    })
  }

  return drafts
}

/** Raises one alert per site summarising everything amber or red. */
export async function scanExpiry(
  supabase: SupabaseClient,
  site: { id: string; name: string },
  options: { asOf?: DateOnly } = {},
): Promise<AlertDraft[]> {
  const asOf = options.asOf ?? today()
  const horizon = addDaysTo(asOf, 2)

  const { data, error } = await supabase
    .from('bags')
    .select('id, sauce_id, status, sealed_expiry, opened_expiry, sauces(name)')
    .eq('site_id', site.id)
    .in('status', ['sealed', 'opened'])
    .returns<
      Array<{
        id: string
        sauce_id: string
        status: string
        sealed_expiry: string
        opened_expiry: string | null
        sauces: { name: string } | null
      }>
    >()
  if (error) throw new Error(`Expiry scan: ${error.message}`)

  const atRisk = (data ?? []).filter((bag) => {
    const expiry = bag.opened_expiry ?? bag.sealed_expiry
    return expiry <= horizon
  })

  if (atRisk.length === 0) return []

  const bySauce = new Map<string, { name: string; today: number; soon: number }>()
  let expiringToday = 0

  for (const bag of atRisk) {
    const expiry = bag.opened_expiry ?? bag.sealed_expiry
    const entry = bySauce.get(bag.sauce_id) ?? {
      name: bag.sauces?.name ?? 'Unknown sauce',
      today: 0,
      soon: 0,
    }
    if (expiry <= asOf) {
      entry.today += 1
      expiringToday += 1
    } else {
      entry.soon += 1
    }
    bySauce.set(bag.sauce_id, entry)
  }

  const breakdown = Array.from(bySauce.values())
    .sort((a, b) => b.today - a.today || b.soon - a.soon)
    .map((entry) => `${entry.name} (${entry.today + entry.soon})`)
    .slice(0, 6)
    .join(', ')

  return [
    {
      type: 'expiry',
      severity: expiringToday > 0 ? 'critical' : 'warning',
      siteId: site.id,
      sauceId: null,
      title:
        expiringToday > 0
          ? `${expiringToday} bag${expiringToday === 1 ? '' : 's'} expiring today at ${site.name}`
          : `${atRisk.length} bags expiring soon at ${site.name}`,
      message: `${atRisk.length} bag${atRisk.length === 1 ? '' : 's'} within 2 days of expiry: ${breakdown}.`,
      suggestedActions: [
        {
          key: 'prioritise_today',
          label: 'Use these first',
          description: 'Move these bags to the front of the line for today’s service.',
        },
        {
          key: 'review_par',
          label: 'Review par levels',
          description: 'Repeated waste on a sauce usually means its par level is too high.',
        },
        {
          key: 'discard_expired',
          label: 'Record waste',
          description: 'Mark anything past its date as discarded so stock stays accurate.',
        },
      ],
      metadata: { atRisk: atRisk.length, expiringToday },
      dedupeKey: `expiry:${site.id}:${asOf}`,
    },
  ]
}

/**
 * Detects sauces that reliably spike on the same weekday.
 *
 * Only runs once there are 4 full weeks of data — below that a "pattern" is
 * usually noise, and a wrong pattern alert costs more trust than it's worth.
 */
export async function scanPatterns(
  supabase: SupabaseClient,
  site: { id: string; name: string },
  options: { windowDays: number; asOf?: DateOnly },
): Promise<AlertDraft[]> {
  const asOf = options.asOf ?? today()
  const windowDays = Math.max(28, options.windowDays)

  const { data, error } = await supabase.rpc('forecast_inputs', {
    p_site_id: site.id,
    p_window_days: windowDays,
    p_as_of: asOf,
  })
  if (error) throw new Error(`Pattern scan: ${error.message}`)

  const drafts: AlertDraft[] = []

  for (const row of (data ?? []) as ForecastInputRow[]) {
    const usage: UsageObservation[] = (row.usage ?? []).map((entry) => ({
      date: entry.date,
      ml: entry.ml,
    }))
    if (usage.length < 20) continue

    const spikes = detectWeekdaySpikes(usage, { observedDays: windowDays })
    if (spikes.length === 0) continue

    const top = spikes[0]

    drafts.push({
      type: 'pattern',
      severity: 'info',
      siteId: site.id,
      sauceId: row.sauce_id,
      title: `${row.sauce_name} spikes on ${top.weekdayName}s at ${site.name}`,
      message:
        `Over the last ${windowDays} days, ${top.weekdayName}s use about ` +
        `${top.percentAbove}% more ${row.sauce_name} than an average day. ` +
        `The forecast already accounts for this when a batch covers a ${top.weekdayName}.`,
      suggestedActions: [
        {
          key: 'increase_next_batch',
          label: 'Bump the covering batch',
          description: `Add a bag or two to whichever batch covers ${top.weekdayName}.`,
        },
        {
          key: 'review_par',
          label: 'Review the par level',
          description: `A higher par at ${site.name} would absorb the ${top.weekdayName} peak.`,
        },
        {
          key: 'acknowledge',
          label: 'Acknowledge',
          description: 'Dismiss this — the pattern is already understood.',
        },
      ],
      metadata: { spikes },
      // Weekly, not daily — a stable pattern doesn't need repeating every day.
      dedupeKey: `pattern:${site.id}:${row.sauce_id}:${top.weekday}:${weekStamp(asOf)}`,
    })
  }

  return drafts
}

function weekStamp(date: DateOnly): string {
  // Coarse weekly bucket; good enough to throttle pattern alerts.
  const time = new Date(`${date}T00:00:00Z`).getTime()
  return String(Math.floor(time / (7 * 86_400_000)))
}

/* -------------------------------------------------------------------------- */
/* Runner                                                                     */
/* -------------------------------------------------------------------------- */

export interface ScanReport {
  created: number
  skipped: number
  drafts: AlertDraft[]
}

/**
 * Runs every scan across every site and persists new alerts.
 *
 * `dedupe_key` has a unique index, so re-running the same day is a no-op
 * rather than a duplicate storm.
 */
export async function runAlertScan(
  supabase: SupabaseClient,
  options: {
    sites: Array<{ id: string; name: string }>
    windowDays?: number
    asOf?: DateOnly
    includePatterns?: boolean
  },
): Promise<ScanReport> {
  const windowDays = options.windowDays ?? 28
  const asOf = options.asOf ?? today()
  const drafts: AlertDraft[] = []

  for (const site of options.sites) {
    const otherSite = options.sites.find((candidate) => candidate.id !== site.id) ?? null

    const [lowStock, expiry, patterns] = await Promise.all([
      scanLowStock(supabase, site, otherSite?.name ?? null, { windowDays, asOf }),
      scanExpiry(supabase, site, { asOf }),
      options.includePatterns === false
        ? Promise.resolve([])
        : scanPatterns(supabase, site, { windowDays, asOf }),
    ])

    drafts.push(...lowStock, ...expiry, ...patterns)
  }

  if (drafts.length === 0) return { created: 0, skipped: 0, drafts }

  const { data, error } = await supabase
    .from('alerts')
    .upsert(
      drafts.map((draft) => ({
        type: draft.type,
        severity: draft.severity,
        site_id: draft.siteId,
        sauce_id: draft.sauceId,
        title: draft.title,
        message: draft.message,
        suggested_actions: draft.suggestedActions,
        metadata: draft.metadata,
        dedupe_key: draft.dedupeKey,
      })),
      { onConflict: 'dedupe_key', ignoreDuplicates: true },
    )
    .select('id')
  if (error) throw new Error(`Saving alerts: ${error.message}`)

  const created = data?.length ?? 0
  return { created, skipped: drafts.length - created, drafts }
}
