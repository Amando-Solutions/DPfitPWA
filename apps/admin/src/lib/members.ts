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
import type { User } from "firebase/auth"

import { firebaseDb } from "@/lib/firebase"

export type MemberStatus = "onboarding" | "active" | "paused" | "completed"

export type MemberProfile = {
  displayName: string
  whatsapp: string
  age: number | null
  sex: string
  heightCm: number | null
  weightKg: number | null
  startWeightKg: number | null
  activity: string
  goal: string
  trainingDaysPerWeek: number
  healthConditions: string
  avatarUrl: string
  // Compatibility aliases consumed by the current member detail UI.
  allergies: string
  injuries: string
  callSlot: string
  avatar: string
}

export type MemberRecord = {
  id: string
  email: string
  accessCode: string
  cohortId: string
  cohortName: string
  programId: string
  programVersion: number
  status: MemberStatus
  previousStatus: Exclude<MemberStatus, "paused"> | null
  pauseReason: string | null
  pausedAt: Date | null
  onboardingStep: string
  setupComplete: boolean
  isSample: boolean
  joinedAt: Date
  lastActiveAt: Date | null
  activitySummary: MemberActivitySummary
  stats: MemberStats
  profile: MemberProfile
}

export type MemberStats = {
  sessionsLogged: number
  sessionsQualified: number
  checkInsSubmitted: number
  photosUploaded: number
  points: number
  streakWeeks: number
  lastSessionAt: Date | null
}

export type MemberActivitySummary = {
  workoutsTotal: number
  workoutsThisWeek: number
  pendingProofCount: number
  latestCheckInAt: Date | null
  latestCheckInWeek: number | null
  latestCheckInReviewStatus: string | null
}

export type MemberWorkoutSummary = {
  id: string
  dayId: string
  dayNumber: number
  label: string
  weekNumber: number
  completedAt: Date
  durationSeconds: number
  volumeKg: number
  setsDone: number
  setsTotal: number
  qualifies: boolean
  rewardPoints: number
  exercises: MemberLoggedExercise[]
  note: string
  proofRequired: boolean
  proofStatus: string
  proofPhotoUrl: string
  reviewStatus: string
  reviewNote: string
  reviewedAt: Date | null
  reviewedByEmail: string
}

export type MemberLoggedSet = {
  reps: number
  weightKg: number
  done: boolean
  added: boolean
  setType: "warmup" | "normal" | "failure" | "drop"
}

export type MemberLoggedExercise = {
  id: string
  name: string
  muscleGroup: string
  restSeconds: number
  note: string
  setsPrescribed: number | null
  sets: MemberLoggedSet[]
}

export type MemberCheckInSummary = {
  id: string
  weekNumber: number
  submittedAt: Date
  workoutsDone: number
  nutritionPct: number
  energy: number | null
  trainingFeel: string
  pain: string
  note: string
  reviewStatus: string
  reviewNote: string
  reviewedAt: Date | null
  reviewedByEmail: string
}

export type MemberPhotoRecord = {
  id: string
  label: string
  url: string
  storagePath: string
  kind: string
  weekNumber: number | null
  createdAt: Date
  reviewStatus: string
}

export type MemberBadgeRecord = {
  id: string
  name: string
  emoji: string
  description: string
  tier: string
  points: number
  awardedAt: Date
}

export type MemberLifecycleEvent = {
  id: string
  type: string
  fromStatus: MemberStatus | null
  toStatus: MemberStatus
  reason: string
  createdAt: Date
  createdByEmail: string
}

export type MemberOperations = {
  sessions: MemberWorkoutSummary[]
  checkIns: MemberCheckInSummary[]
  photos: MemberPhotoRecord[]
  badges: MemberBadgeRecord[]
  lifecycleEvents: MemberLifecycleEvent[]
}

const MEMBER_LIMIT = 200
function readDate(value: unknown) {
  return value instanceof Timestamp ? value.toDate() : new Date(0)
}

function readNullableDate(value: unknown) {
  return value instanceof Timestamp ? value.toDate() : null
}

function readOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function readProfile(value: unknown): MemberProfile {
  const profile =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {}

  return {
    displayName:
      typeof profile.displayName === "string" && profile.displayName.trim()
        ? profile.displayName
        : "Unnamed member",
    age: typeof profile.age === "number" ? profile.age : null,
    sex: typeof profile.sex === "string" ? profile.sex : "",
    heightCm: typeof profile.heightCm === "number" ? profile.heightCm : null,
    weightKg: typeof profile.weightKg === "number" ? profile.weightKg : null,
    startWeightKg:
      typeof profile.startWeightKg === "number" ? profile.startWeightKg : null,
    activity: typeof profile.activity === "string" ? profile.activity : "",
    goal: typeof profile.goal === "string" ? profile.goal : "",
    trainingDaysPerWeek:
      typeof profile.trainingDaysPerWeek === "number"
        ? profile.trainingDaysPerWeek
        : 0,
    whatsapp: typeof profile.whatsapp === "string" ? profile.whatsapp : "",
    healthConditions:
      typeof profile.healthConditions === "string"
        ? profile.healthConditions
        : typeof profile.allergies === "string"
          ? profile.allergies
          : "",
    avatarUrl:
      typeof profile.avatarUrl === "string"
        ? profile.avatarUrl
        : typeof profile.avatar === "string"
          ? profile.avatar
          : "",
    allergies:
      typeof profile.healthConditions === "string"
        ? profile.healthConditions
        : typeof profile.allergies === "string"
          ? profile.allergies
          : "",
    injuries: typeof profile.injuries === "string" ? profile.injuries : "",
    callSlot: typeof profile.callSlot === "string" ? profile.callSlot : "",
    avatar:
      typeof profile.avatarUrl === "string"
        ? profile.avatarUrl
        : typeof profile.avatar === "string"
          ? profile.avatar
          : "",
  }
}

function readActivitySummary(value: unknown): MemberActivitySummary {
  const summary =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {}

  return {
    workoutsTotal:
      typeof summary.workoutsTotal === "number" ? summary.workoutsTotal : 0,
    workoutsThisWeek:
      typeof summary.workoutsThisWeek === "number"
        ? summary.workoutsThisWeek
        : 0,
    pendingProofCount:
      typeof summary.pendingProofCount === "number"
        ? summary.pendingProofCount
        : 0,
    latestCheckInAt: readNullableDate(summary.latestCheckInAt),
    latestCheckInWeek:
      typeof summary.latestCheckInWeek === "number"
        ? summary.latestCheckInWeek
        : null,
    latestCheckInReviewStatus:
      typeof summary.latestCheckInReviewStatus === "string"
        ? summary.latestCheckInReviewStatus
        : null,
  }
}

function readStats(value: unknown, activityValue: unknown): MemberStats {
  const stats =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  const activity =
    activityValue && typeof activityValue === "object"
      ? (activityValue as Record<string, unknown>)
      : {}

  return {
    sessionsLogged: Number(stats.sessionsLogged ?? activity.workoutsTotal ?? 0),
    sessionsQualified: Number(stats.sessionsQualified ?? 0),
    checkInsSubmitted: Number(stats.checkInsSubmitted ?? 0),
    photosUploaded: Number(stats.photosUploaded ?? 0),
    points: Number(stats.points ?? 0),
    streakWeeks: Number(stats.streakWeeks ?? 0),
    lastSessionAt: readNullableDate(stats.lastSessionAt ?? activity.lastSessionAt),
  }
}

