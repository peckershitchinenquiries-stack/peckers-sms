import type { BagSizeValue } from '@/lib/types/database'

export interface SauceSeed {
  name: string
  slug: string
  bagSize: BagSizeValue
  /** Rough par level used to seed both sites; managers tune it per site. */
  defaultPar: number
}

/** The two Peckers kitchens. */
export const SITE_SEEDS = [
  { name: 'Stevenage', slug: 'stevenage' },
  { name: 'Hitchin', slug: 'hitchin' },
] as const

/**
 * The 15 house sauces. Bag size is a fixed property of the recipe:
 * 5 sauces go into 2L bags, the other 10 into 1L bags.
 */
export const SAUCE_SEEDS: SauceSeed[] = [
  // 2L bags
  { name: 'Buffalo', slug: 'buffalo', bagSize: '2L', defaultPar: 12 },
  { name: 'Butter Me Up', slug: 'butter-me-up', bagSize: '2L', defaultPar: 8 },
  { name: 'Garlic Aioli', slug: 'garlic-aioli', bagSize: '2L', defaultPar: 14 },
  { name: 'House Mayo', slug: 'house-mayo', bagSize: '2L', defaultPar: 16 },
  { name: 'Supercharged OG', slug: 'supercharged-og', bagSize: '2L', defaultPar: 10 },

  // 1L bags
  { name: 'Hot Honey', slug: 'hot-honey', bagSize: '1L', defaultPar: 10 },
  { name: 'Cheese Sauce', slug: 'cheese-sauce', bagSize: '1L', defaultPar: 12 },
  { name: 'Mango Pineapple', slug: 'mango-pineapple', bagSize: '1L', defaultPar: 6 },
  { name: 'Katsu Curry', slug: 'katsu-curry', bagSize: '1L', defaultPar: 8 },
  { name: 'Peanut Sweet Chilli', slug: 'peanut-sweet-chilli', bagSize: '1L', defaultPar: 6 },
  { name: 'Honey Glaze BBQ', slug: 'honey-glaze-bbq', bagSize: '1L', defaultPar: 10 },
  { name: 'Korean Gochujang', slug: 'korean-gochujang', bagSize: '1L', defaultPar: 8 },
  { name: 'Korean Glaze', slug: 'korean-glaze', bagSize: '1L', defaultPar: 8 },
  { name: 'OG Chilli', slug: 'og-chilli', bagSize: '1L', defaultPar: 10 },
  { name: 'Ranch', slug: 'ranch', bagSize: '1L', defaultPar: 14 },
]

export const BAG_SIZE_LABEL: Record<BagSizeValue, string> = {
  '1L': '1 litre',
  '2L': '2 litre',
}

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
