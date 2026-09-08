import { Timestamp } from 'firebase/firestore'

import type { Program, WeekTheme } from '~/data/types'

const DAY_MS = 24 * 60 * 60 * 1000

/** Whole days elapsed since `from`, floored at 0. */
export const daysSince = (from: Timestamp, now: Date = new Date()): number => {
  const start = from.toDate()
  // Compare calendar days, not elapsed hours, so the counter ticks at midnight.
  const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())
  const nowDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.max(0, Math.round((nowDay - startDay) / DAY_MS))
}

/**
 * The programme's shape, as far as the calendar is concerned.
 *
 * Read off the program document rather than compiled in. It used to be a
 * constant here, which meant every cohort in every deploy was six weeks of
 * four sessions whatever their program said, and re-tuning a block was a
 * release rather than an edit.
 */
export interface ChallengeShape {
  totalDays: number
  totalWeeks: number
  sessionsPerWeek: number
  weekThemes: WeekTheme[]
}

/**
 * What the clock reads before a program has been loaded, or when the read
 * failed.
 *
 * Deliberately zeros rather than a plausible six weeks. Every consumer below
 * treats a zero total as "no ceiling to clamp to", so the day and week counters
 * still run and nothing renders a length the coach never authored — a fallback
 * that guessed "6 weeks" would be a fixture by another name, and it would be
 * wrong silently.
 */
export const EMPTY_CHALLENGE: ChallengeShape = {
  totalDays: 0,
  totalWeeks: 0,
  sessionsPerWeek: 0,
  weekThemes: [],
}

export const challengeShapeOf = (program: Program | null): ChallengeShape =>
  program
    ? {
        totalDays: program.totalDays,
        totalWeeks: program.totalWeeks,
        sessionsPerWeek: program.sessionsPerWeek,
        weekThemes: program.weekThemes ?? [],
      }
    : EMPTY_CHALLENGE

/** Clamp, unless there is no authored ceiling to clamp against. */
const capped = (value: number, ceiling: number): number =>
  ceiling > 0 ? Math.min(value, ceiling) : value

export interface ChallengeClock {
  /** 1-based day of the challenge, clamped to the programme length. */
  dayInChallenge: number
  totalDays: number
  /** 1-based week, clamped to the programme length. */
  week: number
  totalWeeks: number
  title: string
  subtitle: string
  /**
   * "Week 3 · Overload", or just "Week 3" when the program authored no theme
   * for it. Composed here so no screen has to decide what a missing title does
   * to the separator it was going to print beside it.
   */
  label: string
  /** True once the member has passed the final day. */
  complete: boolean
}

/**
 * Where the member is in the block, derived from when they joined and how long
 * their program runs. The single source of truth for "Week 3 · Overload".
 */
export const challengeClock = (
  joinedAt: Timestamp,
  now: Date = new Date(),
  shape: ChallengeShape = EMPTY_CHALLENGE,
): ChallengeClock => {
  const elapsed = daysSince(joinedAt, now)
  const dayInChallenge = capped(elapsed + 1, shape.totalDays)
  const week = capped(Math.floor(elapsed / 7) + 1, shape.totalWeeks)
  // No fallback to the first theme: a program with none authored has nothing to
  // fall back to, and inventing "Foundation" for it would be the fixture again.
  const theme = shape.weekThemes.find((t) => t.weekNumber === week) ?? null

  return {
    dayInChallenge,
    totalDays: shape.totalDays,
    week,
    totalWeeks: shape.totalWeeks,
    title: theme?.title ?? '',
    subtitle: theme?.subtitle ?? '',
    label: theme?.title ? `Week ${week} · ${theme.title}` : `Week ${week}`,
    complete: shape.totalDays > 0 && elapsed + 1 > shape.totalDays,
  }
}

/**
 * Which challenge week an instant falls into (1-based).
 *
 * `totalWeeks` is the program's, passed in by the caller that already holds it
 * — every writer of a `weekNumber` has read the program to resolve the reward
 * it is paying out, so nothing has to fetch it twice.
 */
export const weekOf = (joinedAt: Timestamp, at: Timestamp, totalWeeks = 0): number =>
  capped(Math.floor(daysSince(joinedAt, at.toDate()) / 7) + 1, totalWeeks)