function readLoggedExercises(value: unknown): MemberLoggedExercise[] {
  if (!Array.isArray(value)) return []

  return value.map((entry, exerciseIndex) => {
    const exercise =
      entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {}
    const rawSets = Array.isArray(exercise.sets) ? exercise.sets : []

    return {
      id: String(exercise.id ?? `exercise-${exerciseIndex + 1}`),
      name: String(exercise.name ?? `Exercise ${exerciseIndex + 1}`),
      muscleGroup: String(exercise.muscleGroup ?? ""),
      restSeconds: Number(exercise.restSeconds ?? 0),
      note: String(exercise.note ?? ""),
      setsPrescribed: readOptionalNumber(exercise.setsPrescribed),
      sets: rawSets.map((entry) => {
        const set =
          entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {}
        const setType = String(set.setType ?? "normal")
        return {
          reps: Number(set.reps ?? 0),
          weightKg: Number(set.weightKg ?? 0),
          done: set.done === true,
          added: set.added === true,
          setType:
            setType === "warmup" ||
            setType === "failure" ||
            setType === "drop"
              ? setType
              : "normal",
        }
      }),
    }
  })
}

function readMemberRecord(
  id: string,
  data: Record<string, unknown>,
): MemberRecord {
  return {
    id,
    email: String(data.email ?? ""),
    accessCode: String(data.accessCode ?? ""),
    cohortId: String(data.cohortId ?? ""),
    cohortName: String(data.cohortName ?? "Unassigned"),
    programId: String(data.programId ?? ""),
    programVersion: Number(data.programVersion ?? 1),
    status: (data.status ?? "onboarding") as MemberStatus,
    previousStatus:
      data.previousStatus === "active" ||
      data.previousStatus === "onboarding" ||
      data.previousStatus === "completed"
        ? data.previousStatus
        : null,
    pauseReason: typeof data.pauseReason === "string" ? data.pauseReason : null,
    pausedAt: readNullableDate(data.pausedAt),
    onboardingStep: String(data.onboardingStep ?? "about-you"),
    setupComplete:
      data.setupComplete === true ||
      data.status === "active" ||
      data.status === "completed",
    isSample: data.isSample === true,
    joinedAt: readDate(data.joinedAt),
    lastActiveAt: readNullableDate(data.lastActiveAt),
    stats: readStats(data.stats, data.activitySummary),
    activitySummary: readActivitySummary(
      data.activitySummary ??
        (data.stats && typeof data.stats === "object"
          ? {
              workoutsTotal: (data.stats as Record<string, unknown>).sessionsLogged,
            }
          : null),
    ),
    profile: readProfile(data.profile),
  }
}

export function subscribeToMembers(
  onData: (records: MemberRecord[]) => void,
  onError: (message: string) => void,
): Unsubscribe {
  if (!firebaseDb) {
    const timeout = window.setTimeout(
      () => onError("Members are not configured."),
      0,
    )
    return () => window.clearTimeout(timeout)
  }

  const membersQuery = query(
    collection(firebaseDb, "members"),
    orderBy("joinedAt", "desc"),
    limit(MEMBER_LIMIT),
  )

  return onSnapshot(
    membersQuery,
    (snapshot) => {
      onData(
        snapshot.docs.map((snapshotDocument) => {
          const data = snapshotDocument.data({ serverTimestamps: "estimate" })

          return readMemberRecord(snapshotDocument.id, data)
        }),
      )
    },
    () => onError("The member directory could not be loaded."),
  )
}

export function subscribeToMember(
  memberId: string,
  onData: (record: MemberRecord | null) => void,
  onError: (message: string) => void,
): Unsubscribe {
  if (!firebaseDb) {
    const timeout = window.setTimeout(
      () => onError("Members are not configured."),
      0,
    )
    return () => window.clearTimeout(timeout)
  }

  return onSnapshot(
    doc(firebaseDb, "members", memberId),
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(null)
        return
      }

      onData(
        readMemberRecord(
          snapshot.id,
          snapshot.data({ serverTimestamps: "estimate" }),
        ),
      )
    },
    () => onError("This member could not be loaded."),
  )
}

