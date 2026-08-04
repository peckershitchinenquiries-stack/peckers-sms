/**
 * Seeds a Supabase project with everything needed to use the app immediately:
 *
 *   • 2 sites (Stevenage, Hitchin)
 *   • the 15 house sauces with correct bag sizes
 *   • par levels per sauce per site
 *   • 3 demo accounts (1 manager, 2 kitchen staff)
 *   • 6 weeks of realistic daily usage, with deliberate weekday spikes so the
 *     forecast engine and pattern detection have something real to chew on
 *   • historical prep sessions + bags, aged and consumed correctly
 *   • live stock with a mix of sealed, opened and expiring-today bags
 *   • a forecast plan for the upcoming prep day
 *
 * Run with:  npm run db:seed
 */

import { config as loadEnv } from 'dotenv'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { fromZonedTime } from 'date-fns-tz'
import {
  APP_TIMEZONE,
  addDaysTo,
  dateRange,
  isPrepDay,
  today,
  upcomingPrepDay,
  weekdayOf,
  type DateOnly,
} from '../../src/lib/date'
import { SAUCE_SEEDS, SITE_SEEDS } from '../../src/lib/constants/catalogue'
import { forecastSauce } from '../../src/lib/forecast/engine'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

/* -------------------------------------------------------------------------- */
/* Config                                                                     */
/* -------------------------------------------------------------------------- */

const HISTORY_DAYS = 42 // 6 weeks — comfortably more than the 28-day window
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'PeckersSMS2026!'

const DEMO_USERS = [
  {
    email: 'manager@peckers.dev',
    fullName: 'Rishi Patel',
    role: 'manager' as const,
    siteSlug: null,
  },
  {
    email: 'staff@peckers.dev',
    fullName: 'Swathi Raman',
    role: 'staff' as const,
    siteSlug: 'stevenage',
  },
  {
    email: 'hitchin@peckers.dev',
    fullName: 'Dan Okafor',
    role: 'staff' as const,
    siteSlug: 'hitchin',
  },
]

/**
 * Per-sauce demand shape. `base` is bags/day at Stevenage; Hitchin runs a bit
 * quieter. `spikeDay`/`spikeFactor` create the repeating weekday patterns the
 * pattern detector is meant to find.
 */
const DEMAND_PROFILE: Record<string, { base: number; spikeDay?: number; spikeFactor?: number }> = {
  buffalo: { base: 2.4, spikeDay: 6, spikeFactor: 1.7 }, // Saturday
  'butter-me-up': { base: 1.4 },
  'garlic-aioli': { base: 2.8, spikeDay: 5, spikeFactor: 1.4 }, // Friday
  'house-mayo': { base: 3.2 },
  'supercharged-og': { base: 1.8, spikeDay: 6, spikeFactor: 1.5 },
  'hot-honey': { base: 2.0, spikeDay: 0, spikeFactor: 1.45 }, // Sunday
  'cheese-sauce': { base: 2.6 },
  'mango-pineapple': { base: 1.1 },
  'katsu-curry': { base: 1.6 },
  'peanut-sweet-chilli': { base: 1.0 },
  'honey-glaze-bbq': { base: 2.1, spikeDay: 6, spikeFactor: 1.35 },
  'korean-gochujang': { base: 1.5 },
  'korean-glaze': { base: 1.4 },
  'og-chilli': { base: 2.2 },
  ranch: { base: 3.0, spikeDay: 5, spikeFactor: 1.6 }, // Friday — the headline pattern
}

/** Mango Pineapple is seeded as a recent addition to exercise the new-sauce path. */
const RECENTLY_INTRODUCED: Record<string, number> = { 'mango-pineapple': 11 }

const SITE_DEMAND_FACTOR: Record<string, number> = { stevenage: 1, hitchin: 0.78 }

/* -------------------------------------------------------------------------- */
/* Deterministic RNG                                                          */
/* -------------------------------------------------------------------------- */

/** mulberry32 — same seed, same demo data on every machine. */
function makeRng(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rng = makeRng(20260804)

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`\n  Missing ${name}. Add it to .env.local before seeding.\n`)
    process.exit(1)
  }
  return value
}

/** An instant at a given wall-clock time on a date, in the business timezone. */
function atLocalTime(date: DateOnly, time: string): string {
  return fromZonedTime(`${date}T${time}`, APP_TIMEZONE).toISOString()
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size))
  }
  return out
}

async function insertInChunks(
  supabase: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
): Promise<void> {
  for (const batch of chunk(rows, 500)) {
    const { error } = await supabase.from(table).insert(batch)
    if (error) throw new Error(`Insert into ${table} failed: ${error.message}`)
  }
}

