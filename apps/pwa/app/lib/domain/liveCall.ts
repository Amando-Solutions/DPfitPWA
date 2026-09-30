import type { Timestamp } from 'firebase/firestore'

import type { LiveCall } from '~/data/types'
import { dateKeyIn } from '~/lib/time'

const MINUTE_MS = 60 * 1000

/** How long a call runs when the admin has not said. */
export const DEFAULT_CALL_MINUTES = 60

/** Longer than this is a typo, not a call, and reads as the default. */
const MAX_CALL_MINUTES = 24 * 60

const isTimestamp = (value: unknown): value is Timestamp =>
  typeof (value as Timestamp | null)?.toMillis === 'function'

/**
 * A `liveCalls` document, read as a call or as no call.
 *
 * Takes `unknown` because a document typed straight into the console can be
 * missing anything, and it has to come out as `null` rather than as a card
 * with a dead button.
 *
 * `startsAt` and an `http(s)` `joinUrl` are required. `durationMinutes` is not,
 * because a call with no stated length is still a call.
 */
export const liveCallFrom = (value: unknown): LiveCall | null => {
  if (!value || typeof value !== 'object') return null
  const { startsAt, durationMinutes, joinUrl } = value as Record<string, unknown>

  const url = typeof joinUrl === 'string' ? joinUrl.trim() : ''
  if (!isTimestamp(startsAt) || !/^https?:\/\//i.test(url)) return null

  const minutes =
    typeof durationMinutes === 'number' &&
    durationMinutes > 0 &&
    durationMinutes <= MAX_CALL_MINUTES
      ? durationMinutes
      : DEFAULT_CALL_MINUTES

  return { startsAt, durationMinutes: minutes, joinUrl: url }
}

/**
 * Where today's call is.
 *
 * `upcoming` has a disabled button until `startsAt`, `live` can be joined, and
 * `ended` stays on Home for the rest of the day so the card does not vanish
 * out from under somebody who just left the call.
 */
export type LiveCallPhase = 'upcoming' | 'live' | 'ended'

export interface LiveCallToday {
  phase: LiveCallPhase
  startsAt: Date
  endsAt: Date
  joinUrl: string
  /** When `phase` next changes. `null` once it has ended: only midnight moves it on. */
  changesAt: Date | null
}

/**
 * The call to show on Home right now, or `null` when today has none.
 *
 * `calls` are the cohort's dated calls from the `liveCalls` collection, each a
 * one-off: nothing repeats. A call is shown on the day it happens *for the
 * member*, in `zone` — their stored region, not the device's zone. `startsAt`
 * is an instant and the slot never moves: a 7 PM Lagos call is 7 PM for a
 * member in Lagos and 2 PM for one in New York, and each sees it on their own
 * calendar day. One that runs past midnight stays until it ends, because a
 * member still in it should not lose the card at 00:00.
 *
 * With more than one call today, a live call wins, then the next one to start,
 * then the last one to have ended.
 */
export const todaysLiveCall = (
  calls: LiveCall[],
  now: Date,
  zone: string,
): LiveCallToday | null => {
  const at = now.getTime()
  const today = dateKeyIn(now, zone)
  let ended: LiveCallToday | null = null

  const sorted = [...calls].sort((a, b) => a.startsAt.toMillis() - b.startsAt.toMillis())
  for (const call of sorted) {
    const start = call.startsAt.toMillis()
    const end = start + call.durationMinutes * MINUTE_MS
    const base = { startsAt: new Date(start), endsAt: new Date(end), joinUrl: call.joinUrl }

    if (start <= at && at < end) return { ...base, phase: 'live', changesAt: base.endsAt }
    if (dateKeyIn(base.startsAt, zone) !== today) continue
    if (at < start) return { ...base, phase: 'upcoming', changesAt: base.startsAt }
    ended = { ...base, phase: 'ended', changesAt: null }
  }

  return ended
}