export function subscribeToMemberOperations(
  memberId: string,
  onData: (operations: MemberOperations) => void,
  onError: (message: string) => void,
): Unsubscribe {
  if (!firebaseDb) {
    const timeout = window.setTimeout(
      () => onError("Member activity is not configured."),
      0,
    )
    return () => window.clearTimeout(timeout)
  }

  let sessions: MemberWorkoutSummary[] = []
  let checkIns: MemberCheckInSummary[] = []
  let photos: MemberPhotoRecord[] = []
  let badges: MemberBadgeRecord[] = []
  let lifecycleEvents: MemberLifecycleEvent[] = []
  let workoutReady = false
  let checkInReady = false
  let photosReady = false
  let badgesReady = false
  let lifecycleReady = false
  const emitWhenReady = () => {
    if (
      workoutReady &&
      checkInReady &&
      photosReady &&
      badgesReady &&
      lifecycleReady
    ) {
      onData({ sessions, checkIns, photos, badges, lifecycleEvents })
    }
  }

  const workoutQuery = query(
    collection(firebaseDb, "members", memberId, "sessions"),
    orderBy("completedAt", "desc"),
    limit(30),
  )
  const checkInQuery = query(
    collection(firebaseDb, "members", memberId, "checkIns"),
    orderBy("submittedAt", "desc"),
    limit(20),
  )
  const photosQuery = query(
    collection(firebaseDb, "members", memberId, "photos"),
    limit(30),
  )
  const badgesQuery = query(
    collection(firebaseDb, "members", memberId, "badges"),
    limit(30),
  )
  const lifecycleQuery = query(
    collection(firebaseDb, "members", memberId, "lifecycleEvents"),
    orderBy("createdAt", "desc"),
    limit(30),
  )

  const unsubscribeWorkout = onSnapshot(
    workoutQuery,
    (snapshot) => {
      sessions = snapshot.docs.map((snapshotDocument) => {
        const data = snapshotDocument.data({ serverTimestamps: "estimate" })
        const proof =
          data.proof && typeof data.proof === "object"
            ? (data.proof as Record<string, unknown>)
            : null
        const proofPhoto =
          data.proofPhoto && typeof data.proofPhoto === "object"
            ? (data.proofPhoto as Record<string, unknown>)
            : null
        const hasProofPhoto =
          data.proofPhoto !== null &&
          data.proofPhoto !== undefined &&
          typeof data.proofPhoto === "object"
        return {
          id: snapshotDocument.id,
          dayId: String(data.dayId ?? ""),
          dayNumber: Number(data.dayNumber ?? 0),
          label: String(data.label ?? "Workout"),
          weekNumber: Number(data.weekNumber ?? 0),
          completedAt: readDate(data.completedAt),
          durationSeconds: Number(data.durationSeconds ?? 0),
          volumeKg: Number(data.volumeKg ?? 0),
          setsDone: Number(data.setsDone ?? 0),
          setsTotal: Number(data.setsTotal ?? 0),
          qualifies: data.qualifies === true,
          rewardPoints: Number(data.rewardPoints ?? 0),
          exercises: readLoggedExercises(data.exercises),
          note: String(data.note ?? ""),
          proofRequired: proof?.required === true || hasProofPhoto,
          proofStatus: proof
            ? String(proof.status ?? "not-required")
            : hasProofPhoto
              ? "submitted"
              : "not-submitted",
          proofPhotoUrl: String(
            proofPhoto?.downloadUrl ?? proofPhoto?.url ?? data.proofPhotoUrl ?? "",
          ),
          reviewStatus: String(data.reviewStatus ?? proof?.status ?? "unreviewed"),
          reviewNote: String(data.reviewNote ?? proof?.reviewNote ?? ""),
          reviewedAt: readNullableDate(data.reviewedAt ?? proof?.reviewedAt),
          reviewedByEmail: String(data.reviewedByEmail ?? proof?.reviewedByEmail ?? ""),
        }
      })
      workoutReady = true
      emitWhenReady()
    },
    () => onError("The member's workout summary could not be loaded."),
  )

  const unsubscribeCheckIn = onSnapshot(
    checkInQuery,
    (snapshot) => {
      checkIns = snapshot.docs.map((snapshotDocument) => {
        const data = snapshotDocument.data({ serverTimestamps: "estimate" })
        return {
          id: snapshotDocument.id,
          weekNumber: Number(data.weekNumber ?? 0),
          submittedAt: readDate(data.submittedAt),
          workoutsDone: Number(data.workoutsDone ?? 0),
          nutritionPct: Number(data.nutritionPct ?? 0),
          energy: typeof data.energy === "number" ? data.energy : null,
          trainingFeel: String(data.trainingFeel ?? ""),
          pain: String(data.pain ?? ""),
          note: String(data.note ?? ""),
          reviewStatus: String(data.reviewStatus ?? "unreviewed"),
          reviewNote: String(data.reviewNote ?? ""),
          reviewedAt: readNullableDate(data.reviewedAt),
          reviewedByEmail: String(data.reviewedByEmail ?? ""),
        }
      })
      checkInReady = true
      emitWhenReady()
    },
    () => onError("The member's latest check-in could not be loaded."),
  )

  const unsubscribePhotos = onSnapshot(
    photosQuery,
    (snapshot) => {
      photos = snapshot.docs.map((snapshotDocument) => {
        const data = snapshotDocument.data({ serverTimestamps: "estimate" })
        const image =
          data.image && typeof data.image === "object"
            ? (data.image as Record<string, unknown>)
            : null
        return {
          id: snapshotDocument.id,
          label: String(data.label ?? data.caption ?? data.pose ?? "Progress photo"),
          url: String(image?.downloadUrl ?? data.url ?? data.downloadUrl ?? ""),
          storagePath: String(
            image?.storagePath ?? data.storagePath ?? data.path ?? "",
          ),
          kind: String(data.kind ?? data.pose ?? "progress"),
          weekNumber: readOptionalNumber(data.weekNumber),
          createdAt: readDate(data.createdAt ?? data.takenAt),
          reviewStatus: String(data.reviewStatus ?? "unreviewed"),
        }
      }).sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      photosReady = true
      emitWhenReady()
    },
    () => onError("The member's progress photos could not be loaded."),
  )

  const unsubscribeBadges = onSnapshot(
    badgesQuery,
    (snapshot) => {
      badges = snapshot.docs.map((snapshotDocument) => {
        const data = snapshotDocument.data({ serverTimestamps: "estimate" })
        return {
          id: snapshotDocument.id,
          name: String(data.name ?? data.badgeId ?? snapshotDocument.id),
          emoji: String(data.emoji ?? ""),
          description: String(data.description ?? ""),
          tier: String(data.tier ?? ""),
          points: Number(data.points ?? data.rewardPoints ?? 0),
          awardedAt: readDate(data.awardedAt ?? data.earnedAt ?? data.createdAt),
        }
      }).sort((left, right) => right.awardedAt.getTime() - left.awardedAt.getTime())
      badgesReady = true
      emitWhenReady()
    },
    () => onError("The member's badges could not be loaded."),
  )

  const unsubscribeLifecycle = onSnapshot(
    lifecycleQuery,
    (snapshot) => {
      lifecycleEvents = snapshot.docs.map((snapshotDocument) => {
        const data = snapshotDocument.data({ serverTimestamps: "estimate" })
        return {
          id: snapshotDocument.id,
          type: String(data.type ?? "member.updated"),
          fromStatus:
            data.fromStatus === "onboarding" ||
            data.fromStatus === "active" ||
            data.fromStatus === "paused" ||
            data.fromStatus === "completed"
              ? data.fromStatus
              : null,
          toStatus: (data.toStatus ?? "active") as MemberStatus,
          reason: String(data.reason ?? ""),
          createdAt: readDate(data.createdAt),
          createdByEmail: String(data.createdByEmail ?? ""),
        }
      })
      lifecycleReady = true
      emitWhenReady()
    },
    () => onError("The member's lifecycle history could not be loaded."),
  )

  return () => {
    unsubscribeWorkout()
    unsubscribeCheckIn()
    unsubscribePhotos()
    unsubscribeBadges()
    unsubscribeLifecycle()
  }
}

