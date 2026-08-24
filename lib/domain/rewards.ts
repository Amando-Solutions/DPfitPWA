import {
  badgeTargets,
  badgeTierPoints,
  badges,
  challenge,
  planDays,
  ranks,
  rewardValues,
} from '~/data/program'
import type {
  BadgeRuleId,
  CheckInRecord,
  LeaderboardEntry,
  PhotoRecord,
  Rank,
  SessionLog,
} from '~/data/types'
import { weekOf } from './challenge'

// =============================================================================
// The reward system.
//
// Points, rank, streak, badges and the leaderboard are all pure functions of
// the member's logs, recomputed on every read. Nothing here is stored as its
// own value: a saved rank or streak is the one thing guaranteed to drift out of
// sync with the data it claims to describe.
// =============================================================================

/**
 * The share of a session's prescribed sets that has to be logged for that
 * session to count for anything.
 *
 * This is the gate the whole system hangs off. Badges and points are meant to
 * represent real effort rather than tapping through the app, so a session below
 * the line still saves and is still visible to the coach, but earns no RP, no
 * badge progress, no streak and no leaderboard position.
 */
export const QUALIFYING_SET_RATIO = 0.8

/** The same threshold as a percentage, for anything member-facing. */
export const QUALIFYING_SET_PERCENT = Math.round(QUALIFYING_SET_RATIO * 100)

/**
 * Whether a set count clears the threshold.
 *
 * Measured against the sets the *plan* asked for, not the total logged: sets a
 * member adds themselves are extra credit, and extra work must never be able to
 * push a finished session below the line.
 */
export const sessionQualifies = (setsDone: number, setsPrescribed: number): boolean =>
  setsPrescribed > 0 && setsDone / setsPrescribed >= QUALIFYING_SET_RATIO

/**
 * Whether a saved session counts. Sessions logged before the gate existed carry
 * no flag, so they are re-judged on their set counts rather than dropped.
 */
export const isQualifying = (session: SessionLog): boolean =>
  session.qualifies ?? sessionQualifies(session.setsDone, session.setsTotal)

export const qualifyingSessions = (sessions: SessionLog[]): SessionLog[] =>
  sessions.filter(isQualifying)

