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
// =============================================================================

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

/** Local calendar day as `YYYY-MM-DD`. The rule is per calendar day, not per 24h. */
export const dateKey = (date: Date): string => {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** Midnight at the start of the day after `date`, in local time. */
export const startOfNextDay = (date: Date): Date => {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  next.setDate(next.getDate() + 1)
  return next
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