export async function reviewMemberSession({
  memberId,
  sessionId,
  status,
  note,
  user,
}: {
  memberId: string
  sessionId: string
  status: string
  note: string
  user: User
}) {
  if (!firebaseDb) throw new Error("Firebase is not configured.")
  const safeStatus = status.trim()
  const safeNote = note.trim()
  if (!["approved", "needs-attention", "rejected"].includes(safeStatus)) {
    throw new Error("Choose a valid session review status.")
  }
  if (safeNote.length > 500) throw new Error("Review note is too long.")

  await updateDoc(doc(firebaseDb, "members", memberId, "sessions", sessionId), {
    reviewStatus: safeStatus,
    reviewNote: safeNote,
    reviewedAt: serverTimestamp(),
    reviewedByUid: user.uid,
    reviewedByEmail: user.email,
    updatedAt: serverTimestamp(),
    updatedByUid: user.uid,
    updatedByEmail: user.email,
  })
}

export async function reviewMemberCheckIn({
  memberId,
  checkInId,
  status,
  note,
  user,
}: {
  memberId: string
  checkInId: string
  status: string
  note: string
  user: User
}) {
  if (!firebaseDb) throw new Error("Firebase is not configured.")
  const safeStatus = status.trim()
  const safeNote = note.trim()
  if (!["reviewed", "needs-attention"].includes(safeStatus)) {
    throw new Error("Choose a valid check-in review status.")
  }
  if (safeNote.length > 500) throw new Error("Review note is too long.")

  await updateDoc(doc(firebaseDb, "members", memberId, "checkIns", checkInId), {
    reviewStatus: safeStatus,
    reviewNote: safeNote,
    reviewedAt: serverTimestamp(),
    reviewedByUid: user.uid,
    reviewedByEmail: user.email,
    updatedAt: serverTimestamp(),
    updatedByUid: user.uid,
    updatedByEmail: user.email,
  })
}

