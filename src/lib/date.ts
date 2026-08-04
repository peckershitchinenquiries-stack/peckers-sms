import {
  addDays,
  differenceInCalendarDays,
  differenceInMinutes,
  eachDayOfInterval,
  format,
  getDay,
  isValid,
  parseISO,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
} from 'date-fns'
import { formatInTimeZone, toZonedTime } from 'date-fns-tz'

/* -------------------------------------------------------------------------- */
/* Timezone                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Single configurable timezone for the whole app. Every "today", "expiring
 * today" and "next prep day" decision resolves through this — never through
 * the server's or browser's local zone.
 */
export const APP_TIMEZONE: string =
  process.env.NEXT_PUBLIC_APP_TIMEZONE?.trim() || 'Europe/London'

/**
 * A calendar date with no time component, always `yyyy-MM-dd`.
 * Postgres `date` columns map to this directly.
 */
export type DateOnly = string

/** The current calendar date in the app timezone. */
export function today(now: Date = new Date()): DateOnly {
  return formatInTimeZone(now, APP_TIMEZONE, 'yyyy-MM-dd')
}

/** Wall-clock `HH:mm` in the app timezone. */
export function currentTime(now: Date = new Date()): string {
  return formatInTimeZone(now, APP_TIMEZONE, 'HH:mm')
}

/** An instant rebased into the app timezone — for calendar-grid rendering. */
export function zoned(instant: Date | string): Date {
  return toZonedTime(typeof instant === 'string' ? parseISO(instant) : instant, APP_TIMEZONE)
}

/* -------------------------------------------------------------------------- */
/* DateOnly arithmetic                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Parses a `yyyy-MM-dd` string into a Date at local midnight.
 *
 * Calendar math (add days, compare dates, day-of-week) stays entirely in this
 * "floating" representation. It never touches the timezone, so it can't drift
 * across DST boundaries. Only `today()` and instant formatting are zone-aware.
 */
export function parseDateOnly(value: DateOnly): Date {
  const parsed = parseISO(`${value}T00:00:00`)
  if (!isValid(parsed)) {
    throw new Error(`Invalid DateOnly value: "${value}"`)
  }
  return parsed
}

export function toDateOnly(date: Date): DateOnly {
  return format(date, 'yyyy-MM-dd')
}

export function addDaysTo(date: DateOnly, days: number): DateOnly {
  return toDateOnly(addDays(parseDateOnly(date), days))
}

/** Whole calendar days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: DateOnly, to: DateOnly): number {
  return differenceInCalendarDays(parseDateOnly(to), parseDateOnly(from))
}

/** Inclusive list of calendar dates. */
export function dateRange(from: DateOnly, to: DateOnly): DateOnly[] {
  return eachDayOfInterval({ start: parseDateOnly(from), end: parseDateOnly(to) }).map(toDateOnly)
}

/** 0 = Sunday … 6 = Saturday, matching Postgres `extract(dow)`. */
export function weekdayOf(date: DateOnly): number {
  return getDay(parseDateOnly(date))
}

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/* -------------------------------------------------------------------------- */
/* Prep-day rules                                                             */
/* -------------------------------------------------------------------------- */

export type PrepType = 'tuesday' | 'friday'

export const TUESDAY = 2
export const FRIDAY = 5

/**
 * Business rule:
 *  - Tuesday's batch must cover Tue, Wed, Thu  → 3 days
 *  - Friday's batch must cover Fri, Sat, Sun, Mon → 4 days
 */
export const COVERAGE_DAYS: Record<PrepType, 3 | 4> = {
  tuesday: 3,
  friday: 4,
}

export interface PrepDay {
  date: DateOnly
  type: PrepType
  /** How many days of demand this batch has to satisfy (3 or 4). */
  coversDays: 3 | 4
  /** The exact calendar dates this batch covers, starting on the prep day. */
  coverageDates: DateOnly[]
}

function prepDayFrom(date: DateOnly): PrepDay {
  const dow = weekdayOf(date)
  const type: PrepType = dow === TUESDAY ? 'tuesday' : 'friday'
  const coversDays = COVERAGE_DAYS[type]
  return {
    date,
    type,
    coversDays,
    coverageDates: Array.from({ length: coversDays }, (_, i) => addDaysTo(date, i)),
  }
}

