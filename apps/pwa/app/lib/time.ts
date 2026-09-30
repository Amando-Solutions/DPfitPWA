// =============================================================================
// Trusted "now".
//
// One session a day only means anything if the date cannot be moved, and the
// device clock can be: set the phone forward four times and a whole training
// week unlocks in an afternoon. So the current date is read off the network.
//
// What gets kept is the *offset* between network time and the device clock, not
// a timestamp, so `trustedNow()` stays a synchronous read that keeps ticking
// between syncs. Nothing here blocks the app: the offset is restored from the
// last session synchronously at boot and the network sync lands whenever it
// lands.
//
// The time zone is the other half, and the device's is no more trustworthy
// than its clock. So no day is ever read in it: `dateKeyIn` takes a zone by
// name — the cohort's for the Cohort Clock, the member's stored region for the
// day-lock. What this clock decides is only what the screens *show*; the
// writes that are locked to a day are decided again by the functions in
// `apps/functions/src/member-writes.ts`, on the server's clock.
// =============================================================================

import { Timestamp } from 'firebase/firestore'

import { storage } from '~/lib/storage'

const KEY = {
  /** Milliseconds to add to the device clock to get network time. */
  offset: 'clock-offset',
  /** Highest trusted timestamp ever seen, so time cannot be wound back. */
  highWater: 'clock-high-water',
}

/** A sync older than this is stale enough to be worth redoing. */
const RESYNC_AFTER_MS = 30 * 60 * 1000

/** Network time sources are given a short leash; the app never waits on them. */
const FETCH_TIMEOUT_MS = 4000

/**
 * Public fallback, used only when the app's own origin cannot be reached.
 *
 * A cross-origin `Date` header is not readable from JavaScript unless the
 * server opts in, so a third-party source has to be one that puts the time in
 * the body.
 */
const TIME_API = 'https://worldtimeapi.org/api/ip'

let offsetMs = 0
let lastSyncAt = 0
let networkBacked = false

/**
 * The cohort's zone when its document has none it can use. Every cohort so far
 * runs on Lagos time, and "WAT" is what the program copy promises.
 */
export const COHORT_ZONE_FALLBACK = 'Africa/Lagos'

/**
 * A zone's canonical IANA name, or `null` when this browser does not know it.
 * Free text such as "Lagos, WAT" is refused.
 */
export const canonicalZone = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: value.trim() }).resolvedOptions().timeZone
  } catch {
    return null
  }
}

/**
 * The calendar day an instant falls on in `timeZone`, as `YYYY-MM-DD`.
 *
 * There is deliberately no version of this without a zone. The device's own
 * zone is its owner's to change, and a day read in it could be moved: every day
 * the app decides anything by is the cohort's (the Cohort Clock) or the
 * member's stored region's (the day-lock). `en-CA` because it is the locale
 * that formats as year-month-day. An unknown zone reads as Lagos.
 */
export const dateKeyIn = (date: Date | Timestamp, timeZone: string): string => {
  const at = date instanceof Timestamp ? date.toDate() : date
  const format = (zone: string) =>
    new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit', timeZone: zone,
    }).format(at)
  try {
    return format(timeZone)
  } catch {
    return format(COHORT_ZONE_FALLBACK)
  }
}

/** Milliseconds `timeZone` is ahead of UTC at `at`. */
const zoneOffsetMs = (at: number, timeZone: string): number => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(new Date(at))
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0)
  const wall = Date.UTC(
    part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'),
  )
  return wall - Math.floor(at / 1000) * 1000
}

/**
 * The instant `key` begins in `timeZone`: midnight there, whatever the device
 * thinks. Two passes, because the offset at a UTC guess can differ from the
 * offset at the real midnight when a clock change falls in between.
 */
export const zonedMidnight = (key: string, timeZone: string): Date => {
  const [y, m, d] = key.split('-').map(Number)
  const guess = Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1)
  try {
    let at = guess - zoneOffsetMs(guess, timeZone)
    at = guess - zoneOffsetMs(at, timeZone)
    // A zone whose clocks skip midnight itself starts the day at 01:00.
    if (dateKeyIn(new Date(at), timeZone) < key) at += 60 * 60 * 1000
    return new Date(at)
  } catch {
    return zonedMidnight(key, COHORT_ZONE_FALLBACK)
  }
}