export async function setMemberPaused({
  member,
  reason,
  user,
}: {
  member: MemberRecord
  reason: string
  user: User
}) {
  if (!firebaseDb) throw new Error("Firebase is not configured.")
  if (member.status === "paused") throw new Error("Member is already paused.")

  const safeReason = reason.trim()
  if (safeReason.length < 3 || safeReason.length > 240) {
    throw new Error("Pause reason must be between 3 and 240 characters.")
  }

  const eventId = crypto.randomUUID()
  const batch = writeBatch(firebaseDb)
  batch.update(doc(firebaseDb, "members", member.id), {
    status: "paused",
    previousStatus: member.status,
    pauseReason: safeReason,
    pausedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedByUid: user.uid,
    updatedByEmail: user.email,
  })
  batch.set(doc(firebaseDb, "members", member.id, "lifecycleEvents", eventId), {
    memberId: member.id,
    type: "member.paused",
    fromStatus: member.status,
    toStatus: "paused",
    reason: safeReason,
    createdAt: serverTimestamp(),
    createdByUid: user.uid,
    createdByEmail: user.email,
  })
  await batch.commit()
}

export async function resumeMember(member: MemberRecord, user: User) {
  if (!firebaseDb) throw new Error("Firebase is not configured.")
  if (member.status !== "paused") throw new Error("Member is not paused.")

  const targetStatus = member.previousStatus ?? "active"
  const eventId = crypto.randomUUID()
  const batch = writeBatch(firebaseDb)
  batch.update(doc(firebaseDb, "members", member.id), {
    status: targetStatus,
    previousStatus: null,
    pauseReason: null,
    pausedAt: null,
    updatedAt: serverTimestamp(),
    updatedByUid: user.uid,
    updatedByEmail: user.email,
  })
  batch.set(doc(firebaseDb, "members", member.id, "lifecycleEvents", eventId), {
    memberId: member.id,
    type: "member.resumed",
    fromStatus: "paused",
    toStatus: targetStatus,
    reason: "Resumed by administrator",
    createdAt: serverTimestamp(),
    createdByUid: user.uid,
    createdByEmail: user.email,
  })
  await batch.commit()
}
