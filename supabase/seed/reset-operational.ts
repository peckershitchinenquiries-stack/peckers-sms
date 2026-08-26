/**
 * Clears the trading data so the system can start recording for real.
 *
 * Written for go-live: every batch, usage log, plan, delivery and waste entry
 * created during testing is deleted, while everything that took setup work to
 * get right stays exactly as it is —
 *
 *   KEPT      sites, sauces (and their shelf lives), staff accounts,
 *             par levels, app settings
 *   DELETED   bags, usage logs, waste logs, stock transfers, prep plans and
 *             their allocations, prep checklists and sessions, alerts
 *
 * Deliberately destructive and deliberately awkward to run: it needs the
 * service-role key and an explicit `--yes`, and it prints what it is about to
 * destroy first.
 *
 * Run with:  npm run db:reset:operational -- --yes
 */

import { config as loadEnv } from 'dotenv'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`\n  Missing ${name}. Add it to .env.local before running this.\n`)
    process.exit(1)
  }
  return value
}

/**
 * Deleted parents-last, so a row never disappears before the rows pointing at
 * it. Most of these cascade anyway; being explicit means the counts printed
 * below are real rather than implied.
 */
const TABLES = [
  'waste_logs',
  'stock_transfers',
  'usage_logs',
  'bags',
  'prep_checklist',
  'prep_sessions',
  'prep_plan_allocations',
  'prep_plan_items',
  'prep_plans',
  'alerts',
] as const

/** Everything this script must leave untouched, checked afterwards. */
const PRESERVED = ['sites', 'sauces', 'profiles', 'par_levels', 'app_settings'] as const

async function countRows(supabase: SupabaseClient, table: string): Promise<number> {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true })
  if (error) throw new Error(`Counting ${table}: ${error.message}`)
  return count ?? 0
}

async function main(): Promise<void> {
  const confirmed = process.argv.includes('--yes')

  const supabase = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  console.log(`\nOperational reset — ${url}\n`)

  const before = new Map<string, number>()
  for (const table of TABLES) {
    before.set(table, await countRows(supabase, table))
  }

  console.log('  Will be deleted:')
  for (const table of TABLES) {
    console.log(`    ${table.padEnd(24)} ${before.get(table)} rows`)
  }

  console.log('\n  Will be kept:')
  for (const table of PRESERVED) {
    console.log(`    ${table.padEnd(24)} ${await countRows(supabase, table)} rows`)
  }

  if (!confirmed) {
    console.log('\n  Nothing deleted. Re-run with --yes to go ahead.\n')
    return
  }

  console.log('')
  for (const table of TABLES) {
    // A filter is required by PostgREST; this one matches every row.
    const { error } = await supabase
      .from(table)
      .delete()
      .not('id', 'is', null)
    if (error) throw new Error(`Clearing ${table}: ${error.message}`)

    const remaining = await countRows(supabase, table)
    if (remaining > 0) {
      throw new Error(`${table} still has ${remaining} rows after the delete.`)
    }
    console.log(`  cleared  ${table.padEnd(24)} ${before.get(table)} rows`)
  }

  console.log('\n  Checking what was meant to survive:')
  for (const table of PRESERVED) {
    console.log(`    ${table.padEnd(24)} ${await countRows(supabase, table)} rows`)
  }

  console.log('\n  Done. The system is ready for live use.\n')
}

main().catch((error) => {
  console.error(`\n  Reset failed: ${error instanceof Error ? error.message : error}\n`)
  process.exit(1)
})
