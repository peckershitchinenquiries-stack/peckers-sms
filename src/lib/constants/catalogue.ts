export interface SauceSeed {
  name: string
  slug: string
  /** Rough par level (ml) used to seed both sites; managers tune it per site. */
  defaultParMl: number
}

/** The two Peckers kitchens. */
export const SITE_SEEDS = [
  { name: 'Stevenage', slug: 'stevenage' },
  { name: 'Hitchin', slug: 'hitchin' },
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

/** The three prep steps, in order. Staff tick them off left to right. */
export const PREP_STEPS = [
  {
    key: 'cooked',
    label: 'Cooked',
    column: 'cooked_at',
    icon: 'flame',
    description: 'Batch cooked to spec',
  },
  {
    key: 'blast_chilled',
    label: 'Blast chilled',
    column: 'blast_chilled_at',
    icon: 'snowflake',
    description: '1.5 hour hold in the blast chiller',
  },
  {
    key: 'vacuum_packed',
    label: 'Vacuum packed',
    column: 'vacuum_packed_at',
    icon: 'package',
    description: 'Sealed into bags — starts the 5-day clock',
  },
] as const

export type PrepStepKey = (typeof PREP_STEPS)[number]['key']
export type PrepStepColumn = (typeof PREP_STEPS)[number]['column']
