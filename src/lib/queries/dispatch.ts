import 'server-only'

import { createServerSupabase } from '@/lib/supabase/server'
import { type DateOnly, today } from '@/lib/date'
import { getPlan } from '@/lib/queries/planning'
import type { StockTransfer } from '@/lib/types/database'

/** One sauce on the delivery run. */
export interface DispatchLine {
  sauceId: string
  sauceName: string
  /** Sealed stock sitting at the prep kitchen right now. */
  availableMl: number
  availableBags: number
  /** What the plan says this restaurant needs. */
  neededMl: number
  /** Already sent today. */
  sentMl: number
  sentBags: number
  /** What is still outstanding — the number the Send button is pre-filled with. */
  remainingMl: number
}

export interface DispatchBoard {
  date: DateOnly
  lines: DispatchLine[]
  totalRemainingMl: number
  totalSentMl: number
  /** True once nothing is outstanding. */
  complete: boolean
}

/**
 * What still needs to go from the prep kitchen to one restaurant today.
 *
 * "Needed" comes from the plan's per-restaurant split, so the suggestion is the
 * same number the forecast used when deciding how much to cook — the two can't
 * disagree.
 */
export async function getDispatchBoard(options: {
  fromSiteId: string
  toSiteId: string
  prepDate: DateOnly
  date?: DateOnly
  bagSizesMl?: number[]
}): Promise<DispatchBoard> {
  const supabase = createServerSupabase()
  const date = options.date ?? today()

  const [plan, stockResult, transferResult] = await Promise.all([
    getPlan(options.fromSiteId, options.prepDate, options.bagSizesMl),
    supabase
      .from('bags')
      .select('sauce_id, size_ml, sauces(name, sort_order)')
      .eq('site_id', options.fromSiteId)
      .eq('status', 'sealed')
      .returns<
        Array<{
          sauce_id: string
          size_ml: number
          sauces: { name: string; sort_order: number } | null
        }>
      >(),
    supabase
      .from('stock_transfers')
      .select('sauce_id, ml, bags')
      .eq('from_site_id', options.fromSiteId)
      .eq('to_site_id', options.toSiteId)
      .eq('transfer_date', date)
      .returns<Array<{ sauce_id: string; ml: number; bags: number }>>(),
  ])

  const availableMl = new Map<string, number>()
  const availableBags = new Map<string, number>()
  const names = new Map<string, { name: string; sortOrder: number }>()

  for (const bag of stockResult.data ?? []) {
    availableMl.set(bag.sauce_id, (availableMl.get(bag.sauce_id) ?? 0) + bag.size_ml)
    availableBags.set(bag.sauce_id, (availableBags.get(bag.sauce_id) ?? 0) + 1)
    if (bag.sauces) {
      names.set(bag.sauce_id, { name: bag.sauces.name, sortOrder: bag.sauces.sort_order })
    }
  }

  const sentMl = new Map<string, number>()
  const sentBags = new Map<string, number>()
  for (const transfer of transferResult.data ?? []) {
    sentMl.set(transfer.sauce_id, (sentMl.get(transfer.sauce_id) ?? 0) + transfer.ml)
    sentBags.set(transfer.sauce_id, (sentBags.get(transfer.sauce_id) ?? 0) + transfer.bags)
  }

  const needed = new Map<string, number>()
  for (const item of plan?.items ?? []) {
    const allocation = item.allocations.find((entry) => entry.siteId === options.toSiteId)
    if (allocation && allocation.ml > 0) {
      needed.set(item.sauceId, allocation.ml)
      names.set(item.sauceId, {
        name: item.sauceName,
        sortOrder: names.get(item.sauceId)?.sortOrder ?? 0,
      })
    }
  }

  // A sauce belongs on the run if it is needed, or if some of it has already
  // gone across today (so the record stays visible after sending).
  const sauceIds = new Set([...needed.keys(), ...sentMl.keys()])

  const lines: DispatchLine[] = Array.from(sauceIds)
    .map((sauceId) => {
      const neededMl = needed.get(sauceId) ?? 0
      const alreadySent = sentMl.get(sauceId) ?? 0
      const stock = availableMl.get(sauceId) ?? 0
      return {
        sauceId,
        sauceName: names.get(sauceId)?.name ?? 'Unknown sauce',
        sortOrder: names.get(sauceId)?.sortOrder ?? 0,
        availableMl: stock,
        availableBags: availableBags.get(sauceId) ?? 0,
        neededMl,
        sentMl: alreadySent,
        sentBags: sentBags.get(sauceId) ?? 0,
        // Never suggest sending more than is physically on the shelf.
        remainingMl: Math.min(Math.max(0, neededMl - alreadySent), stock),
      }
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.sauceName.localeCompare(b.sauceName))
    .map(({ sortOrder: _sortOrder, ...rest }) => rest)

  const totalRemainingMl = lines.reduce((sum, line) => sum + line.remainingMl, 0)

  return {
    date,
    lines,
    totalRemainingMl,
    totalSentMl: lines.reduce((sum, line) => sum + line.sentMl, 0),
    complete: lines.length > 0 && totalRemainingMl === 0,
  }
}

export interface TransferEntry extends StockTransfer {
  sauceName: string
  fromSiteName: string
  toSiteName: string
}

/**
 * Recent deliveries, newest first.
 *
 * `toSiteId` narrows it to one receiving store. With several stores on the
 * system an unfiltered list would interleave three or four delivery runs,
 * which reads as noise on a screen about one of them.
 */
export async function getRecentTransfers(
  options: { toSiteId?: string; limit?: number } = {},
): Promise<TransferEntry[]> {
  const supabase = createServerSupabase()

  let query = supabase
    .from('stock_transfers')
    .select(
      'id, sauce_id, from_site_id, to_site_id, transfer_date, ml, bags, created_by, created_at, sauces(name), from_site:sites!stock_transfers_from_site_id_fkey(name), to_site:sites!stock_transfers_to_site_id_fkey(name)',
    )
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 40)

  if (options.toSiteId) query = query.eq('to_site_id', options.toSiteId)

  const { data, error } = await query
    .returns<
      Array<
        StockTransfer & {
          sauces: { name: string } | null
          from_site: { name: string } | null
          to_site: { name: string } | null
        }
      >
    >()
  if (error) throw new Error(`Loading transfers: ${error.message}`)

  return (data ?? []).map((row) => ({
    ...row,
    sauceName: row.sauces?.name ?? 'Unknown sauce',
    fromSiteName: row.from_site?.name ?? 'Unknown site',
    toSiteName: row.to_site?.name ?? 'Unknown site',
  }))
}
