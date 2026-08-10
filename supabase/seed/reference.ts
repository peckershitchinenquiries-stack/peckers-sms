/**
 * Reference-data seed — safe to run against production.
 *
 * Populates only the catalogue every environment needs to function:
 *   • 2 sites (Stevenage, Hitchin)
 *   • the 15 house sauces
 *   • starting par levels (ml) per sauce per site
 *
 * Creates no user accounts and no fake history. Idempotent — upserts on
 * slug, so running it again just syncs the catalogue.
 *
 * Run with:  npm run db:seed
 */

import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { today } from '../../src/lib/date'
import { SAUCE_SEEDS, SITE_SEEDS } from '../../src/lib/constants/catalogue'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`\n  Missing ${name}. Add it to .env.local before seeding.\n`)
    process.exit(1)
  }
  return value
}

/** Sites run at different demand levels — used only to scale the starting par. */
const SITE_DEMAND_FACTOR: Record<string, number> = { stevenage: 1, hitchin: 0.78 }

async function main(): Promise<void> {
  const supabase = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const asOf = today()
  console.log(`\nSeeding reference data — as of ${asOf}\n`)

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

  const { data: sauces, error: sauceError } = await supabase
    .from('sauces')
    .upsert(
      SAUCE_SEEDS.map((sauce, index) => ({
        name: sauce.name,
        slug: sauce.slug,
        sort_order: index,
        active: true,
        // Genuinely new today — there is no usage history to backdate.
        introduced_on: asOf,
      })),
      { onConflict: 'slug' },
    )
    .select('id, name, slug')
  if (sauceError) throw new Error(`Sauces: ${sauceError.message}`)
  console.log(`  · ${sauces!.length} sauces`)

  const sauceBySlug = new Map(sauces!.map((sauce) => [sauce.slug as string, sauce]))

  const parRows = SAUCE_SEEDS.flatMap((sauce) =>
    SITE_SEEDS.map((site) => ({
      sauce_id: sauceBySlug.get(sauce.slug)!.id,
      site_id: siteBySlug.get(site.slug)!.id,
      target_ml: Math.max(
        200,
        Math.round(sauce.defaultParMl * (SITE_DEMAND_FACTOR[site.slug] ?? 1)),
      ),
    })),
  )
  const { error: parError } = await supabase
    .from('par_levels')
    .upsert(parRows, { onConflict: 'sauce_id,site_id' })
  if (parError) throw new Error(`Par levels: ${parError.message}`)
  console.log(`  · ${parRows.length} par levels`)

  console.log('\nDone. No user accounts were created — see `npm run db:create-manager`.\n')
}

main().catch((error) => {
  console.error('\nSeed failed:', error instanceof Error ? error.message : error, '\n')
  process.exit(1)
})
