/**
 * A cohort's calendar: days and times named in the cohort's own time zone,
 * never the admin's browser.
 *
 * `startDate` and `endDate` on a cohort each name a day, stored as midnight at
 * the start of it in the cohort's `timezone`. The cohort runs to the end of the
 * `endDate` day and closes at the midnight after it. Live calls are instants,
 * entered as a wall-clock time in the same zone. Everything here takes the zone
 * by name, because `new Date("2026-11-08T19:00")` means 7 PM wherever the
 * admin's laptop happens to be.
 *
 * `cohortOver` mirrors `cohortOver` in `apps/functions/src/calendar.ts`, which
 * the member functions, the push triggers and live-call reminders all use. Keep
 * the two in step, as `ADMIN_NOTIFICATIONS.md` → "Closing a cohort" describes.
 */

export const DEFAULT_TIMEZONE = "Africa/Lagos"

/** A day on a cohort's calendar, as `YYYY-MM-DD`. */
export type DayKey = string

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^\d{2}:\d{2}$/

/** The cohort's zone, or Lagos for a missing or unusable one, as the functions read it. */
export function cohortZone(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return DEFAULT_TIMEZONE
  try {
    new Intl.DateTimeFormat("en", { timeZone: value })
    return value
  } catch {
    return DEFAULT_TIMEZONE
  }
}

const partFormatters = new Map<string, Intl.DateTimeFormat>()

/** The wall clock in `zone` at `date`. */
function wallClock(date: Date, zone: string) {
  let formatter = partFormatters.get(zone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
    partFormatters.set(zone, formatter)
  }
  const parts = formatter.formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value)
  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
    second: part("second"),
  }
}

const pad = (value: number) => String(value).padStart(2, "0")

/** The day `date` falls on in `zone`. */
export function dayIn(date: Date, zone: string): DayKey {
  const clock = wallClock(date, zone)
  return `${clock.year}-${pad(clock.month)}-${pad(clock.day)}`
}

/** The time of day at `date` in `zone`, as `HH:MM`. */
export function timeIn(date: Date, zone: string): string {
  const clock = wallClock(date, zone)
  return `${pad(clock.hour)}:${pad(clock.minute)}`
}

/** `day` moved by a whole number of calendar days. */
export function addDays(day: DayKey, days: number): DayKey {
  const [year, month, date] = day.split("-").map(Number)
  return new Date(Date.UTC(year!, month! - 1, date! + days)).toISOString().slice(0, 10)
}

/** How far `zone`'s wall clock runs ahead of UTC at `instant`, in milliseconds. */
function offsetAt(instant: number, zone: string) {
  const clock = wallClock(new Date(instant), zone)
  const asUtc = Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second)
  return asUtc - Math.floor(instant / 1000) * 1000
}

/**
 * The instant the wall clock in `zone` reads `time` on `day`. An invalid day or
 * time gives an invalid `Date`, which callers check with `Number.isNaN`.
 */
export function zonedInstant(day: DayKey, time: string, zone: string): Date {
  if (!DAY_KEY.test(day) || !TIME.test(time)) return new Date(Number.NaN)
  const [year, month, date] = day.split("-").map(Number)
  const [hour, minute] = time.split(":").map(Number)
  const wall = Date.UTC(year!, month! - 1, date!, hour!, minute!)
  // The second pass settles a clock change that falls between the guess and the answer.
  const guess = wall - offsetAt(wall, zone)
  return new Date(wall - offsetAt(guess, zone))
}

/** Midnight at the start of `day` in `zone`: how a cohort stores `startDate` and `endDate`. */
export const startOfDay = (day: DayKey, zone: string) => zonedInstant(day, "00:00", zone)

/** The last day of a cohort that starts on `startDay` and runs `durationWeeks` full weeks. */
export const lastDayOf = (startDay: DayKey, durationWeeks: number): DayKey =>
  addDays(startDay, durationWeeks * 7 - 1)

/** Whether a string is a `YYYY-MM-DD` day. */
export const isDayKey = (value: string) => DAY_KEY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))

/** For example "Lagos time (GMT+1)": which clock a date or time field is read on. */
export function zoneLabel(zone: string, at = new Date()): string {
  const city = zone.split("/").pop()?.replace(/_/g, " ") || zone
  const short = new Intl.DateTimeFormat("en", { timeZone: zone, timeZoneName: "short" })
    .formatToParts(at)
    .find((part) => part.type === "timeZoneName")?.value
  return short ? `${city} time (${short})` : `${city} time`
}

/** `date` as a day in `zone`, such as "Nov 8, 2026", or "—" for none. */
export function formatDayIn(date: Date | null, zone: string, options: Intl.DateTimeFormatOptions = {}): string {
  if (!date || Number.isNaN(date.getTime()) || date.getTime() <= 0) return "—"
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", ...options, timeZone: zone }).format(date)
}

/** A `YYYY-MM-DD` day as words, such as "Sun, Nov 8, 2026". */
export function formatDayKey(day: DayKey, options: Intl.DateTimeFormatOptions = {}): string {
  if (!isDayKey(day)) return "—"
  return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", year: "numeric", ...options, timeZone: "UTC" })
    .format(new Date(`${day}T12:00:00Z`))
}

/** The fields `cohortOver` reads, as `CohortRecord` carries them. */
export type CohortClock = {
  status: string
  endDate: Date | null
  timezone: string
}

/**
 * Whether a cohort is over: archived, or past the last day its `endDate` names,
 * on its own calendar. Once it is, its members get the ended screen and every
 * member write is refused. No usable `endDate` is no end on the calendar;
 * archiving still closes it.
 */
export function cohortOver(cohort: CohortClock, now: Date): boolean {
  if (cohort.status === "archived") return true
  if (!cohort.endDate || Number.isNaN(cohort.endDate.getTime())) return false
  const zone = cohortZone(cohort.timezone)
  return dayIn(now, zone) > dayIn(cohort.endDate, zone)
}

/** The cohort's last day, on its own calendar, or `null` when it has no `endDate`. */
export function lastDayOfCohort(cohort: CohortClock): DayKey | null {
  if (!cohort.endDate || Number.isNaN(cohort.endDate.getTime())) return null
  return dayIn(cohort.endDate, cohortZone(cohort.timezone))
}