export interface RewardsSnapshot {
  points: number
  rank: Rank
  nextRank: Rank | null
  pointsToNextRank: number
  /** 0 to 100 progress toward the next rank, for the progress bar. */
  rankProgress: number
  /** Consecutive weeks, ending at the current one, with a qualifying session. */
  streakWeeks: number
  /** Sessions that counted. The number the leaderboard and badges run on. */
  sessionsQualified: number
  /** Sessions that were logged but missed the threshold. */
  sessionsBelowThreshold: number
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

/** RP already banked from unlocked badges. Append-only, so it only ever grows. */
export const badgePoints = (earnedBadges: Record<string, string>): number =>
  badges.reduce((n, b) => (earnedBadges[b.id] ? n + badgeTierPoints[b.tier] : n), 0)

/**
 * The member's RP.
 *
 * Recomputed from the logs rather than incremented, so a point total can never
 * disagree with the sessions behind it. Only qualifying sessions pay out;
 * check-ins and photos have no threshold to meet.
 */
export const totalPoints = (
  input: Pick<RewardsInput, 'sessions' | 'checkIns' | 'photos' | 'earnedBadges'>,
): number =>
  qualifyingSessions(input.sessions).length * rewardValues.workout +
  input.checkIns.length * rewardValues.checkIn +
  input.photos.length * rewardValues.progressPhoto +
  badgePoints(input.earnedBadges)

export const rankFor = (points: number): Rank =>
  [...ranks].reverse().find((r) => points >= r.minPoints) ?? ranks[0]

export const nextRankFor = (points: number): Rank | null =>
  ranks.find((r) => r.minPoints > points) ?? null

/** The longest run of consecutive weeks in a list of week numbers. */
const longestWeekRun = (values: number[]): number => {
  const weeks = [...new Set(values)].sort((a, b) => a - b)
  let run = 0
  let best = 0
  let previous: number | null = null
  for (const week of weeks) {
    run = previous !== null && week === previous + 1 ? run + 1 : 1
    best = Math.max(best, run)
    previous = week
  }
  return best
}

/** Which challenge weeks a set of qualifying sessions covers. */
const weekNumbers = (sessions: SessionLog[], joinedAt: string): Set<number> =>
  new Set(
    qualifyingSessions(sessions).map(
      (s) => s.weekNumber ?? weekOf(joinedAt, s.completedAt),
    ),
  )

/**
 * Weeks in a row, counting back from the current week, containing at least one
 * qualifying session. The current week only breaks the streak once it is over,
 * so an untouched Monday doesn't wipe out five good weeks.
 */
export const streakWeeks = (
  sessions: SessionLog[],
  joinedAt: string,
  currentWeek: number,
): number => {
  const weeks = weekNumbers(sessions, joinedAt)
  let streak = 0
  let week = weeks.has(currentWeek) ? currentWeek : currentWeek - 1
  while (week >= 1 && weeks.has(week)) {
    streak++
    week--
  }
  return streak
}

/**
 * Badge rules, evaluated against the member's whole history.
 *
 * Every count here is of qualifying sessions only. Re-run after each RP-earning
 * event so an unlock lands while the member is still looking at the screen that
 * earned it.
 */
export const evaluateBadges = (input: RewardsInput): BadgeRuleId[] => {
  const { checkIns, photos, currentWeek, joinedAt } = input
  const sessions = qualifyingSessions(input.sessions)
  const won: BadgeRuleId[] = []

  if (sessions.length >= 1) won.push('first-workout')
  if (photos.length >= 1) won.push('first-photo')

  // Every training day several times over, not one pass through the programme.
  const perDay = new Map<string, number>()
  for (const session of sessions) {
    perDay.set(session.dayId, (perDay.get(session.dayId) ?? 0) + 1)
  }
  if (planDays.every((d) => (perDay.get(d.id) ?? 0) >= badgeTargets.dayRepeats)) {
    won.push('consistency-queen')
  }

  // The same consecutive-week logic as the workout streak, on check-ins.
  const checkInRun = longestWeekRun(checkIns.map((c) => c.weekNumber))
  if (checkInRun >= badgeTargets.checkInWeeks) won.push('checkin-streak-4')

  // Reaching the week by the calendar is not enough on its own: the volume has
  // to be there too, or the badge is a reward for waiting.
  if (
    currentWeek >= badgeTargets.foundationWeek &&
    sessions.length >= badgeTargets.foundationSessions
  ) {
    won.push('foundation-complete')
  }
  if (currentWeek >= badgeTargets.peakWeek && sessions.length >= badgeTargets.peakSessions) {
    won.push('peak-performer')
  }

  // Every single week of the programme, with none skipped along the way.
  const weeks = weekNumbers(input.sessions, joinedAt)
  const everyWeek = Array.from({ length: challenge.totalWeeks }, (_, i) => i + 1)
  if (currentWeek >= challenge.totalWeeks && everyWeek.every((w) => weeks.has(w))) {
    won.push('no-days-off')
  }

  return won
}

export const rewardsSnapshot = (input: RewardsInput): RewardsSnapshot => {
  const points = totalPoints(input)
  const rank = rankFor(points)
  const nextRank = nextRankFor(points)
  const span = nextRank ? nextRank.minPoints - rank.minPoints : 0
  const earned = evaluateBadges(input)
  const qualified = qualifyingSessions(input.sessions).length

  return {
    points,
    rank,
    nextRank,
    pointsToNextRank: nextRank ? nextRank.minPoints - points : 0,
    rankProgress:
      span > 0 ? Math.min(100, Math.round(((points - rank.minPoints) / span) * 100)) : 100,
    streakWeeks: streakWeeks(input.sessions, input.joinedAt, input.currentWeek),
    sessionsQualified: qualified,
    sessionsBelowThreshold: input.sessions.length - qualified,
    earned,
    badgeCount: Object.keys(input.earnedBadges).filter((id) =>
      badges.some((b) => b.id === id),
    ).length,
    badgeTotal: badges.length,
  }
}

// --- Leaderboard -----------------------------------------------------------
export interface LeaderboardRow extends LeaderboardEntry {
  /** Where the row landed, which is only ever its index in the sort. */
  position: number
}

/**
 * Order the cohort by qualifying sessions logged, highest first.
 *
 * Ties break alphabetically on display name: simple, deterministic, and it
 * cannot look like the coach put a thumb on the scale.
 */
export const rankLeaderboard = (entries: LeaderboardEntry[]): LeaderboardRow[] =>
  [...entries]
    .sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name))
    .map((entry, index) => ({ ...entry, position: index + 1 }))