/** True when the given date is a Tuesday or Friday. */
export function isPrepDay(date: DateOnly): boolean {
  const dow = weekdayOf(date)
  return dow === TUESDAY || dow === FRIDAY
}

/**
 * The prep day we are currently planning for.
 *
 * Inclusive: if `from` is itself a Tuesday or Friday, that day is returned —
 * on a prep morning the plan you care about is today's.
 */
export function upcomingPrepDay(from: DateOnly = today()): PrepDay {
  for (let offset = 0; offset < 8; offset += 1) {
    const candidate = addDaysTo(from, offset)
    if (isPrepDay(candidate)) return prepDayFrom(candidate)
  }
  /* istanbul ignore next — a prep day always falls within 7 days. */
  throw new Error(`No prep day found within a week of ${from}`)
}

/** The next prep day strictly after `from` — i.e. the next restock event. */
export function nextPrepDayAfter(from: DateOnly = today()): PrepDay {
  return upcomingPrepDay(addDaysTo(from, 1))
}

/**
 * Days of trading `from` must survive before stock is replenished.
 *
 * Counted to the *next* prep day after today, because today's prep (if any)
 * has either already happened or is happening now.
 */
export function daysUntilNextPrep(from: DateOnly = today()): number {
  return daysBetween(from, nextPrepDayAfter(from).date)
}

/** The most recent prep day on or before `from`. */
export function lastPrepDayOnOrBefore(from: DateOnly = today()): PrepDay {
  for (let offset = 0; offset < 8; offset += 1) {
    const candidate = addDaysTo(from, -offset)
    if (isPrepDay(candidate)) return prepDayFrom(candidate)
  }
  /* istanbul ignore next */
  throw new Error(`No prep day found within a week before ${from}`)
}

/* -------------------------------------------------------------------------- */
/* Shelf life                                                                 */
/* -------------------------------------------------------------------------- */

/** A sealed vacuum bag lasts 5 days from the prep date. */
export const SEALED_SHELF_LIFE_DAYS = 5

/** Once opened, a bag lasts 2 days from the moment it was opened. */
export const OPENED_SHELF_LIFE_DAYS = 2

/** Blast chill hold time before vacuum packing. */
export const BLAST_CHILL_MINUTES = 90

export function sealedExpiryFor(prepDate: DateOnly): DateOnly {
  return addDaysTo(prepDate, SEALED_SHELF_LIFE_DAYS)
}

/**
 * Opened expiry = min(sealed expiry, opened date + 2 days).
 *
 * Opening a bag can only ever shorten its life, never extend it past the
 * original 5-day sealed cap.
 */
export function openedExpiryFor(openedOn: DateOnly, sealedExpiry: DateOnly): DateOnly {
  const twoDaysOut = addDaysTo(openedOn, OPENED_SHELF_LIFE_DAYS)
  return daysBetween(twoDaysOut, sealedExpiry) < 0 ? sealedExpiry : twoDaysOut
}

export type ExpiryLevel = 'expired' | 'critical' | 'warning' | 'healthy'

export interface ExpiryStatus {
  level: ExpiryLevel
  /** Whole days from today until expiry. 0 = expires today, negative = past. */
  daysRemaining: number
  label: string
}

/**
 * Semantic status used by every colour-coded surface in the app:
 *   Red    — expired, or expiring today
 *   Amber  — 1–2 days of life left
 *   Green  — 2+ days (i.e. 3 or more) of life left
 */
export function expiryStatus(expiry: DateOnly, from: DateOnly = today()): ExpiryStatus {
  const daysRemaining = daysBetween(from, expiry)

  if (daysRemaining < 0) {
    const overdue = Math.abs(daysRemaining)
    return {
      level: 'expired',
      daysRemaining,
      label: `Expired ${overdue} day${overdue === 1 ? '' : 's'} ago`,
    }
  }
  if (daysRemaining === 0) {
    return { level: 'critical', daysRemaining, label: 'Expires today' }
  }
  if (daysRemaining <= 2) {
    return {
      level: 'warning',
      daysRemaining,
      label: `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left`,
    }
  }
  return { level: 'healthy', daysRemaining, label: `${daysRemaining} days left` }
}

