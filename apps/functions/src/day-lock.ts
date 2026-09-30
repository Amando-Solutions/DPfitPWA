// =============================================================================
// The day-lock: which day it is for a member, and what that day lets them log.
//
// Two clocks, on purpose:
//
//   The member's day   Their stored region's calendar, read off the server's
//                      time. Decides what is *open*: a training day opens at
//                      midnight where the member is, not where the coach is.
//
//   The Cohort Clock   The cohort's zone (WAT), the same for everybody. Decides
//                      which week an entry is *filed* under. See `cohortWeekAt`.
//
// Neither ever reads the device. A phone's clock and zone are its owner's to
// change, and a lock that trusted them could be wound back to log a day twice.
//
// Pure: no Firestore, no `Date.now()`. Every function takes `now`, so the tests
// can stand anywhere on the calendar. `member-writes.ts` does the reading.
// =============================================================================
import {
  cohortWeekAt,
  dateKeyIn,
  dayLabel,
  isDateKey,
  weekAt,
  type DateKey,
  type DatedWeek,
} from './calendar.js'

/** `members/{uid}.region`, the parts that decide anything. */
export interface StoredRegion {
  id: string
  timezone: string
  /**
   * The day the member was in when they last switched, under the zone they
   * left. Their day never reads earlier than this. `null` on none.
   */
  floor: DateKey | null
}

/** The zone a member's days turn over in: their region's, or the cohort's until they pick one. */
export const memberZone = (region: StoredRegion | null, cohortZone: string): string =>
  region?.timezone ?? cohortZone

/**
 * The member's calendar day at `now`.
 *
 * Their region's date, held at the floor their last switch left. The floor is
 * what makes a switch one-way: a member in Lagos at 1 AM Tuesday who picks New
 * York, where it is 8 PM Monday, stays on Tuesday until New York catches up.
 */
export const memberDay = (now: Date, region: StoredRegion | null, cohortZone: string): DateKey => {
  const day = dateKeyIn(now, memberZone(region, cohortZone))
  const floor = region?.floor ?? ''
  return floor > day ? floor : day
}

/**
 * The region to store when a member switches to `next` at `now`.
 *
 * Forward only, never retroactive. Nothing already logged is re-read: every
 * session carries the day it was logged on, fixed at the time. And the day the
 * member is in as they switch — read under the zone they are leaving, floor and
 * all — becomes the new floor. So moving west cannot reopen a day, and flipping
 * back and forth only ever moves the day forward. Moving east takes effect at
 * once, because the new zone's day is already past the floor.
 */
export const switchRegion = (
  now: Date,
  current: StoredRegion | null,
  next: { id: string; timezone: string },
  cohortZone: string,
): StoredRegion => ({
  id: next.id,
  timezone: next.timezone,
  floor: memberDay(now, current, cohortZone),
})

// --- Sessions ----------------------------------------------------------------

export interface PlanDay {
  id: string
  date: DateKey
  dayNumber: number
  label: string
  optional: boolean
}

export interface PlanWeek extends DatedWeek {
  days: PlanDay[]
}

/** What the lock needs from a session already logged. */
export interface LoggedRef {
  dayId: string
  weekNumber: number
  planWeek?: number
  /** The member's day it was logged on. Absent on sessions from before it existed. */
  dayKey?: DateKey
  completedAtMs: number
}

export interface SessionGateInput {
  now: Date
  region: StoredRegion | null
  cohortZone: string
  /** `cohorts/{id}.startDate` on the cohort's calendar, or `null` with none. */
  opensOn: DateKey | null
  weeks: PlanWeek[]
  /** Every session already logged against `dayId`, whichever week. */
  logged: LoggedRef[]
  dayId: string
  planWeek: number
}

export type GateRefusal =
  | 'before-start'
  | 'not-in-plan'
  | 'not-open-yet'
  | 'already-logged'

export type SessionGate =
  | {
      ok: true
      day: PlanDay
      /** The member's day, stamped on the session as `dayKey`. */
      dayKey: DateKey
      /** The Cohort Clock's week, stamped as `weekNumber`. */
      weekNumber: number
      planWeek: number
    }
  | { ok: false; reason: GateRefusal; message: string }

const refuse = (reason: GateRefusal, message: string): SessionGate => ({
  ok: false,
  reason,
  message,
})

/** The day a session was logged on, for one written before it carried `dayKey`. */
const dayOf = (session: LoggedRef, zone: string): DateKey =>
  session.dayKey ?? dateKeyIn(new Date(session.completedAtMs), zone)

/**
 * Whether a session for `dayId` in `planWeek` may be logged at `now`.
 *
 * A quota day opens on its date, on the member's calendar, and stays open until
 * it is logged; once logged it is locked for good, whatever region is picked
 * afterwards. The finisher (an `optional` day) holds no slot and is the one day
 * with a once-a-day rule, counted on the member's day as well.
 */
export const sessionGate = (input: SessionGateInput): SessionGate => {
  const { now, region, cohortZone, opensOn, weeks, logged, dayId, planWeek } = input
  const today = memberDay(now, region, cohortZone)

  if (opensOn && today < opensOn) {
    return refuse('before-start', `Training opens on ${dayLabel(opensOn)}.`)
  }

  const week = weeks.find((w) => w.weekNumber === planWeek)
  const day = week?.days.find((d) => d.id === dayId)
  if (!week || !day) {
    return refuse('not-in-plan', 'That session is not in your plan.')
  }

  if (day.optional) {
    // This week's finisher only: the one the member's calendar is in.
    if (weekAt(weeks, today)?.weekNumber !== planWeek) {
      return refuse('not-open-yet', 'That finisher belongs to another week.')
    }
    const zone = memberZone(region, cohortZone)
    if (logged.some((s) => s.dayId === dayId && dayOf(s, zone) === today)) {
      return refuse('already-logged', 'You have done this one today. It opens again tomorrow.')
    }
  } else {
    if (!isDateKey(day.date) || day.date > today) {
      return refuse(
        'not-open-yet',
        isDateKey(day.date)
          ? `That session opens on ${dayLabel(day.date)}.`
          : 'That session has no date yet.',
      )
    }
    if (logged.some((s) => s.dayId === dayId && (s.planWeek ?? s.weekNumber) === planWeek)) {
      return refuse('already-logged', 'That session is already logged.')
    }
  }

  return {
    ok: true,
    day,
    dayKey: today,
    weekNumber: cohortWeekAt(weeks, now, cohortZone),
    planWeek,
  }
}

/**
 * A stable id for the session, so two finishes of the same day cannot both
 * land: the second `create` finds the first. A quota day is logged once per
 * week it belongs to; the finisher once per member day.
 */
export const sessionId = (gate: Extract<SessionGate, { ok: true }>): string =>
  gate.day.optional ? `${gate.dayKey}-${gate.day.id}` : `w${gate.planWeek}-${gate.day.id}`