/**
 * The zones that are West Africa Time, which no browser locale names as such:
 * `en-GB` and `en-US` both print "GMT+1".
 */
const WAT_ZONES = new Set([
  'Africa/Lagos', 'Africa/Bangui', 'Africa/Brazzaville', 'Africa/Douala', 'Africa/Kinshasa',
  'Africa/Libreville', 'Africa/Luanda', 'Africa/Malabo', 'Africa/Ndjamena', 'Africa/Niamey',
  'Africa/Porto-Novo',
])

/**
 * What to print after a time in `timeZone`: "WAT", "EDT", "BST", "GMT+3".
 *
 * The letters where some locale has them — `en-US` knows EDT, `en-GB` knows BST
 * and CEST — and the offset otherwise. At `at`, because daylight saving changes
 * the answer.
 */
export const zoneLabel = (timeZone: string, at: Date = trustedNow()): string => {
  if (WAT_ZONES.has(timeZone)) return 'WAT'
  const name = (locale: string) => {
    try {
      return new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'short' })
        .formatToParts(at)
        .find((p) => p.type === 'timeZoneName')?.value ?? ''
    } catch {
      return ''
    }
  }
  const lettered = (label: string) => /^[A-Z]{2,5}$/.test(label)
  const us = name('en-US')
  if (lettered(us)) return us
  const gb = name('en-GB')
  return lettered(gb) ? gb : us || gb || timeZone
}

/**
 * How long ago `at` was, in words.
 *
 * Rendered on every read against the trusted clock rather than stored, because
 * a saved "2h ago" is wrong an hour later. Anything older than a week falls
 * back to a date: "9d ago" is harder to read than the day it happened.
 */
export const relativeLabel = (at: Timestamp, now: Date = trustedNow()): string => {
  const seconds = Math.round((now.getTime() - at.toMillis()) / 1000)
  if (seconds < 0) return 'Just now'
  if (seconds < 60) return 'Just now'

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return formatDate(at)
}

/**
 * "12 Aug 2026". The fallback for anything too old for a relative label.
 *
 * `timeZone` for an activity date, which is shown in the cohort's zone: the day
 * it names has to be the day the Cohort Clock filed it under. Omitted, it is
 * the device's, for things no week hangs on.
 */
export const formatDate = (at: Timestamp | Date, timeZone?: string): string =>
  (at instanceof Date ? at : at.toDate()).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(timeZone && { timeZone }),
  })

/**
 * "7:30 PM". Used on chat bubbles, where the day is already established, and
 * with a `timeZone` wherever the time is someone else's — a call in the
 * member's region, an activity in the cohort's.
 */
export const formatTime = (at: Timestamp | Date, timeZone?: string): string =>
  (at instanceof Date ? at : at.toDate()).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    ...(timeZone && { timeZone }),
  })

/**
 * "12 Aug 2026, 7:30 PM WAT": when an activity happened, on the Cohort Clock.
 *
 * Never converted to the member's own zone. A session logged at 11 PM Sunday
 * in New York was filed under Monday's week in Lagos, and a date that said
 * Sunday beside "Week 4" would contradict the week it sits in.
 */
export const formatActivityTime = (at: Timestamp | Date, cohortZone: string): string => {
  const instant = at instanceof Date ? at : at.toDate()
  return `${formatDate(instant, cohortZone)}, ${formatTime(instant, cohortZone)} ${zoneLabel(cohortZone, instant)}`
}

/**
 * When something `nights` away lands, in the words a member would use:
 * "today", "tomorrow", "Thursday", "next Monday".
 *
 * A weekday name rather than a date, because these are all inside the coming
 * week and "Thursday" is the form somebody can act on without counting. Seven
 * nights out names the same weekday as today, so it takes the "next" prefix to
 * keep it from reading as this morning.
 *
 * Counted from `from`, the member's day as a key, rather than from an instant:
 * the weekday is the one on the member's calendar, not the device's.
 */
export const nightsLabel = (nights: number, from: string): string => {
  if (nights <= 0) return 'today'
  if (nights === 1) return 'tomorrow'
  const [y, m, d] = from.split('-').map(Number)
  const weekday = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, (d ?? 1) + nights)).toLocaleDateString(
    undefined,
    { weekday: 'long', timeZone: 'UTC' },
  )
  return nights >= 7 ? `next ${weekday}` : weekday
}

