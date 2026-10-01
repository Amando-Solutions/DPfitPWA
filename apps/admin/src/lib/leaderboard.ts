import { collection, getDocs, query, where } from "firebase/firestore"
import { firebaseDb } from "@/lib/firebase"

export type MemberGamification = { streakWeeks: number; badgesEarned: number }

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** The cohort's challenge week today, 1-based: the PWA's streak counts back from it. */
export function cohortWeek(startDate: Date, durationWeeks: number, now: number) {
  const week = Math.floor((now - startDate.getTime()) / WEEK_MS) + 1
  return Math.min(Math.max(week, 0), durationWeeks)
}

/**
 * Weeks in a row, counting back from the current week, with at least one
 * qualifying session. The PWA's `streakWeeks` (lib/domain/rewards.ts), computed
 * the same way because the member document's `stats.streakWeeks` is never
 * written: the current week only breaks the streak once it is over.
 */
export function streakWeeks(qualifyingWeeks: Set<number>, currentWeek: number) {
  let streak = 0
  let week = qualifyingWeeks.has(currentWeek) ? currentWeek : currentWeek - 1
  while (week >= 1 && qualifyingWeeks.has(week)) {
    streak++
    week--
  }
  return streak
}

/**
 * Streak and badge count for each member of one cohort. Two small queries per
 * member (their qualifying sessions and their badges), so it costs one read per
 * qualifying session and per badge, and only for the cohort being viewed.
 */
export async function fetchCohortGamification(memberIds: string[], currentWeek: number): Promise<Map<string, MemberGamification>> {
  if (!firebaseDb) throw new Error("The leaderboard is not configured.")
  const database = firebaseDb
  const entries = await Promise.all(memberIds.map(async (memberId) => {
    const [sessions, badges] = await Promise.all([
      getDocs(query(collection(database, "members", memberId, "sessions"), where("qualifies", "==", true))),
      getDocs(collection(database, "members", memberId, "badges")),
    ])
    const weeks = new Set(sessions.docs.map((item) => Number(item.data().weekNumber ?? 0)).filter((week) => week > 0))
    return [memberId, { streakWeeks: streakWeeks(weeks, currentWeek), badgesEarned: badges.size }] as const
  }))
  return new Map(entries)
}
