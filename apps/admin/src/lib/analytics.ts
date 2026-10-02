import { collection, getDocs, query, where, type QuerySnapshot } from "firebase/firestore"
import { readCheckIn, reportsPain, type FeedbackRow } from "@/lib/feedback"
import { firebaseDb } from "@/lib/firebase"
import { logInCohort, type MemberRecord } from "@/lib/members"

export type AnalyticsSession = {
  memberId: string
  weekNumber: number
  dayNumber: number
  label: string
  setsDone: number
  setsTotal: number
  qualifies: boolean
  durationSeconds: number
}

export type AnalyticsRegistration = {
  id: string
  code: string | null
  paymentStatus: string
  paidAmountMinor: number
  paidCurrency: string
}

export type CohortActivity = {
  sessions: AnalyticsSession[]
  checkIns: FeedbackRow[]
  badges: Map<string, Set<string>>
  registrations: AnalyticsRegistration[]
  unresolvedSales: number
  /** Billed document reads for this load: one per document, or one for an empty query. */
  reads: number
}

const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0

/**
 * Everything the analytics page needs beyond the member, cohort, program and code
 * listeners the console already holds, for one cohort, in one pass: each member's
 * sessions, check-ins and badges, plus the cohort's registrations. A one-off read
 * cached by the caller, never a listener, so it costs one read per document once
 * per load rather than on every change.
 *
 * `members` is `membersOf` the cohort, and only their logs from this cohort
 * count: a member who has been in another keeps its logs too. See `logInCohort`.
 */
export async function fetchCohortActivity(
  cohortId: string,
  members: Pick<MemberRecord, "id" | "activeCohortId">[],
): Promise<CohortActivity> {
  if (!firebaseDb) throw new Error("Analytics are not configured.")
  const database = firebaseDb
  let reads = 0
  const count = <T extends QuerySnapshot>(snapshot: T) => { reads += Math.max(1, snapshot.size); return snapshot }

  const perMember = await Promise.all(members.map(async ({ id: memberId, activeCohortId }) => {
    const [allSessions, allCheckIns, allBadges] = await Promise.all([
      getDocs(collection(database, "members", memberId, "sessions")).then(count),
      getDocs(collection(database, "members", memberId, "checkIns")).then(count),
      getDocs(collection(database, "members", memberId, "badges")).then(count),
    ])
    const here = <T extends { data: () => Record<string, unknown> }>(docs: T[]) =>
      docs.filter((item) => logInCohort(item.data(), cohortId, activeCohortId))
    const sessions = { docs: here(allSessions.docs) }
    const checkIns = { docs: here(allCheckIns.docs) }
    const badges = { docs: here(allBadges.docs) }
    return {
      sessions: sessions.docs.map((item): AnalyticsSession => {
        const data = item.data()
        return {
          memberId,
          weekNumber: number(data.weekNumber),
          dayNumber: number(data.dayNumber),
          label: typeof data.label === "string" && data.label.trim() ? data.label.trim() : `Day ${number(data.dayNumber)}`,
          setsDone: number(data.setsDone),
          setsTotal: number(data.setsTotal),
          qualifies: data.qualifies === true,
          durationSeconds: number(data.durationSeconds),
        }
      }),
      checkIns: checkIns.docs.map(readCheckIn),
      // By `badgeId`: a cohort the member has left keeps its badges at `{cohortId}~{badgeId}`.
      badges: [memberId, new Set(badges.docs.map((item) => String(item.data().badgeId ?? item.id)))] as const,
    }
  }))

  const [registrations, sales] = await Promise.all([
    getDocs(query(collection(database, "registrations"), where("cohortId", "==", cohortId))).then(count),
    getDocs(query(collection(database, "unmatchedSales"), where("resolved", "==", false))).then(count),
  ])

  return {
    sessions: perMember.flatMap((item) => item.sessions),
    checkIns: perMember.flatMap((item) => item.checkIns),
    badges: new Map(perMember.map((item) => item.badges)),
    registrations: registrations.docs.map((item) => {
      const data = item.data()
      return {
        id: item.id,
        code: typeof data.code === "string" && data.code ? data.code.toUpperCase() : null,
        paymentStatus: String(data.paymentStatus ?? "pending"),
        paidAmountMinor: number(data.paidAmountMinor),
        paidCurrency: typeof data.paidCurrency === "string" && data.paidCurrency ? data.paidCurrency : String(data.currency ?? "NGN"),
      }
    }),
    unresolvedSales: sales.size,
    reads,
  }
}

