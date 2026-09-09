import type { Timestamp } from 'firebase/firestore'

import type {
  BadgeRuleId,
  CheckIn,
  EarnedBadge,
  LeaderboardEntry,
  Program,
  ProgressPhoto,
  Rank,
  RewardConfig,
  SessionLog,
  WorkoutDay,
} from '~/data/types'

// =============================================================================
// The reward system.
//
// Points, rank, streak, badges and the leaderboard are all pure functions of
// the member's logs and their program, recomputed on every read. Nothing here
// is stored as its own value: a saved rank or streak is the one thing
// guaranteed to drift out of sync with the data it claims to describe.
//
// Nothing here decides a *number*, either. The threshold, the point values, the
// badge ladder, the rank ladder and every badge target are authored on the
// program document and arrive as `RewardsContext`. This module only applies
// them, so re-tuning a cohort is an edit in the console rather than a release.
// =============================================================================

/**
 * Everything a reward calculation needs that is not the member's own logs.
 *
 * `planDayIds` and `totalWeeks` are separate from `config` because they are not
 * part of the reward economy — they are the shape of the plan the economy is
 * being applied to, and two of the badge rules ask about them.
 */
export interface RewardsContext {
  config: RewardConfig
  /** Ids of the days that make up the training week. Excludes optional days. */
  planDayIds: string[]
  totalWeeks: number
  /** The share of prescribed sets a session has to log to count for anything. */
  qualifyingSetPercent: number
}

/**
 * The context before a program has loaded, or when the read failed.
 *
 * Everything zero and empty: no ranks, no badges, no points and a threshold of
 * zero. It exists so the store's computeds have something total to evaluate
 * against on the way to the first paint, not as a set of defaults — a member
 * looking at this is looking at a screen whose program did not load, and the
 * numbers on it should be visibly absent rather than plausibly wrong.
 */
export const EMPTY_REWARDS_CONTEXT: RewardsContext = {
  config: {
    values: { workout: 0, checkIn: 0, progressPhoto: 0, core: 0, cardio: 0 },
    badgeTierPoints: { starter: 0, consistency: 0, elite: 0 },
    badgeTargets: {
      dayRepeats: 0,
      checkInWeeks: 0,
      foundationWeek: 0,
      foundationSessions: 0,
      peakWeek: 0,
      peakSessions: 0,
    },
    ranks: [],
    badges: [],
  },
  planDayIds: [],
  totalWeeks: 0,
  qualifyingSetPercent: 0,
}

/** What a member with no ranks authored — or no program loaded — is shown. */
export const UNRANKED: Rank = { id: 'unranked', name: 'Unranked', emoji: '·', minPoints: 0 }

export const rewardsContextOf = (
  program: Program | null,
  workoutDays: WorkoutDay[],
): RewardsContext =>
  program
    ? {
        config: program.rewards,
        // The finisher is not part of the weekly quota, so "every training day,
        // three times each" must not silently require it.
        planDayIds: workoutDays.filter((day) => !day.optional).map((day) => day.id),
        totalWeeks: program.totalWeeks,
        qualifyingSetPercent: program.qualifyingSetPercent,
      }
    : EMPTY_REWARDS_CONTEXT

/**
 * Whether a set count clears the threshold.
 *
 * Measured against the sets the *plan* asked for, not the total logged: sets a
 * member adds themselves are extra credit, and extra work must never be able to
 * push a finished session below the line.
 *
 * A threshold of zero means no program was loaded, and nothing qualifies under
 * it — the caller is on a screen that could not read the rules it would be
 * judging against, and guessing in the member's favour would promise RP the
 * server is about to decline to pay.
 */
export const sessionQualifies = (
  setsDone: number,
  setsPrescribed: number,
  qualifyingSetPercent: number,
): boolean =>
  qualifyingSetPercent > 0 &&
  setsPrescribed > 0 &&
  (setsDone / setsPrescribed) * 100 >= qualifyingSetPercent

/**
 * Whether a saved session counts.
 *
 * Read straight off the document rather than recomputed: the flag is resolved
 * once, server-side, against the `qualifyingSetPercent` in force for that
 * member's program version. Re-deciding it here would re-judge old sessions
 * under a threshold they were never trained against, and would let a client
 * that lied about its set counts award itself points.
 */
export const isQualifying = (session: SessionLog): boolean => session.qualifies

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
  /**
   * Kept even though every derivation below now reads `weekNumber` straight off
   * the session: it is what a caller needs to resolve that week number in the
   * first place, and dropping it from the input would push the join date into
   * every call site individually.
   */
  joinedAt: Timestamp
  currentWeek: number
  sessions: SessionLog[]
  checkIns: CheckIn[]
  photos: ProgressPhoto[]
  /** Badge id → award record. Keyed for lookup; see `EarnedBadge`. */
  earnedBadges: Record<string, EarnedBadge>
}