/** Maps an expiry level onto the shared Badge tones. */
export const expiryTone: Record<ExpiryLevel, 'danger' | 'warning' | 'success'> = {
  expired: 'danger',
  critical: 'danger',
  warning: 'warning',
  healthy: 'success',
}

export const expiryIcon: Record<ExpiryLevel, 'alert-triangle' | 'alert-circle' | 'check-circle'> = {
  expired: 'alert-triangle',
  critical: 'alert-triangle',
  warning: 'alert-circle',
  healthy: 'check-circle',
}

/* -------------------------------------------------------------------------- */
/* Overtime                                                                   */
/* -------------------------------------------------------------------------- */

/** Hours between two instants, rounded to 2dp. Returns 0 for invalid spans. */
export function hoursBetween(startedAt: string | Date, endedAt: string | Date): number {
  const start = typeof startedAt === 'string' ? parseISO(startedAt) : startedAt
  const end = typeof endedAt === 'string' ? parseISO(endedAt) : endedAt
  const minutes = differenceInMinutes(end, start)
  if (!Number.isFinite(minutes) || minutes <= 0) return 0
  return Math.round((minutes / 60) * 100) / 100
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

export function formatDateOnly(date: DateOnly, pattern = 'd MMM yyyy'): string {
  return format(parseDateOnly(date), pattern)
}

/** "Tue 4 Aug" — the compact form used across tables and checklists. */
export function formatShort(date: DateOnly): string {
  return format(parseDateOnly(date), 'EEE d MMM')
}

export function formatInstant(instant: string | Date, pattern = 'd MMM yyyy, HH:mm'): string {
  const value = typeof instant === 'string' ? parseISO(instant) : instant
  return formatInTimeZone(value, APP_TIMEZONE, pattern)
}

export function formatTimeOfDay(instant: string | Date): string {
  return formatInstant(instant, 'HH:mm')
}

/** "Today" / "Tomorrow" / "Yesterday", else a short date. */
export function formatRelativeDay(date: DateOnly, from: DateOnly = today()): string {
  const delta = daysBetween(from, date)
  if (delta === 0) return 'Today'
  if (delta === 1) return 'Tomorrow'
  if (delta === -1) return 'Yesterday'
  return formatShort(date)
}

/* -------------------------------------------------------------------------- */
/* Calendar grid (for the custom DatePicker)                                  */
/* -------------------------------------------------------------------------- */

export interface CalendarCell {
  date: DateOnly
  inMonth: boolean
  isToday: boolean
  weekday: number
}

/** A Monday-first 6×7 grid of cells for the month containing `anchor`. */
export function monthGrid(anchor: DateOnly, todayDate: DateOnly = today()): CalendarCell[] {
  const anchorDate = parseDateOnly(anchor)
  const gridStart = startOfWeek(startOfMonth(anchorDate), { weekStartsOn: 1 })
  const gridEnd = endOfWeek(endOfMonth(anchorDate), { weekStartsOn: 1 })
  const anchorMonth = anchorDate.getMonth()

  return eachDayOfInterval({ start: gridStart, end: gridEnd }).map((date) => {
    const value = toDateOnly(date)
    return {
      date: value,
      inMonth: date.getMonth() === anchorMonth,
      isToday: value === todayDate,
      weekday: getDay(date),
    }
  })
}

export function monthLabel(anchor: DateOnly): string {
  return format(parseDateOnly(anchor), 'MMMM yyyy')
}

export function shiftMonth(anchor: DateOnly, delta: number): DateOnly {
  const date = parseDateOnly(anchor)
  const shifted = new Date(date.getFullYear(), date.getMonth() + delta, 1)
  return toDateOnly(shifted)
}

/** First and last calendar date of the month containing `anchor`. */
export function monthBounds(anchor: DateOnly): { start: DateOnly; end: DateOnly } {
  const date = parseDateOnly(anchor)
  return { start: toDateOnly(startOfMonth(date)), end: toDateOnly(endOfMonth(date)) }
}
