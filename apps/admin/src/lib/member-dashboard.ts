import type { MemberProfile, MemberRecord, MemberStatus } from "@/lib/members"

const DAY_MS = 86_400_000
const INACTIVE_AFTER_DAYS = 7

export type MemberDashboardStatus = MemberStatus | "needs-attention"

export type MemberAttentionIssue = {
  memberId: string
  memberName: string
  reason: string
}

export const memberBadgeDefinitions = [
  { id: "first-workout", name: "First Rep", emoji: "💪" },
  { id: "first-photo", name: "Photo Proof", emoji: "📸" },
  { id: "consistency-queen", name: "Consistency Queen", emoji: "👑" },
  { id: "checkin-streak-4", name: "Check-In Streak", emoji: "📋" },
  { id: "foundation-complete", name: "Foundation Complete", emoji: "🏁" },
  { id: "peak-performer", name: "Peak Performer", emoji: "🏆" },
  { id: "no-days-off", name: "No Days Off", emoji: "🔥" },
] as const

export const defaultMemberRanks = [
  { name: "New Entry", emoji: "🌱", minPoints: 0 },
  { name: "In Progress", emoji: "⚡", minPoints: 40 },
  { name: "Building Momentum", emoji: "💫", minPoints: 100 },
  { name: "Overload Mode", emoji: "🔥", minPoints: 200 },
  { name: "Peak Performer", emoji: "🏆", minPoints: 350 },
] as const

export function challengeDay(member: MemberRecord) {
  const joinedAt = member.joinedAt.getTime()
  if (joinedAt <= 0) return null
  return Math.min(42, Math.max(1, Math.floor((Date.now() - joinedAt) / DAY_MS) + 1))
}

export function challengeWeek(member: MemberRecord) {
  const day = challengeDay(member)
  return day ? Math.min(6, Math.ceil(day / 7)) : null
}

export function memberAdherence(member: MemberRecord) {
  const day = challengeDay(member)
  if (!day || !member.setupComplete) return null
  const weeklyTarget = member.profile.trainingDaysPerWeek || 4
  const expectedSessions = Math.max(1, Math.ceil((day / 7) * weeklyTarget))
  return Math.min(100, Math.round((member.stats.sessionsLogged / expectedSessions) * 100))
}

function inactiveDays(member: MemberRecord) {
  const activityDate = member.stats.lastSessionAt ?? member.lastActiveAt
  if (!activityDate || activityDate.getTime() <= 0) return challengeDay(member) ?? 0
  return Math.max(0, Math.floor((Date.now() - activityDate.getTime()) / DAY_MS))
}

// Participating = actually training: an active member who logged a workout within the
// same window after which the dashboard flags them as inactive. App opens don't count.
export function isParticipating(member: MemberRecord, now: number) {
  const lastSession = member.stats.lastSessionAt?.getTime() ?? 0
  return member.status === "active" && lastSession > 0 && now - lastSession <= INACTIVE_AFTER_DAYS * DAY_MS
}

export const PARTICIPATION_WINDOW_DAYS = INACTIVE_AFTER_DAYS

export function attentionReasons(member: MemberRecord) {
  const reasons: string[] = []
  const isInChallenge = member.status === "active"
  const currentWeek = challengeWeek(member)

  if (isInChallenge && inactiveDays(member) > INACTIVE_AFTER_DAYS) {
    reasons.push("Inactive")
  }
  if (
    isInChallenge &&
    currentWeek !== null &&
    currentWeek > 1 &&
    (member.activitySummary.latestCheckInWeek ?? 0) < currentWeek
  ) {
    reasons.push("Missing check-in")
  }
  if (member.activitySummary.latestCheckInReviewStatus === "needs-attention") {
    reasons.push("Check-in needs review")
  }
  if (member.activitySummary.pendingProofCount > 0) {
    reasons.push("Proof awaiting review")
  }

  return reasons
}

export function attentionDetails(member: MemberRecord) {
  return attentionReasons(member).map((reason) => {
    if (reason === "Inactive") {
      const days = inactiveDays(member)
      return `Inactive: No workout logged in ${days} day${days === 1 ? "" : "s"}`
    }
    if (reason === "Missing check-in") {
      return `Missing check-in: No check-in submitted for Week ${challengeWeek(member) ?? "-"}`
    }
    if (reason === "Proof awaiting review") {
      const count = member.activitySummary.pendingProofCount
      return `${count} workout proof${count === 1 ? "" : "s"} awaiting review`
    }
    return reason
  })
}

export function memberDashboardStatus(member: MemberRecord): MemberDashboardStatus {
  return attentionReasons(member).length > 0 ? "needs-attention" : member.status
}

export function humanizeMemberValue(value: string, empty = "Not assigned") {
  if (!value) return empty
  return value
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function memberGoalLabel(goal: string) {
  const normalized = goal.trim().toLowerCase()
  if (normalized === "recomp") return "Balanced recomp"
  if (normalized === "fat-loss" || normalized === "fat loss") return "Fat-loss focused recomp"
  if (normalized === "muscle-gain" || normalized === "muscle gain") return "Muscle-gain focused recomp"
  return goal ? humanizeMemberValue(goal) : "Not provided"
}

export function memberRank(points: number) {
  return [...defaultMemberRanks].reverse().find((rank) => points >= rank.minPoints) ?? defaultMemberRanks[0]
}

export function nutritionTargets(profile: MemberProfile) {
  const weight = profile.weightKg ?? 70
  const height = profile.heightCm ?? 168
  const age = profile.age ?? 30
  const base = 10 * weight + 6.25 * height - 5 * age
  const bmr = Math.round(profile.sex === "male" ? base + 5 : base - 161)
  const activityMultiplier = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    very: 1.725,
  }[profile.activity] ?? 1.55
  const goalMultiplier = {
    "fat-loss": 0.8,
    recomp: 0.9,
    "muscle-gain": 1.05,
  }[profile.goal] ?? 0.9
  const calories = Math.round(bmr * activityMultiplier * goalMultiplier)
  const protein = Math.round(weight * 2)
  const fat = Math.round((calories * 0.25) / 9)
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4))

  return {
    calories,
    protein,
    carbs,
    fat,
    plateStructure:
      "A palm of protein, a cupped hand of carbs, half a thumb of fat, and vegetables to fill the rest.",
  }
}

