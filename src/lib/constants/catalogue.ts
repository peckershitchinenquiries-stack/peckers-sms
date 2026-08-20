export interface SauceSeed {
  name: string
  slug: string
  /** Rough par level (ml) used to seed every store; managers tune it per site. */
  defaultParMl: number
}

/**
 * The two Peckers restaurants.
 *
 * Sauce is prepared at Stevenage only and delivered to Hitchin, so Hitchin
 * never sees a prep checklist — only daily usage.
 */
export const SITE_SEEDS = [
  { name: 'Stevenage', slug: 'stevenage', isPrepSite: true },
  { name: 'Hitchin', slug: 'hitchin', isPrepSite: false },
] as const

/**
 * The four bag sizes every batch is packed across. Configurable later in
 * Settings (app_settings.bag_sizes_ml) — this is only the seed default.
 */
export const BAG_SIZES_ML = [300, 500, 1000, 2000]

/** The 15 house sauces. Bag size is no longer fixed per recipe — every batch is packed into whichever mix of BAG_SIZES_ML wastes the least. */
export const SAUCE_SEEDS: SauceSeed[] = [
  { name: 'Buffalo', slug: 'buffalo', defaultParMl: 24_000 },
  { name: 'Butter Me Up', slug: 'butter-me-up', defaultParMl: 16_000 },
  { name: 'Garlic Aioli', slug: 'garlic-aioli', defaultParMl: 28_000 },
  { name: 'House Mayo', slug: 'house-mayo', defaultParMl: 32_000 },
  { name: 'Supercharged OG', slug: 'supercharged-og', defaultParMl: 20_000 },
  { name: 'Hot Honey', slug: 'hot-honey', defaultParMl: 10_000 },
  { name: 'Cheese Sauce', slug: 'cheese-sauce', defaultParMl: 12_000 },
  { name: 'Mango Pineapple', slug: 'mango-pineapple', defaultParMl: 6_000 },
  { name: 'Katsu Curry', slug: 'katsu-curry', defaultParMl: 8_000 },
  { name: 'Peanut Sweet Chilli', slug: 'peanut-sweet-chilli', defaultParMl: 6_000 },
  { name: 'Honey Glaze BBQ', slug: 'honey-glaze-bbq', defaultParMl: 10_000 },
  { name: 'Korean Gochujang', slug: 'korean-gochujang', defaultParMl: 8_000 },
  { name: 'Korean Glaze', slug: 'korean-glaze', defaultParMl: 8_000 },
  { name: 'OG Chilli', slug: 'og-chilli', defaultParMl: 10_000 },
  { name: 'Ranch', slug: 'ranch', defaultParMl: 14_000 },
]

/**
 * Prep is deliberately a single step.
 *
 * The old cook -> blast chill -> vacuum pack ticklist didn't survive contact
 * with the kitchen: cold sauces never go near a blast chiller, and asking for
 * three timestamps per sauce made staff log ceremony rather than facts. A line
 * now records only what we actually use downstream — the volume made and when.
 */
export const DEFAULT_PREP_WEEKDAYS = [2, 5] as const