/** RP already banked from unlocked badges. Append-only, so it only ever grows. */
export const badgePoints = (
  earnedBadges: Record<string, EarnedBadge>,
  { config }: RewardsContext,
): number =>
  config.badges.reduce(
    (n, b) => (earnedBadges[b.id] ? n + (config.badgeTierPoints[b.tier] ?? 0) : n),
    0,
  )

/**
 * The member's RP.
 *
 * Recomputed from the logs rather than incremented, so a point total can never
 * disagree with the sessions behind it. Only qualifying sessions pay out;
 * check-ins and photos have no threshold to meet.
 */
export const totalPoints = (
  input: Pick<RewardsInput, 'sessions' | 'checkIns' | 'photos' | 'earnedBadges'>,
  context: RewardsContext,
): number => {
  const { values } = context.config
  return (
    qualifyingSessions(input.sessions).length * values.workout +
    input.checkIns.length * values.checkIn +
    input.photos.length * values.progressPhoto +
    badgePoints(input.earnedBadges, context)
  )
}

export const rankFor = (points: number, ranks: Rank[]): Rank =>
  [...ranks].reverse().find((r) => points >= r.minPoints) ?? ranks[0] ?? UNRANKED

export const nextRankFor = (points: number, ranks: Rank[]): Rank | null =>
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
const weekNumbers = (sessions: SessionLog[]): Set<number> =>
  new Set(qualifyingSessions(sessions).map((s) => s.weekNumber))

/**
 * Weeks in a row, counting back from the current week, containing at least one
 * qualifying session. The current week only breaks the streak once it is over,
 * so an untouched Monday doesn't wipe out five good weeks.
 */
export const streakWeeks = (sessions: SessionLog[], currentWeek: number): number => {
  const weeks = weekNumbers(sessions)
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
 *
 * Each rule is gated on the authored numbers it needs actually being there. A
 * target of zero is not "everybody qualifies immediately" — it is a program
 * that has not been read, and awarding a badge against it would be permanent:
 * `awardBadge` is append-only and nothing takes one back.
 */
export const evaluateBadges = (
  input: RewardsInput,
  context: RewardsContext,
): BadgeRuleId[] => {
  const { checkIns, photos, currentWeek } = input
  const { badgeTargets: targets } = context.config
  const sessions = qualifyingSessions(input.sessions)
  const won: BadgeRuleId[] = []

  if (sessions.length >= 1) won.push('first-workout')
  if (photos.length >= 1) won.push('first-photo')

  // Every training day several times over, not one pass through the programme.
  const perDay = new Map<string, number>()
  for (const session of sessions) {
    perDay.set(session.dayId, (perDay.get(session.dayId) ?? 0) + 1)
  }
  if (
    targets.dayRepeats > 0 &&
    context.planDayIds.length > 0 &&
    context.planDayIds.every((id) => (perDay.get(id) ?? 0) >= targets.dayRepeats)
  ) {
    won.push('consistency-queen')
  }

  // The same consecutive-week logic as the workout streak, on check-ins.
  const checkInRun = longestWeekRun(checkIns.map((c) => c.weekNumber))
  if (targets.checkInWeeks > 0 && checkInRun >= targets.checkInWeeks) {
    won.push('checkin-streak-4')
  }

  // Reaching the week by the calendar is not enough on its own: the volume has
  // to be there too, or the badge is a reward for waiting.
  if (
    targets.foundationWeek > 0 &&
    currentWeek >= targets.foundationWeek &&
    sessions.length >= targets.foundationSessions
  ) {
    won.push('foundation-complete')
  }
  if (
    targets.peakWeek > 0 &&
    currentWeek >= targets.peakWeek &&
    sessions.length >= targets.peakSessions
  ) {
    won.push('peak-performer')
  }

  // Every single week of the programme, with none skipped along the way.
  const weeks = weekNumbers(input.sessions)
  const everyWeek = Array.from({ length: context.totalWeeks }, (_, i) => i + 1)
  if (
    context.totalWeeks > 0 &&
    currentWeek >= context.totalWeeks &&
    everyWeek.every((w) => weeks.has(w))
  ) {
    won.push('no-days-off')
  }

  // A badge the program does not define cannot be awarded: the ladder is
  // authored content, and `awardBadge` writes against the ids in it.
  const defined = new Set(context.config.badges.map((b) => b.id))
  return won.filter((id) => defined.has(id))
}

export const rewardsSnapshot = (
  input: RewardsInput,
  context: RewardsContext,
): RewardsSnapshot => {
  const { ranks, badges } = context.config
  const points = totalPoints(input, context)
  const rank = rankFor(points, ranks)
  const nextRank = nextRankFor(points, ranks)
  const span = nextRank ? nextRank.minPoints - rank.minPoints : 0
  const earned = evaluateBadges(input, context)
  const qualified = qualifyingSessions(input.sessions).length

  return {
    points,
    rank,
    nextRank,
    pointsToNextRank: nextRank ? nextRank.minPoints - points : 0,
    rankProgress:
      span > 0 ? Math.min(100, Math.round(((points - rank.minPoints) / span) * 100)) : 100,
    streakWeeks: streakWeeks(input.sessions, input.currentWeek),
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
