import { challenge, weekThemes } from '~/data/program'

const DAY_MS = 24 * 60 * 60 * 1000

/** Whole days elapsed since `iso`, floored at 0. */
export const daysSince = (iso: string, now: Date = new Date()): number => {
  const start = new Date(iso)
  // Compare calendar days, not elapsed hours, so the counter ticks at midnight.
  const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())
  const nowDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.max(0, Math.round((nowDay - startDay) / DAY_MS))
}

export interface ChallengeClock {
  /** 1-based day of the challenge, clamped to the programme length. */
  dayInChallenge: number
  totalDays: number
  /** 1-based week, clamped to the programme length. */
  week: number
  totalWeeks: number
  title: string
  subtitle: string
  /** True once the member has passed the final day. */
  complete: boolean
}

/**
 * Where the member is in the 6-week block, derived from when they joined.
 * This is the single source of truth for "Week 3 · Overload" everywhere.
 */
export const challengeClock = (joinedAt: string, now: Date = new Date()): ChallengeClock => {
  const elapsed = daysSince(joinedAt, now)
  const dayInChallenge = Math.min(elapsed + 1, challenge.totalDays)
  const week = Math.min(Math.floor(elapsed / 7) + 1, challenge.totalWeeks)
  const theme = weekThemes.find((t) => t.weekNumber === week) ?? weekThemes[0]

  return {
    dayInChallenge,
    totalDays: challenge.totalDays,
    week,
    totalWeeks: challenge.totalWeeks,
    title: theme.title,
    subtitle: theme.subtitle,
    complete: elapsed + 1 > challenge.totalDays,
  }
}

/** Which challenge week a timestamp falls into (1-based). */
export const weekOf = (joinedAt: string, iso: string): number =>
  Math.min(Math.floor(daysSince(joinedAt, new Date(iso)) / 7) + 1, challenge.totalWeeks)
