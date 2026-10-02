// =============================================================================
// Calendar days, in a named zone and never in the process's own.
//
// A Cloud Function runs in UTC, and in Lagos the day turns an hour before it
// does in UTC. So nothing here calls `getDate()`, `getHours()` or anything else
// that reads the process zone: every day is read off an instant *in* a zone
// that is passed in by name. That is the whole reason this file exists.
//
// Mirrors `lib/time.ts` and `lib/domain/challenge.ts` in the member app, which
// display what these decide. Restated rather than imported, because functions
// cannot import workspace packages at deploy. If you change one, change both.
// =============================================================================

/** A calendar date, `YYYY-MM-DD`, with no time and no zone. */
export type DateKey = string

/**
 * The cohort's zone when its document has none it can use. Every cohort so far
 * runs on Lagos time, and "WAT" is what the program copy promises.
 */
export const COHORT_ZONE_FALLBACK = 'Africa/Lagos'

const DAY_MS = 24 * 60 * 60 * 1000
const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/

/** Whether a value is a real `YYYY-MM-DD` date, not merely shaped like one. */
export const isDateKey = (value: unknown): value is DateKey => {
  if (typeof value !== 'string') return false
  const m = value.match(DATE_KEY)
  if (!m) return false
  const at = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return at.toISOString().slice(0, 10) === value
}

/**
 * A zone's canonical IANA name, or `null` when the runtime does not know it.
 *
 * `Intl` is the check because it is what every later read goes through: a zone
 * it accepts here is one `dateKeyIn` will not throw on. Free text such as
 * "Lagos, WAT" is refused.
 */
export const canonicalZone = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: value.trim() }).resolvedOptions().timeZone
  } catch {
    return null
  }
}

/** The zone a cohort document names, or Lagos. */
export const cohortZoneOf = (value: unknown): string => canonicalZone(value) ?? COHORT_ZONE_FALLBACK

/**
 * The calendar day `at` falls on in `timeZone`.
 *
 * `en-CA` because it is the locale that formats as year-month-day. Throws on a
 * zone `Intl` does not know, so pass one that has been through `canonicalZone`.
 */
export const dateKeyIn = (at: Date, timeZone: string): DateKey =>
  new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).format(at)

const utcOf = (key: DateKey) => {
  const [y, m, d] = key.split('-').map(Number)
  return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1)
}

/** Whole calendar days from `from` to `to`, negative when `to` is earlier. */
export const daysBetween = (from: DateKey, to: DateKey): number =>
  Math.round((utcOf(to) - utcOf(from)) / DAY_MS)

/** The date `days` after `key`. On the key, so a clock change cannot skew it. */
export const addDays = (key: DateKey, days: number): DateKey =>
  new Date(utcOf(key) + days * DAY_MS).toISOString().slice(0, 10)

/** "Monday 12 Oct", for a refusal that has to say when something opens. */
export const dayLabel = (key: DateKey): string =>
  new Date(utcOf(key)).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })

export interface DatedWeek {
  weekNumber: number
  startDate: DateKey
  endDate: DateKey
}

/**
 * The week a date falls in: the latest one that has started, or the first
 * before any has. The same rule as `weekAt` in the member app.
 */
export const weekAt = <W extends DatedWeek>(weeks: W[], day: DateKey): W | null => {
  let current: W | null = null
  for (const week of weeks) {
    if (week.startDate <= day) current = week
  }
  return current ?? weeks[0] ?? null
}

/**
 * The cohort week an instant is filed under: its date *in the cohort's zone*.
 *
 * This is the Cohort Clock. It is WAT for everybody, wherever they are, so a
 * session logged at 11 PM in New York on a Sunday is filed under the week it is
 * in Lagos, which is already Monday. `1` when no weeks are authored.
 */
export const cohortWeekAt = (weeks: DatedWeek[], at: Date, cohortZone: string): number =>
  weekAt(weeks, dateKeyIn(at, cohortZone))?.weekNumber ?? 1

/**
 * Whether a cohort is over: `completed` or `archived`, or past the last day its
 * `endDate` names.
 *
 * `completed` is what `completeCohorts` writes once the last day has passed, so
 * the date says the same thing a moment earlier; it is read here so a cohort
 * marked by hand is over too.
 *
 * `endDate` is read as a day on the cohort's calendar, the way `startDate` is:
 * the cohort runs to the end of that day and closes at the midnight after it,
 * in its own zone. An instant would close it at whatever time of day the
 * console happened to store, and a date picker stores the *start* of the day,
 * which would cost members their last one. No usable `endDate` is no end on
 * the calendar; archiving still closes it.
 *
 * Takes the cohort document's fields as stored, so `endDate` is a Firestore
 * `Timestamp` (anything with `toDate`) or a `Date`.
 *
 * Mirrors `cohortOver` in the member app's `lib/domain/challenge.ts`, which
 * shuts the screens by the same rule.
 */
export const cohortOver = (
  cohort: { status?: unknown; endDate?: unknown; timezone?: unknown },
  now: Date,
): boolean => {
  if (cohort.status === 'archived' || cohort.status === 'completed') return true
  const end = instantOf(cohort.endDate)
  if (!end) return false
  const zone = cohortZoneOf(cohort.timezone)
  return dateKeyIn(now, zone) > dateKeyIn(end, zone)
}

/** A `Date`, or a Firestore `Timestamp` read as one; anything else is `null`. */
const instantOf = (value: unknown): Date | null => {
  if (value instanceof Date) return value
  const toDate = (value as { toDate?: unknown } | null | undefined)?.toDate
  return typeof toDate === 'function' ? (toDate.call(value) as Date) : null
}