const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null

/** Weeks whose check-in is due: every week that has ended, or all of them once the cohort has. */
export function weeksDue(currentWeek: number, durationWeeks: number, ended: boolean) {
  return ended ? durationWeeks : Math.max(0, currentWeek - 1)
}

export function sessionsPerWeek(sessions: AnalyticsSession[], durationWeeks: number) {
  return Array.from({ length: durationWeeks }, (_, index) => sessions.filter((session) => session.weekNumber === index + 1).length)
}

/** Average self-rated nutrition adherence per week, null for a week nobody rated. */
export function adherencePerWeek(checkIns: FeedbackRow[], durationWeeks: number) {
  return Array.from({ length: durationWeeks }, (_, index) => {
    const value = average(checkIns.filter((row) => row.weekNumber === index + 1 && row.nutritionPct !== null).map((row) => row.nutritionPct!))
    return value === null ? null : Math.round(value)
  })
}

/** Share of prescribed sets done, per training day, capped at 100% per session. */
export function completionByDay(sessions: AnalyticsSession[]) {
  const days = new Map<string, { label: string; dayNumber: number; ratios: number[] }>()
  for (const session of sessions) {
    if (session.setsTotal <= 0) continue
    const entry = days.get(session.label) ?? { label: session.label, dayNumber: session.dayNumber, ratios: [] }
    entry.ratios.push(Math.min(1, session.setsDone / session.setsTotal))
    days.set(session.label, entry)
  }
  return [...days.values()]
    .sort((a, b) => a.dayNumber - b.dayNumber || a.label.localeCompare(b.label))
    .map((day) => ({ label: day.label, percent: Math.round(average(day.ratios)! * 100), logged: day.ratios.length }))
}

export const trainingFeelOptions = [
  { value: "too-easy", label: "Too easy" },
  { value: "just-right", label: "Just right" },
  { value: "too-hard", label: "Too hard" },
] as const

export function trainingFeelCounts(checkIns: FeedbackRow[]) {
  return trainingFeelOptions.map((option) => ({ ...option, count: checkIns.filter((row) => row.trainingFeel === option.value).length }))
}

export type TrendingDown = { member: MemberRecord; from: number | null; to: number | null }

/**
 * Members whose adherence fell 15+ points between two check-ins two weeks apart,
 * or who checked in the first week and not the second. A slower signal than the
 * members list's attention flags, which fire on a single missed week.
 */
export function membersTrendingDown(members: MemberRecord[], checkIns: FeedbackRow[], fromWeek: number, toWeek: number): TrendingDown[] {
  const adherence = (memberId: string, week: number) => {
    const row = checkIns.find((item) => item.memberId === memberId && item.weekNumber === week)
    return row ? row.nutritionPct ?? -1 : null
  }
  return members.flatMap((member) => {
    const from = adherence(member.id, fromWeek)
    const to = adherence(member.id, toWeek)
    if (from === null || from < 0) return []
    if (to === null) return [{ member, from, to: null }]
    return to >= 0 && from - to >= 15 ? [{ member, from, to }] : []
  })
}

export function painSignals(checkIns: FeedbackRow[]) {
  return checkIns.filter((row) => reportsPain(row.pain)).sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime())
}

export function registrationFunnel(registrations: AnalyticsRegistration[], memberCodes: Set<string>) {
  const paid = registrations.filter((item) => item.paymentStatus === "paid" || item.code)
  const issued = registrations.filter((item) => item.code)
  const joined = issued.filter((item) => memberCodes.has(item.code!))
  return [
    { label: "Registered", count: registrations.length },
    { label: "Payment confirmed", count: paid.length },
    { label: "Code issued", count: issued.length },
    { label: "Became a member", count: joined.length },
  ]
}

/** Money actually received, per currency, in major units. */
export function revenue(registrations: AnalyticsRegistration[]) {
  const totals = new Map<string, number>()
  for (const item of registrations) {
    if (item.paymentStatus !== "paid" || item.paidAmountMinor <= 0) continue
    totals.set(item.paidCurrency, (totals.get(item.paidCurrency) ?? 0) + item.paidAmountMinor / 100)
  }
  return [...totals.entries()].map(([currency, amount]) => ({ currency, amount }))
}