/**
 * "Mon 5 Oct", for a schedule date in a week other than this one.
 *
 * Where `nightsLabel` stops being the right form: three weeks out, "Monday"
 * is a date somebody has to count to, and a list of a future week's days would
 * mix "Monday" with "next Tuesday" for days that sit side by side.
 *
 * Built from the key's own parts, in local time, because `new Date('2026-10-05')`
 * is UTC midnight and west of Greenwich that is the Sunday.
 */
export const scheduleDateLabel = (key: string): string => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

/**
 * The current time, corrected by the last known network offset.
 *
 * A reading taken from the network this session needs no guarding. Between
 * syncs the stored offset is only as good as the device clock it corrects, so
 * the high-water mark stands in: it stops the clock being wound back onto a day
 * that has already been spent. It cannot drag time forward past reality either,
 * because the only values it ever holds came off the network.
 *
 * That last part is the reason nothing device-derived is ever written to it. A
 * phone set years ahead while offline would otherwise pin the mark to a date
 * that no later sync could undo.
 */
export const trustedNow = (): Date => {
  const corrected = Date.now() + offsetMs
  if (networkBacked) return new Date(corrected)
  return new Date(Math.max(corrected, storage.read<number>(KEY.highWater, 0)))
}

/**
 * The same instant as a Firestore `Timestamp`.
 *
 * Every stored instant in the app is a `Timestamp`, so this is what client-side
 * writes use. Server-authored fields should prefer `serverTimestamp()`, which
 * needs no trusted clock at all because it is resolved by Firestore; this is
 * for the values a screen has to have in hand before the write lands.
 */
export const trustedTimestamp = (): Timestamp => Timestamp.fromDate(trustedNow())

/** Remember a network reading, so a later clock change cannot undo it. */
const recordReading = (at: number) => {
  if (at > storage.read<number>(KEY.highWater, 0)) storage.write(KEY.highWater, at)
}

/** Restore the offset from the last session. Synchronous, safe on the boot path. */
export const restoreClock = (): void => {
  offsetMs = storage.read<number>(KEY.offset, 0)
}

/**
 * Ask one source for the time, compensating for the round trip.
 *
 * The reply describes an instant somewhere between the request and the
 * response, so the midpoint is the best single guess available without a real
 * time protocol.
 */
const sample = async (read: (signal: AbortSignal) => Promise<number>): Promise<number> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  const sentAt = Date.now()
  try {
    const serverMs = await read(controller.signal)
    const roundTrip = Date.now() - sentAt
    return serverMs + roundTrip / 2
  } finally {
    clearTimeout(timer)
  }
}

/** The app's own origin, whose `Date` header is same-origin and so readable. */
const fromOwnOrigin = (signal: AbortSignal) =>
  fetch(window.location.origin, { method: 'HEAD', cache: 'no-store', signal }).then(
    (response) => {
      const header = response.headers.get('date')
      const parsed = header ? Date.parse(header) : NaN
      if (Number.isNaN(parsed)) throw new Error('No usable Date header.')
      return parsed
    },
  )

const fromTimeApi = (signal: AbortSignal) =>
  fetch(TIME_API, { cache: 'no-store', signal })
    .then((response) => response.json())
    .then((body: { utc_datetime?: string }) => {
      const parsed = body.utc_datetime ? Date.parse(body.utc_datetime) : NaN
      if (Number.isNaN(parsed)) throw new Error('No usable time in the response.')
      return parsed
    })

/**
 * Refresh the offset from the network.
 *
 * Resolves to whether a source answered. A failure is not an error the member
 * needs to see: the app carries on with the last known offset, which is what
 * makes it work on a plane.
 */
export const syncClock = async (force = false): Promise<boolean> => {
  if (import.meta.server) return false
  if (!force && networkBacked && Date.now() - lastSyncAt < RESYNC_AFTER_MS) return true

  for (const source of [fromOwnOrigin, fromTimeApi]) {
    try {
      const serverMs = await sample(source)
      offsetMs = serverMs - Date.now()
      storage.write(KEY.offset, offsetMs)
      lastSyncAt = Date.now()
      networkBacked = true
      recordReading(serverMs)
      return true
    } catch {
      // Try the next source; an unreachable clock is not a failure state.
    }
  }

  return false
}
