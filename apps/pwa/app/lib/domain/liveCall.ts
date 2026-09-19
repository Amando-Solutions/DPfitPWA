import type { Timestamp } from 'firebase/firestore'

import type { LiveCall } from '~/data/types'
import { dateKey } from '~/lib/time'

const MINUTE_MS = 60 * 1000
const WEEK_MS = 7 * 24 * 60 * MINUTE_MS

/** How long a call runs when the admin has not said. */
export const DEFAULT_CALL_MINUTES = 60

/** Longer than this is a typo, not a call, and reads as the default. */
const MAX_CALL_MINUTES = 24 * 60

const isTimestamp = (value: unknown): value is Timestamp =>
  typeof (value as Timestamp | null)?.toMillis === 'function'

/**
 * A stored `liveCall` map, read as a call or as no call.
 *
 * Takes `unknown` because the admin app is not the only way a value gets
 * there: a timestamp typed straight into the console as `liveCall` itself, or
 * a map from before `startsAt` existed, are both documents this has already
 * met, and both have to come out as `null` rather than as a card.
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
 * A call is shown on the day it happens *for the member*. `startsAt` is an
 * instant, so a 7 PM Lagos call is 7 PM for a member in Lagos and 6 PM for one
 * in London, and each sees it on their own calendar day. One that runs past
 * midnight stays until it ends, because a member still in it should not lose
 * the card at 00:00.
 *
 * Occurrences are `startsAt` plus whole weeks of milliseconds, not "the same
 * wall-clock time next week". The two differ by an hour across a
 * daylight-saving change. Africa/Lagos has none; a cohort run from a zone that
 * does would see its call shift an hour for part of the year.
 */
export const todaysLiveCall = (call: LiveCall | null, now: Date): LiveCallToday | null => {
  if (!call) return null

  const first = call.startsAt.toMillis()
  const length = call.durationMinutes * MINUTE_MS
  const at = now.getTime()
  const today = dateKey(now)

  // The latest occurrence that has started, then the one after it. Before
  // `startsAt` there is only the first.
  const latest = Math.max(0, Math.floor((at - first) / WEEK_MS))

  for (const start of [first + latest * WEEK_MS, first + (latest + 1) * WEEK_MS]) {
    const end = start + length
    const base = { startsAt: new Date(start), endsAt: new Date(end), joinUrl: call.joinUrl }

    if (start <= at && at < end) return { ...base, phase: 'live', changesAt: base.endsAt }
    if (dateKey(base.startsAt) !== today) continue
    return at < start
      ? { ...base, phase: 'upcoming', changesAt: base.startsAt }
      : { ...base, phase: 'ended', changesAt: null }
  }

  return null
}