/* -------------------------------------------------------------------------- */
/* Seed                                                                       */
/* -------------------------------------------------------------------------- */

async function main(): Promise<void> {
  const supabase = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const asOf = today()
  console.log(`\nSeeding Peckers SMS — as of ${asOf} (${APP_TIMEZONE})\n`)

  /* -- 1. Clear transactional data ---------------------------------------- */
  console.log('  · clearing existing transactional data')
  for (const table of [
    'alerts',
    'bags',
    'usage_logs',
    'prep_checklist',
    'prep_sessions',
    'prep_plan_items',
    'prep_plans',
  ]) {
    const { error } = await supabase
      .from(table)
      .delete()
      .gte('created_at', '1970-01-01T00:00:00Z')
    if (error) throw new Error(`Failed clearing ${table}: ${error.message}`)
  }

  /* -- 2. Sites ------------------------------------------------------------ */
  const { data: sites, error: siteError } = await supabase
    .from('sites')
    .upsert(
      SITE_SEEDS.map((site) => ({ name: site.name, slug: site.slug })),
      { onConflict: 'slug' },
    )
    .select('id, name, slug')
  if (siteError) throw new Error(`Sites: ${siteError.message}`)
  console.log(`  · ${sites!.length} sites`)

  const siteBySlug = new Map(sites!.map((site) => [site.slug as string, site]))

  /* -- 3. Sauces ----------------------------------------------------------- */
  const { data: sauces, error: sauceError } = await supabase
    .from('sauces')
    .upsert(
      SAUCE_SEEDS.map((sauce, index) => ({
        name: sauce.name,
        slug: sauce.slug,
        bag_size: sauce.bagSize,
        sort_order: index,
        active: true,
        introduced_on: addDaysTo(asOf, -(RECENTLY_INTRODUCED[sauce.slug] ?? 400)),
      })),
      { onConflict: 'slug' },
    )
    .select('id, name, slug, bag_size, introduced_on')
  if (sauceError) throw new Error(`Sauces: ${sauceError.message}`)
  console.log(`  · ${sauces!.length} sauces`)

  const sauceBySlug = new Map(sauces!.map((sauce) => [sauce.slug as string, sauce]))

  /* -- 4. Par levels ------------------------------------------------------- */
  const parRows = SAUCE_SEEDS.flatMap((sauce) =>
    SITE_SEEDS.map((site) => ({
      sauce_id: sauceBySlug.get(sauce.slug)!.id,
      site_id: siteBySlug.get(site.slug)!.id,
      // Hitchin is the quieter kitchen, so its targets are proportionally lower.
      target_bags: Math.max(
        2,
        Math.round(sauce.defaultPar * (SITE_DEMAND_FACTOR[site.slug] ?? 1)),
      ),
    })),
  )
  const { error: parError } = await supabase
    .from('par_levels')
    .upsert(parRows, { onConflict: 'sauce_id,site_id' })
  if (parError) throw new Error(`Par levels: ${parError.message}`)
  console.log(`  · ${parRows.length} par levels`)

  /* -- 5. Demo users ------------------------------------------------------- */
  const profileByEmail = new Map<string, { id: string; site_id: string | null }>()

  for (const user of DEMO_USERS) {
    const siteId = user.siteSlug ? siteBySlug.get(user.siteSlug)!.id : null

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: user.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: user.fullName, role: user.role, site_id: siteId },
    })

    let userId = created?.user?.id

    if (createError) {
      if (!/already/i.test(createError.message)) {
        throw new Error(`Creating ${user.email}: ${createError.message}`)
      }
      // Already exists from a previous run — find them and reset the password.
      const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
      const existing = list?.users.find((candidate) => candidate.email === user.email)
      if (!existing) throw new Error(`Could not resolve existing user ${user.email}`)
      userId = existing.id
      await supabase.auth.admin.updateUserById(existing.id, { password: DEMO_PASSWORD })
    }

    // The handle_new_user trigger creates the profile; make sure role/site
    // match even if the account predates this seed run.
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert(
        {
          id: userId!,
          email: user.email,
          full_name: user.fullName,
          role: user.role,
          site_id: siteId,
          active: true,
        },
        { onConflict: 'id' },
      )
    if (profileError) throw new Error(`Profile ${user.email}: ${profileError.message}`)

    profileByEmail.set(user.email, { id: userId!, site_id: siteId })
  }
  console.log(`  · ${DEMO_USERS.length} demo accounts (password: ${DEMO_PASSWORD})`)

  /* -- 6. Usage history ---------------------------------------------------- */
  const historyStart = addDaysTo(asOf, -HISTORY_DAYS)
  const allDates = dateRange(historyStart, addDaysTo(asOf, -1))

  const usageRows: Record<string, unknown>[] = []
  /** site -> sauce -> date -> bags, reused when ageing the bag inventory. */
  const usageIndex = new Map<string, Map<string, Map<DateOnly, number>>>()

  for (const site of SITE_SEEDS) {
    const siteId = siteBySlug.get(site.slug)!.id
    const siteFactor = SITE_DEMAND_FACTOR[site.slug] ?? 1
    const perSauce = new Map<string, Map<DateOnly, number>>()

    for (const sauce of SAUCE_SEEDS) {
      const sauceId = sauceBySlug.get(sauce.slug)!.id
      const profile = DEMAND_PROFILE[sauce.slug] ?? { base: 1.5 }
      const introducedDaysAgo = RECENTLY_INTRODUCED[sauce.slug]
      const byDate = new Map<DateOnly, number>()

      for (const date of allDates) {
        // A recently introduced sauce has no usage before it existed.
        if (introducedDaysAgo !== undefined) {
          const age = allDates.length - allDates.indexOf(date)
          if (age > introducedDaysAgo) continue
        }

        const weekday = weekdayOf(date)
        const spike =
          profile.spikeDay === weekday ? (profile.spikeFactor ?? 1.4) : 1
        // Weekends are busier across the board.
        const weekendLift = weekday === 0 || weekday === 6 ? 1.25 : 1
        const noise = 0.78 + rng() * 0.44

        const bags = Math.max(
          0,
          Math.round(profile.base * siteFactor * spike * weekendLift * noise),
        )
        if (bags === 0) continue

        byDate.set(date, bags)
        usageRows.push({
          site_id: siteId,
          sauce_id: sauceId,
          usage_date: date,
          bags_opened: bags,
          logged_by: profileByEmail.get(site.slug === 'hitchin' ? 'hitchin@peckers.dev' : 'staff@peckers.dev')!.id,
        })
      }

      perSauce.set(sauce.slug, byDate)
    }

    usageIndex.set(site.slug, perSauce)
  }

  await insertInChunks(supabase, 'usage_logs', usageRows)
  console.log(`  · ${usageRows.length} daily usage rows across ${HISTORY_DAYS} days`)

  /* -- 7. Prep sessions + bags -------------------------------------------- */
  const prepDates = allDates.filter(isPrepDay).concat(isPrepDay(asOf) ? [asOf] : [])
  const bagRows: Record<string, unknown>[] = []
  let sessionCount = 0

  for (const site of SITE_SEEDS) {
    const siteId = siteBySlug.get(site.slug)!.id
    const staffEmail = site.slug === 'hitchin' ? 'hitchin@peckers.dev' : 'staff@peckers.dev'
    const staffId = profileByEmail.get(staffEmail)!.id

    for (const prepDate of prepDates) {
      // Prep runs 07:00 until somewhere between 10:15 and 11:00.
      const startedAt = atLocalTime(prepDate, '07:00:00')
      const endMinutes = 195 + Math.round(rng() * 45)
      const endedAt = new Date(
        new Date(startedAt).getTime() + endMinutes * 60_000,
      ).toISOString()

      const { data: session, error: sessionError } = await supabase
        .from('prep_sessions')
        .insert({
          site_id: siteId,
          staff_id: staffId,
          prep_date: prepDate,
          started_at: startedAt,
          ended_at: endedAt,
        })
        .select('id')
        .single()
      if (sessionError) throw new Error(`Prep session: ${sessionError.message}`)
      sessionCount += 1

      const coversDays = weekdayOf(prepDate) === 2 ? 3 : 4
      const checklistRows: Record<string, unknown>[] = []

      for (const sauce of SAUCE_SEEDS) {
        const sauceId = sauceBySlug.get(sauce.slug)!.id
        const byDate = usageIndex.get(site.slug)!.get(sauce.slug)!

        // Make roughly what the following days actually consumed, ±1 bag —
        // that's what a kitchen working from memory looks like.
        const consumed = Array.from({ length: coversDays }, (_, offset) =>
          byDate.get(addDaysTo(prepDate, offset)) ?? 0,
        ).reduce((sum, value) => sum + value, 0)

        const made = Math.max(0, consumed + Math.round(rng() * 3) - 1)
        if (made === 0) continue

        checklistRows.push({
          session_id: session!.id,
          sauce_id: sauceId,
          planned_bags: made,
          cooked_at: atLocalTime(prepDate, '07:30:00'),
          blast_chilled_at: atLocalTime(prepDate, '08:15:00'),
          vacuum_packed_at: atLocalTime(prepDate, '09:45:00'),
        })

        const daysOld = dateDiff(prepDate, asOf)

        for (let index = 0; index < made; index += 1) {
          // Bags older than their 5-day sealed life are already resolved.
          // Anything from the last few days is still live stock.
          let status: 'sealed' | 'opened' | 'used' | 'discarded' = 'sealed'
          let openedAt: string | null = null

          if (daysOld > 5) {
            status = rng() < 0.92 ? 'used' : 'discarded'
          } else if (index < Math.floor(made * 0.35)) {
            status = 'used'
          } else if (index < Math.floor(made * 0.5)) {
            status = 'opened'
            openedAt = atLocalTime(addDaysTo(asOf, rng() < 0.5 ? 0 : -1), '11:30:00')
          }

          bagRows.push({
            sauce_id: sauceId,
            site_id: siteId,
            prep_session_id: session!.id,
            bag_size: sauce.bagSize,
            prep_date: prepDate,
            sealed_expiry: addDaysTo(prepDate, 5),
            status,
            opened_at: openedAt,
            used_at: status === 'used' ? atLocalTime(addDaysTo(prepDate, 2), '18:00:00') : null,
            discarded_at:
              status === 'discarded' ? atLocalTime(addDaysTo(prepDate, 5), '20:00:00') : null,
            discard_reason: status === 'discarded' ? 'Expired before use' : null,
            created_by: staffId,
          })
        }
      }

      if (checklistRows.length > 0) {
        await insertInChunks(supabase, 'prep_checklist', checklistRows)
      }
    }
  }

  await insertInChunks(supabase, 'bags', bagRows)
  console.log(`  · ${sessionCount} prep sessions and ${bagRows.length} bags`)

  /* -- 8. Forecast plan for the upcoming prep day -------------------------- */
  const nextPrep = upcomingPrepDay(asOf)
  const managerId = profileByEmail.get('manager@peckers.dev')!.id
  let planItemCount = 0

  for (const site of SITE_SEEDS) {
    const siteId = siteBySlug.get(site.slug)!.id

    const { data: plan, error: planError } = await supabase
      .from('prep_plans')
      .insert({
        site_id: siteId,
        prep_date: nextPrep.date,
        prep_type: nextPrep.type,
        covers_days: nextPrep.coversDays,
        status: 'draft',
        created_by: managerId,
      })
      .select('id')
      .single()
    if (planError) throw new Error(`Prep plan: ${planError.message}`)

    const { data: inputs, error: inputError } = await supabase.rpc('forecast_inputs', {
      p_site_id: siteId,
      p_window_days: 28,
      p_as_of: asOf,
    })
    if (inputError) throw new Error(`forecast_inputs: ${inputError.message}`)

    const items = (inputs as ForecastInputRow[]).map((row) => {
      const result = forecastSauce(
        {
          sauceId: row.sauce_id,
          sauceName: row.sauce_name,
          usage: (row.usage ?? []).map((entry) => ({ date: entry.date, bags: entry.bags })),
          usableStock: Number(row.usable_bags),
          parLevel: row.par_level,
          introducedOn: row.introduced_on,
        },
        {
          prepDate: nextPrep.date,
          coversDays: nextPrep.coversDays,
          asOf,
          windowDays: 28,
          bufferMultiplier: 1.1,
        },
      )

      return {
        plan_id: plan!.id,
        sauce_id: row.sauce_id,
        suggested_bags: result.suggestedBags,
        reasoning: result.reasoning,
      }
    })

    await insertInChunks(supabase, 'prep_plan_items', items)
    planItemCount += items.length
  }
  console.log(
    `  · forecast plan for ${nextPrep.date} (${nextPrep.type}, ${nextPrep.coversDays}-day cover) — ${planItemCount} items`,
  )

  console.log('\nDone.\n')
  console.log('  Manager   manager@peckers.dev')
  console.log('  Staff     staff@peckers.dev      (Stevenage)')
  console.log('  Staff     hitchin@peckers.dev    (Hitchin)')
  console.log(`  Password  ${DEMO_PASSWORD}\n`)
}

interface ForecastInputRow {
  sauce_id: string
  sauce_name: string
  bag_size: string
  introduced_on: string
  par_level: number
  usable_bags: number
  usage: Array<{ date: string; bags: number }> | null
}

/** Calendar days between two DateOnly values, as a number. */
function dateDiff(from: DateOnly, to: DateOnly): number {
  return Math.round(
    (new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86_400_000,
  )
}

main().catch((error) => {
  console.error('\nSeed failed:', error instanceof Error ? error.message : error, '\n')
  process.exit(1)
})
