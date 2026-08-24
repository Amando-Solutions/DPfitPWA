import { badges, challenge, planDays, ranks, rewardValues } from '~/data/program'
import type {
  BadgeRuleId,
  CheckInRecord,
  PhotoRecord,
  Rank,
  SessionLog,
} from '~/data/types'
import { weekOf } from './challenge'

export interface RewardsSnapshot {
  points: number
  rank: Rank
  nextRank: Rank | null
  pointsToNextRank: number
  /** 0 to 100 progress toward the next rank, for the progress bar. */
  rankProgress: number
  /** Consecutive weeks, ending at the current one, with at least one session. */
  streakWeeks: number
  earned: BadgeRuleId[]
  badgeCount: number
  badgeTotal: number
}

export interface RewardsInput {
  joinedAt: string
  currentWeek: number
  sessions: SessionLog[]
  checkIns: CheckInRecord[]
  photos: PhotoRecord[]
  earnedBadges: Record<string, string>
}

export const totalPoints = (input: Pick<RewardsInput, 'sessions' | 'checkIns' | 'photos'>): number =>
  input.sessions.reduce((n, s) => n + (s.rewardPoints ?? rewardValues.workout), 0) +
  input.checkIns.reduce((n, c) => n + (c.rewardPoints ?? rewardValues.checkIn), 0) +
  input.photos.length * rewardValues.progressPhoto

export const rankFor = (points: number): Rank =>
  [...ranks].reverse().find((r) => points >= r.minPoints) ?? ranks[0]

export const nextRankFor = (points: number): Rank | null =>
  ranks.find((r) => r.minPoints > points) ?? null

/**
 * Weeks in a row, counting back from the current week, that contain at least
 * one logged session. The current week only breaks the streak once it is over,
 * so an untouched Monday doesn't wipe out five good weeks.
 */
export const streakWeeks = (
  sessions: SessionLog[],
  joinedAt: string,
  currentWeek: number,
): number => {
  const weeks = new Set(sessions.map((s) => s.weekNumber ?? weekOf(joinedAt, s.completedAt)))
  let streak = 0
  let week = weeks.has(currentWeek) ? currentWeek : currentWeek - 1
  while (week >= 1 && weeks.has(week)) {
    streak++
    week--
  }
  return streak
}

/** Badge rules, evaluated against the member's whole history. */
export const evaluateBadges = (input: RewardsInput): BadgeRuleId[] => {
  const { sessions, checkIns, photos, currentWeek } = input
  const won: BadgeRuleId[] = []

  if (sessions.length >= 1) won.push('first-workout')
  if (photos.length >= 1) won.push('first-photo')

  const daysLogged = new Set(sessions.map((s) => s.dayId))
  if (planDays.every((d) => daysLogged.has(d.id))) won.push('all-days-once')

  const checkInWeeks = [...new Set(checkIns.map((c) => c.weekNumber))].sort((a, b) => a - b)
  let run = 0
  let best = 0
  let previous: number | null = null
  for (const week of checkInWeeks) {
    run = previous !== null && week === previous + 1 ? run + 1 : 1
    best = Math.max(best, run)
    previous = week
  }
  if (best >= 4) won.push('checkin-streak-4')

  if (currentWeek >= 3 && sessions.length >= 8) won.push('week3-8-sessions')
  if (currentWeek >= challenge.totalWeeks && sessions.length >= 20) won.push('week6-20-sessions')

  const loggedWeeks = new Set(sessions.map((s) => s.weekNumber))
  const everyWeekCovered = Array.from({ length: currentWeek }, (_, i) => i + 1).every((w) =>
    loggedWeeks.has(w),
  )
  if (currentWeek >= 2 && everyWeekCovered) won.push('no-week-missed')

  return won
}

export const rewardsSnapshot = (input: RewardsInput): RewardsSnapshot => {
  const points = totalPoints(input)
  const rank = rankFor(points)
  const nextRank = nextRankFor(points)
  const span = nextRank ? nextRank.minPoints - rank.minPoints : 0
  const earned = evaluateBadges(input)

  return {
    points,
    rank,
    nextRank,
    pointsToNextRank: nextRank ? nextRank.minPoints - points : 0,
    rankProgress: span > 0 ? Math.min(100, Math.round(((points - rank.minPoints) / span) * 100)) : 100,
    streakWeeks: streakWeeks(input.sessions, input.joinedAt, input.currentWeek),
    earned,
    badgeCount: earned.length,
    badgeTotal: badges.length,
  }
}
