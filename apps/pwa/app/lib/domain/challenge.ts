import type { Timestamp } from 'firebase/firestore'

import type { DateKey, ProgramWeek, TrainingWeek, WorkoutDay } from '~/data/types'
import { dateKey } from '~/lib/time'

const DAY_MS = 24 * 60 * 60 * 1000

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/

/** Whether a value is a real `YYYY-MM-DD` date, not merely shaped like one. */
export const isDateKey = (value: unknown): value is DateKey => {
  if (typeof value !== 'string') return false
  const m = value.match(DATE_KEY)
  if (!m) return false
  const at = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  // `Date.UTC` rolls "2026-02-31" over into March rather than refusing it, so
  // the round trip is the check.
  return at.toISOString().slice(0, 10) === value
}

/**
 * Whole calendar days from `from` to `to`, negative when `to` is earlier.
 *
 * On the keys rather than on `Date`s, so it counts dates and not elapsed hours:
 * a clock change between the two cannot turn one day into 0.96 of one.
 */
export const daysBetween = (from: DateKey, to: DateKey): number => {
  const utc = (key: DateKey) => {
    const [y, m, d] = key.split('-').map(Number)
    return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1)
  }
  return Math.round((utc(to) - utc(from)) / DAY_MS)
}

/**
 * The week a date falls in.
 *
 * The latest week that has started, so a gap the coach left between two weeks
 * still belongs to the one before it and the last week holds on after the
 * block ends. Before the first week starts it is the first week: the challenge
 * a member has joined is the one they are waiting on.
 */
export const weekAt = <W extends ProgramWeek>(weeks: W[], day: DateKey): W | null => {
  let current: W | null = null
  for (const week of weeks) {
    if (week.startDate <= day) current = week
  }
  return current ?? weeks[0] ?? null
}

/**
 * Which challenge week an instant falls into, 1-based.
 *
 * The one place a `weekNumber` is decided, for the clock and for every writer
 * that stamps one on a session, check-in or photo — so "this week" on screen
 * and the week a log is filed under cannot disagree. `1` when no weeks are
 * authored, which is also where a program that has not been scheduled yet
 * would put everybody.
 */
export const weekOf = (weeks: ProgramWeek[], at: Timestamp | Date): number =>
  weekAt(weeks, dateKey(at))?.weekNumber ?? 1

/**
 * The week whose day a session was for. `weekNumber` on a session written
 * before `planWeek` existed, when a day could only be logged in its own week.
 */
export const planWeekOf = (session: { planWeek?: number; weekNumber: number }): number =>
  session.planWeek ?? session.weekNumber

/**
 * The `planWeek` to file a session under: the one asked for, if it is a week
 * the calendar has reached, else the week it was logged in.
 *
 * Resolved in the data source rather than trusted from the caller. Nothing
 * pays out on it, but a session stamped for a week that has not started would
 * mark a future day done and quietly take it off the plan.
 */
export const resolvePlanWeek = (asked: number | undefined, loggedIn: number): number =>
  Number.isInteger(asked) && asked! >= 1 && asked! <= loggedIn ? asked! : loggedIn

/** The training days that count toward a week's quota, in date order. */
export const planDaysOf = (week: TrainingWeek | null): WorkoutDay[] =>
  week ? week.days.filter((day) => !day.optional && isDateKey(day.date)) : []

/** A training day pinned to its week, since day ids repeat from week to week. */
export interface PlanDayRef {
  weekNumber: number
  dayId: string
}

/**
 * The block's last training day: the final quota day of the final week.
 *
 * The last week is the last one in the schedule, as `challengeClock` reads it.
 * `null` while that week has no dated days, because a block whose ending has
 * not been written yet has no last session to wait on.
 */
export const finalDayOf = (weeks: TrainingWeek[]): PlanDayRef | null => {
  const last = weeks[weeks.length - 1]
  const day = planDaysOf(last ?? null).at(-1)
  return last && day ? { weekNumber: last.weekNumber, dayId: day.id } : null
}

export interface ChallengeClock {
  /** Today, as the key every date in the schedule is compared against. */
  today: DateKey
  /** 1-based day of the challenge, clamped to the schedule. */
  dayInChallenge: number
  totalDays: number
  /** 1-based week, off the schedule. */
  week: number
  totalWeeks: number
  /** 1-based position of today inside the current week, clamped to its span. */
  dayInWeek: number
  title: string
  subtitle: string
  /**
   * "Week 3 · Overload", or just "Week 3" when the week has no title. Composed
   * here so no screen has to decide what a missing title does to the separator
   * it was going to print beside it.
   */
  label: string
  /** True once today is past the final week's last day. */
  complete: boolean
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

/**
 * Where the challenge is today, read off the dated weeks.
 *
 * The cohort's calendar, not the member's: everybody on the program is in the
 * same week on the same date, so a member who joins in week 3 starts in week 3.
 * The single source of truth for "Week 3 · Overload".
 *
 * An empty schedule reads as week 1 of nothing — zero totals, no title — rather
 * than a plausible six weeks, because a length the coach never authored would
 * be wrong silently.
 */
export const challengeClock = (weeks: ProgramWeek[], now: Date = new Date()): ChallengeClock => {
  const today = dateKey(now)
  const current = weekAt(weeks, today)
  const first = weeks[0]
  const last = weeks[weeks.length - 1]

  if (!current || !first || !last) {
    return {
      today,
      dayInChallenge: 1,
      totalDays: 0,
      week: 1,
      totalWeeks: 0,
      dayInWeek: 1,
      title: '',
      subtitle: '',
      label: 'Week 1',
      complete: false,
    }
  }

  const totalDays = daysBetween(first.startDate, last.endDate) + 1
  const weekSpan = daysBetween(current.startDate, current.endDate) + 1

  return {
    today,
    dayInChallenge: clamp(daysBetween(first.startDate, today) + 1, 1, Math.max(totalDays, 1)),
    totalDays,
    week: current.weekNumber,
    totalWeeks: weeks.length,
    dayInWeek: clamp(daysBetween(current.startDate, today) + 1, 1, Math.max(weekSpan, 1)),
    title: current.title ?? '',
    subtitle: current.subtitle ?? '',
    label: current.title
      ? `Week ${current.weekNumber} · ${current.title}`
      : `Week ${current.weekNumber}`,
    complete: today > last.endDate,
  }
}
