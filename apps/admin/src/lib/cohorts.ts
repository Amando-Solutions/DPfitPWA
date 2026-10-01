import type { User } from "firebase/auth"
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore"

import { firebaseDb } from "@/lib/firebase"
import type { ProgramRecord } from "@/lib/programs"

export type CohortStatus = "draft" | "active" | "archived"

export type CohortCoach = {
  uid: string
  name: string
  title: string
  avatarUrl: string
}

export type CohortRecord = {
  id: string
  name: string
  status: CohortStatus
  startDate: Date
  durationWeeks: number
  timezone: string
  memberCount: number
  programId: string | null
  programName: string | null
  programVersion: number | null
  coach: CohortCoach | null
  leaderboardVisible: boolean
  leaderboardRevealWeek: number
  createdAt: Date
}

export type CohortExperienceInput = {
  coachName: string
  coachTitle: string
  coachAvatarUrl: string
  leaderboardVisible: boolean
  leaderboardRevealWeek: number
}

type CreateCohortInput = {
  name: string
  status: Exclude<CohortStatus, "archived">
  startDate: Date
  durationWeeks: number
  program: ProgramRecord
  user: User
}

const COHORT_LIMIT = 100
const DEFAULT_TIMEZONE = "Africa/Lagos"
function requireDatabase() {
  if (!firebaseDb) throw new Error("Cohorts are not configured.")
  return firebaseDb
}

function readDate(value: unknown) {
  return value instanceof Timestamp ? value.toDate() : new Date(0)
}

function readCoach(value: unknown): CohortCoach | null {
  if (!value || typeof value !== "object") return null
  const coach = value as Record<string, unknown>
  return {
    uid: String(coach.uid ?? ""),
    name: String(coach.name ?? ""),
    title: String(coach.title ?? ""),
    avatarUrl: String(coach.avatarUrl ?? ""),
  }
}

export function subscribeToCohorts(
  onData: (records: CohortRecord[]) => void,
  onError: (message: string) => void,
): Unsubscribe {
  if (!firebaseDb) {
    const timeout = window.setTimeout(
      () => onError("Cohorts are not configured."),
      0,
    )
    return () => window.clearTimeout(timeout)
  }

  const cohortsQuery = query(
    collection(firebaseDb, "cohorts"),
    orderBy("createdAt", "desc"),
    limit(COHORT_LIMIT),
  )

  return onSnapshot(
    cohortsQuery,
    (snapshot) => {
      onData(
        snapshot.docs.map((snapshotDocument) => {
          const data = snapshotDocument.data({ serverTimestamps: "estimate" })

          return {
            id: snapshotDocument.id,
            name: String(data.name ?? "Unnamed cohort"),
            status: (data.status ?? "draft") as CohortStatus,
            startDate: readDate(data.startDate),
            durationWeeks:
              typeof data.durationWeeks === "number" ? data.durationWeeks : 6,
            timezone: String(data.timezone ?? DEFAULT_TIMEZONE),
            memberCount:
              typeof data.memberCount === "number" ? data.memberCount : 0,
            programId: typeof data.programId === "string" ? data.programId : null,
            programName: typeof data.programName === "string" ? data.programName : null,
            programVersion:
              typeof data.programVersion === "number" ? data.programVersion : null,
            coach: readCoach(data.coach),
            leaderboardVisible: data.leaderboardVisible === true,
            leaderboardRevealWeek:
              typeof data.leaderboardRevealWeek === "number"
                ? data.leaderboardRevealWeek
                : 1,
            createdAt: readDate(data.createdAt),
          } satisfies CohortRecord
        }),
      )
    },
    () => onError("The cohort list could not be loaded."),
  )
}

