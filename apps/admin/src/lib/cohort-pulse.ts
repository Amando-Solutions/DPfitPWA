import { collection, collectionGroup, getDocs, orderBy, query, where } from "firebase/firestore"
import { readCheckIn, reportsPain, type FeedbackRow } from "@/lib/feedback"
import { firebaseDb } from "@/lib/firebase"
import type { MemberRecord } from "@/lib/members"
import type { ProgramRecord } from "@/lib/programs"

const DAY_MS = 24 * 60 * 60 * 1000
export const INACTIVE_AFTER_DAYS = 7

export type CohortPulseData = {
  checkIns: FeedbackRow[]
  /** Sessions logged in the cohort's current week, by its members. */
  sessionsThisWeek: number
  /** Registration access codes (upper-cased) and how many have none yet. */
  registrationCodes: string[]
  registrationsWithoutCode: number
}

/**
 * The few reads the pulse needs beyond the console's existing listeners: each
 * member's check-ins (at most one per week), the current week's sessions, and the
 * cohort's registrations. A one-off read, cached by the caller.
 */
export async function fetchCohortPulse(cohortId: string, memberIds: string[], currentWeek: number): Promise<CohortPulseData> {
  if (!firebaseDb) throw new Error("Cohort pulse is not configured.")
  const database = firebaseDb
  const ids = new Set(memberIds)
  const [checkIns, sessions, registrations] = await Promise.all([
    Promise.all(memberIds.map((memberId) => getDocs(collection(database, "members", memberId, "checkIns")))),
    // Every cohort in the same week shares this query; members of other cohorts are dropped below.
    currentWeek > 0
      ? getDocs(query(collectionGroup(database, "sessions"), where("weekNumber", "==", currentWeek), orderBy("completedAt", "desc")))
      : Promise.resolve(null),
    getDocs(query(collection(database, "registrations"), where("cohortId", "==", cohortId))),
  ])
  const codes = registrations.docs.map((item) => item.data().code).filter((code): code is string => typeof code === "string" && !!code)
  return {
    checkIns: checkIns.flatMap((snapshot) => snapshot.docs.map(readCheckIn)),
    sessionsThisWeek: sessions?.docs.filter((item) => ids.has(item.ref.parent.parent?.id ?? "")).length ?? 0,
    registrationCodes: codes.map((code) => code.toUpperCase()),
    registrationsWithoutCode: registrations.size - codes.length,
  }
}

/**
 * The week whose check-in members should have sent by now. The member app asks for
 * the current week's check-in during that week, so it counts from the week's last
 * two days (or once the cohort is over); before that, last week's is the one owed.
 */
export function checkInWeekOwed(startDate: Date, durationWeeks: number, now: number) {
  const day = Math.floor((now - startDate.getTime()) / DAY_MS)
  if (day < 0) return 0
  const week = Math.floor(day / 7) + 1
  if (week > durationWeeks) return durationWeeks
  return day % 7 >= 5 ? week : week - 1
}

export type PulseIssue = {
  memberId: string
  memberName: string
  kind: "inactive" | "missing-check-in" | "flagged" | "pain"
  title: string
  detail: string
}

export function pulseIssues({ members, checkIns, startDate, weekOwed, now }: {
  members: MemberRecord[]
  checkIns: FeedbackRow[]
  startDate: Date
  weekOwed: number
  now: number
}): PulseIssue[] {
  const started = now >= startDate.getTime()
  return members.filter((member) => member.status === "active").flatMap((member) => {
    const issues: PulseIssue[] = []
    const base = { memberId: member.id, memberName: member.profile.displayName }
    const mine = checkIns.filter((row) => row.memberId === member.id).sort((a, b) => b.weekNumber - a.weekNumber)
    const latest = mine[0]

    // Inactive: no workout in a week, counted from their last session, else from when they could start.
    const since = member.stats.lastSessionAt ?? new Date(Math.max(startDate.getTime(), member.joinedAt.getTime()))
    const idle = Math.floor((now - since.getTime()) / DAY_MS)
    if (started && idle > INACTIVE_AFTER_DAYS) {
      issues.push({ ...base, kind: "inactive", title: "Inactive", detail: member.stats.lastSessionAt ? `No workout logged in ${idle} days` : `No workout logged yet, ${idle} days in` })
    }
    if (weekOwed > 0 && !mine.some((row) => row.weekNumber === weekOwed)) {
      issues.push({ ...base, kind: "missing-check-in", title: "Missing check-in", detail: `No check-in submitted for Week ${weekOwed}` })
    }
    if (latest?.reviewStatus === "needs-attention") {
      issues.push({ ...base, kind: "flagged", title: "Check-in flagged", detail: `Week ${latest.weekNumber}${latest.reviewNote ? `: ${latest.reviewNote}` : " check-in marked as needing attention"}` })
    } else if (latest && latest.reviewStatus !== "reviewed" && reportsPain(latest.pain)) {
      issues.push({ ...base, kind: "pain", title: "Reported pain", detail: `Week ${latest.weekNumber}: ${latest.pain}` })
    }
    return issues
  })
}

/** Consecutive weeks sharing a theme title form a phase; untitled weeks are their own. */
export function programPhases(program: ProgramRecord | null, durationWeeks: number) {
  const phases: Array<{ title: string; fromWeek: number; toWeek: number }> = []
  for (let week = 1; week <= durationWeeks; week++) {
    const title = program?.weekThemes.find((theme) => theme.weekNumber === week)?.title.trim() || `Week ${week}`
    const last = phases.at(-1)
    if (last && last.title === title) last.toWeek = week
    else phases.push({ title, fromWeek: week, toWeek: week })
  }
  return phases
}

/** Registrations for the cohort that haven't become a member yet: no code, or a code nobody has redeemed. */
export function pendingSignups(data: CohortPulseData, members: MemberRecord[]) {
  const memberCodes = new Set(members.map((member) => member.accessCode.toUpperCase()).filter(Boolean))
  return data.registrationsWithoutCode + data.registrationCodes.filter((code) => !memberCodes.has(code)).length
}