export async function createCohort({
  name,
  status,
  startDate,
  durationWeeks,
  program,
  user,
}: CreateCohortInput) {
  const database = requireDatabase()
  const safeName = name.trim()
  const safeDuration = Math.trunc(durationWeeks)

  if (safeName.length < 2 || safeName.length > 80) {
    throw new Error("Cohort name must be between 2 and 80 characters.")
  }
  if (Number.isNaN(startDate.getTime())) {
    throw new Error("Choose a valid start date.")
  }
  if (safeDuration < 1 || safeDuration > 52) {
    throw new Error("Duration must be between 1 and 52 weeks.")
  }

  const reference = doc(collection(database, "cohorts"))
  const batch = writeBatch(database)
  const endDate = new Date(startDate)
  endDate.setUTCDate(endDate.getUTCDate() + safeDuration * 7)
  batch.set(reference, {
    name: safeName,
    status,
    startDate: Timestamp.fromDate(startDate),
    endDate: Timestamp.fromDate(endDate),
    durationWeeks: safeDuration,
    timezone: DEFAULT_TIMEZONE,
    memberCount: 0,
    coach: {
      uid: user.uid,
      name: "DP Fit Coach",
      title: "Coach",
      avatarUrl: "",
    },
    leaderboardVisible: false,
    leaderboardRevealWeek: 1,
    programId: program.id,
    programName: program.name,
    programVersion: program.version,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdByUid: user.uid,
    createdByEmail: user.email,
    updatedByUid: user.uid,
    updatedByEmail: user.email,
    archivedAt: null,
  })
  await batch.commit()

  return reference.id
}

export async function assignProgramToCohort(
  cohort: CohortRecord,
  program: ProgramRecord,
  user: User,
) {
  const database = requireDatabase()

  if (cohort.status === "archived") {
    throw new Error("Archived cohorts cannot be changed.")
  }
  if (cohort.status === "active" && cohort.programId) {
    throw new Error("The program for an active cohort is locked.")
  }
  if (program.status !== "published") {
    throw new Error("Only published programs can be assigned.")
  }

  await updateDoc(doc(database, "cohorts", cohort.id), {
    programId: program.id,
    programName: program.name,
    programVersion: program.version,
    updatedAt: serverTimestamp(),
    updatedByUid: user.uid,
    updatedByEmail: user.email,
  })
}

export async function setCohortStatus(
  cohort: CohortRecord,
  status: Extract<CohortStatus, "active" | "archived">,
  user: User,
) {
  const database = requireDatabase()

  if (cohort.status === status) return
  if (cohort.status === "archived") {
    throw new Error("Archived cohorts cannot be changed.")
  }
  if (status === "active" && cohort.status !== "draft") {
    throw new Error("Only draft cohorts can be activated.")
  }
  if (status === "active" && !cohort.programId) {
    throw new Error("Assign a program before activating this cohort.")
  }

  await updateDoc(doc(database, "cohorts", cohort.id), {
    status,
    archivedAt: status === "archived" ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
    updatedByUid: user.uid,
    updatedByEmail: user.email,
  })
}

export async function saveCohortExperience(
  cohort: CohortRecord,
  input: CohortExperienceInput,
  user: User,
) {
  const database = requireDatabase()
  if (cohort.status === "archived") {
    throw new Error("Archived cohorts cannot be changed.")
  }

  const coachName = input.coachName.trim()
  const coachTitle = input.coachTitle.trim()
  const coachAvatarUrl = input.coachAvatarUrl.trim()
  const revealWeek = Math.trunc(input.leaderboardRevealWeek)

  if (coachName.length < 2 || coachName.length > 80) {
    throw new Error("Coach name must be between 2 and 80 characters.")
  }
  if (coachTitle.length < 2 || coachTitle.length > 80) {
    throw new Error("Coach title must be between 2 and 80 characters.")
  }
  if (coachAvatarUrl && !/^https:\/\//i.test(coachAvatarUrl)) {
    throw new Error("Coach avatar must use an HTTPS URL.")
  }
  if (!Number.isFinite(revealWeek) || revealWeek < 1 || revealWeek > cohort.durationWeeks) {
    throw new Error(`Leaderboard reveal week must be between 1 and ${cohort.durationWeeks}.`)
  }

  await updateDoc(doc(database, "cohorts", cohort.id), {
    coach: {
      uid: cohort.coach?.uid || user.uid,
      name: coachName,
      title: coachTitle,
      avatarUrl: coachAvatarUrl,
    },
    leaderboardVisible: input.leaderboardVisible,
    leaderboardRevealWeek: revealWeek,
    updatedAt: serverTimestamp(),
    updatedByUid: user.uid,
    updatedByEmail: user.email,
  })
}
