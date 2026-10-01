import type { User } from "firebase/auth"
import {
  collection,
  doc,
  getDocs,
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
import { httpsCallable } from "firebase/functions"

import { firebaseDatabaseId, firebaseDb, firebaseFunctions } from "@/lib/firebase"
import { features } from "@/lib/features"
import { exerciseTypeOf, sectionOf, type ExerciseType, type ExerciseSection } from "@/lib/exercise-types"

export type ProgramStatus = "draft" | "published" | "archived"

export type ProgramWeekTheme = {
  weekNumber: number
  title: string
  subtitle: string
}

export type ProgramRewardConfig = {
  values: {
    workout: number
    checkIn: number
    progressPhoto: number
    core: number
    cardio: number
  }
  badgeTierPoints: {
    starter: number
    consistency: number
    elite: number
  }
  badgeTargets: {
    dayRepeats: number
    checkInWeeks: number
    foundationWeek: number
    foundationSessions: number
    peakWeek: number
    peakSessions: number
  }
  ranks: Array<{
    id: string
    name: string
    emoji: string
    minPoints: number
  }>
  badges: Array<{
    id: string
    name: string
    emoji: string
    description: string
    tier: "starter" | "consistency" | "elite"
  }>
}

export type ProgramRecord = {
  scheduleRevision: number
  id: string
  familyId: string
  sourceProgramId: string | null
  name: string
  version: number
  status: ProgramStatus
  totalWeeks: number
  totalDays: number
  sessionsPerWeek: number
  workoutDayCount: number
  guideCount: number
  weekThemes: ProgramWeekTheme[]
  weekThemesConfigured: boolean
  rewards: ProgramRewardConfig
  rewardsConfigured: boolean
  publishedAt: Date | null
}

export type StoredImage = {
  storagePath: string
  downloadUrl: string
  width: number
  height: number
  bytes: number
}

export type ProgramExercise = {
  // Library link plus copies of its name/video, kept in sync by exercise-library.ts.
  exerciseId?: string | null
  videoUrl?: string | null
  videoThumbUrl?: string | null
  exerciseType?: ExerciseType
  section?: ExerciseSection
  targetValue?: string
  targetSecondary?: string
  id: string
  name: string
  muscleGroup: string
  targetSets: number
  targetReps: string
  restSeconds: number
  cues: string[]
  sets: Array<{ reps: number; weightKg: number | null; durationSeconds?: number; distanceMeters?: number }>
}

export type ProgramWorkoutDay = {
  coreEnabled?: boolean
  cardioEnabled?: boolean
  id: string
  dayNumber: number
  label: string
  focus: string
  estimatedMinutes: number
  estimatedKcal: number
  proofRequired: boolean
  optional: boolean
  heroImage: StoredImage | null
  exercises: ProgramExercise[]
}

export type ProgramGuide = {
  id: string
  title: string
  category: string
  readMinutes: number
  unlockWeek: number
  excerpt: string
  body: string
}

export type CreateProgramInput = {
  name: string
  totalWeeks: number
  sessionsPerWeek: number
  user: User
}

export type WorkoutExerciseInput = {
  id?: string
  name: string
  muscleGroup: string
  targetSets: number
  targetReps: string
  restSeconds: number
  cues: string
  defaultWeightKg: number | null
}

export type WorkoutDayInput = {
  id?: string
  dayNumber: number
  label: string
  focus: string
  estimatedMinutes: number
  estimatedKcal: number
  proofRequired: boolean
  optional: boolean
  exercises: WorkoutExerciseInput[]
}

export type ProgramGuideInput = Omit<ProgramGuide, "id"> & { id?: string }

const EMPTY_REWARDS: ProgramRewardConfig = {
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
}

function requireDatabase() {
  if (!firebaseDb) throw new Error("Programs are not configured.")
  return firebaseDb
}

function requireDraft(program: ProgramRecord) {
  if (program.status !== "draft") {
    throw new Error("Published programs cannot be changed.")
  }
}

function safeInteger(value: number, minimum: number, maximum: number, label: string) {
  const safeValue = Math.trunc(value)
  if (!Number.isFinite(safeValue) || safeValue < minimum || safeValue > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}.`)
  }
  return safeValue
}

function readNullableDate(value: unknown) {
  return value instanceof Timestamp ? value.toDate() : null
}

function readStoredImage(value: unknown): StoredImage | null {
  if (!value || typeof value !== "object") return null
  const image = value as Record<string, unknown>
  const storagePath = String(image.storagePath ?? "")
  const downloadUrl = String(image.downloadUrl ?? "")
  const width = Number(image.width ?? 0)
  const height = Number(image.height ?? 0)
  const bytes = Number(image.bytes ?? 0)
  if (!storagePath || !downloadUrl || width < 1 || height < 1 || bytes < 1) return null
  return { storagePath, downloadUrl, width, height, bytes }
}

function readWeekThemes(value: unknown): ProgramWeekTheme[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    const theme = item && typeof item === "object" ? item as Record<string, unknown> : {}
    return {
      weekNumber: Number(theme.weekNumber ?? 0),
      title: String(theme.title ?? ""),
      subtitle: String(theme.subtitle ?? ""),
    }
  })
}

function readRewardConfig(value: unknown): ProgramRewardConfig {
  const rewards = value && typeof value === "object" ? value as Record<string, unknown> : {}
  const values = rewards.values && typeof rewards.values === "object"
    ? rewards.values as Record<string, unknown> : {}
  const tierPoints = rewards.badgeTierPoints && typeof rewards.badgeTierPoints === "object"
    ? rewards.badgeTierPoints as Record<string, unknown> : {}
  const targets = rewards.badgeTargets && typeof rewards.badgeTargets === "object"
    ? rewards.badgeTargets as Record<string, unknown> : {}

  return {
    values: {
      workout: Number(values.workout ?? 0),
      checkIn: Number(values.checkIn ?? 0),
      progressPhoto: Number(values.progressPhoto ?? 0),
      core: Number(values.core ?? 0),
      cardio: Number(values.cardio ?? 0),
    },
    badgeTierPoints: {
      starter: Number(tierPoints.starter ?? 0),
      consistency: Number(tierPoints.consistency ?? 0),
      elite: Number(tierPoints.elite ?? 0),
    },
    badgeTargets: {
      dayRepeats: Number(targets.dayRepeats ?? 0),
      checkInWeeks: Number(targets.checkInWeeks ?? 0),
      foundationWeek: Number(targets.foundationWeek ?? 0),
      foundationSessions: Number(targets.foundationSessions ?? 0),
      peakWeek: Number(targets.peakWeek ?? 0),
      peakSessions: Number(targets.peakSessions ?? 0),
    },
    ranks: Array.isArray(rewards.ranks)
      ? rewards.ranks.map((rank) => {
          const item = rank && typeof rank === "object" ? rank as Record<string, unknown> : {}
          return {
            id: String(item.id ?? ""),
            name: String(item.name ?? ""),
            emoji: String(item.emoji ?? ""),
            minPoints: Number(item.minPoints ?? 0),
          }
        })
      : [],
    badges: Array.isArray(rewards.badges)
      ? rewards.badges.map((badge) => {
          const item = badge && typeof badge === "object" ? badge as Record<string, unknown> : {}
          return {
            id: String(item.id ?? ""),
            name: String(item.name ?? ""),
            emoji: String(item.emoji ?? ""),
            description: String(item.description ?? ""),
            tier: (item.tier ?? "starter") as "starter" | "consistency" | "elite",
          }
        })
      : [],
  }
}

function readProgram(id: string, data: Record<string, unknown>): ProgramRecord {
  return {
    scheduleRevision: Number(data.scheduleRevision ?? 0),
    id,
    familyId: String(data.familyId ?? id.replace(/-v\d+$/i, "")),
    sourceProgramId: typeof data.sourceProgramId === "string" ? data.sourceProgramId : null,
    name: String(data.name ?? "Unnamed program"),
    version: Number(data.version ?? 1),
    status: (data.status ?? "draft") as ProgramStatus,
    totalWeeks: Number(data.totalWeeks ?? 0),
    totalDays: Number(data.totalDays ?? 0),
    sessionsPerWeek: Number(data.sessionsPerWeek ?? 0),
    workoutDayCount: Number(data.workoutDayCount ?? 0),
    guideCount: Number(data.guideCount ?? 0),
    weekThemes: readWeekThemes(data.weekThemes),
    weekThemesConfigured: data.weekThemesConfigured === true || data.status === "published",
    rewards: readRewardConfig(data.rewards),
    rewardsConfigured: data.rewardsConfigured === true || data.status === "published",
    publishedAt: readNullableDate(data.publishedAt),
  }
}

export function readExercises(value: unknown): ProgramExercise[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    const exercise = item && typeof item === "object" ? item as Record<string, unknown> : {}
    return {
      exerciseId: typeof exercise.exerciseId === "string" ? exercise.exerciseId : null,
      videoUrl: typeof exercise.videoUrl === "string" ? exercise.videoUrl : null,
      videoThumbUrl: typeof exercise.videoThumbUrl === "string" ? exercise.videoThumbUrl : null,
      exerciseType: exerciseTypeOf(exercise.exerciseType),
      section: sectionOf({ section: String(exercise.section ?? ""), muscleGroup: String(exercise.muscleGroup ?? "") }),
      targetValue: String(exercise.targetValue ?? ""),
      targetSecondary: String(exercise.targetSecondary ?? exercise.targetReps ?? ""),
      id: String(exercise.id ?? ""),
      name: String(exercise.name ?? "Exercise"),
      muscleGroup: String(exercise.muscleGroup ?? ""),
      targetSets: Number(exercise.targetSets ?? 0),
      targetReps: String(exercise.targetReps ?? ""),
      restSeconds: Number(exercise.restSeconds ?? 0),
      cues: Array.isArray(exercise.cues) ? exercise.cues.map(String) : [],
      sets: Array.isArray(exercise.sets)
        ? exercise.sets.map((set) => {
            const entry = set && typeof set === "object" ? set as Record<string, unknown> : {}
            return {
              reps: Number(entry.reps ?? 0),
              weightKg: typeof entry.weightKg === "number" ? entry.weightKg : null,
              durationSeconds: Number(entry.durationSeconds ?? 0),
              distanceMeters: Number(entry.distanceMeters ?? 0),
            }
          })
        : [],
    }
  })
}

export function subscribeToPrograms(
  onData: (records: ProgramRecord[]) => void,
  onError: (message: string) => void,
): Unsubscribe {
  if (!firebaseDb) {
    const timeout = window.setTimeout(() => onError("Programs are not configured."), 0)
    return () => window.clearTimeout(timeout)
  }

  const programsQuery = query(
    collection(firebaseDb, "programs"),
    orderBy("publishedAt", "desc"),
    limit(100),
  )

  return onSnapshot(
    programsQuery,
    (snapshot) => onData(snapshot.docs.map((item) => readProgram(
      item.id,
      item.data({ serverTimestamps: "estimate" }),
    ))),
    () => onError("The program library could not be loaded."),
  )
}

export function subscribeToProgram(
  programId: string,
  onData: (record: ProgramRecord | null) => void,
  onError: (message: string) => void,
): Unsubscribe {
  if (!firebaseDb) {
    const timeout = window.setTimeout(() => onError("Programs are not configured."), 0)
    return () => window.clearTimeout(timeout)
  }

  return onSnapshot(
    doc(firebaseDb, "programs", programId),
    (snapshot) => onData(snapshot.exists()
      ? readProgram(snapshot.id, snapshot.data({ serverTimestamps: "estimate" }))
      : null),
    () => onError("This program could not be loaded."),
  )
}

export function subscribeToProgramWorkoutDays(
  programId: string,
  onData: (records: ProgramWorkoutDay[]) => void,
  onError: (message: string) => void,
): Unsubscribe {
  if (!firebaseDb) {
    const timeout = window.setTimeout(() => onError("Programs are not configured."), 0)
    return () => window.clearTimeout(timeout)
  }

  const daysQuery = query(
    collection(firebaseDb, "programs", programId, "workoutDays"),
    orderBy("dayNumber", "asc"),
  )

  return onSnapshot(
    daysQuery,
    (snapshot) => onData(snapshot.docs.map((item) => {
      const data = item.data()
      return {
        id: item.id,
        dayNumber: Number(data.dayNumber ?? 0),
        label: String(data.label ?? "Workout"),
        focus: String(data.focus ?? ""),
        estimatedMinutes: Number(data.estimatedMinutes ?? 0),
        estimatedKcal: Number(data.estimatedKcal ?? 0),
        proofRequired: data.proofRequired === true,
        optional: data.optional === true,
        heroImage: readStoredImage(data.heroImage),
        exercises: readExercises(data.exercises),
      } satisfies ProgramWorkoutDay
    })),
    () => onError("The workout schedule could not be loaded."),
  )
}

export function subscribeToProgramGuides(
  programId: string,
  onData: (records: ProgramGuide[]) => void,
  onError: (message: string) => void,
): Unsubscribe {
  if (!firebaseDb) {
    const timeout = window.setTimeout(() => onError("Guides are not configured."), 0)
    return () => window.clearTimeout(timeout)
  }

  return onSnapshot(
    collection(firebaseDb, "programs", programId, "guides"),
    (snapshot) => onData(snapshot.docs.map((item) => {
      const data = item.data()
      return {
        id: item.id,
        title: String(data.title ?? "Untitled guide"),
        category: String(data.category ?? "General"),
        readMinutes: Number(data.readMinutes ?? 0),
        unlockWeek: Number(data.unlockWeek ?? 1),
        excerpt: String(data.excerpt ?? ""),
        body: String(data.body ?? ""),
      } satisfies ProgramGuide
    }).sort((a, b) => a.unlockWeek - b.unlockWeek || a.title.localeCompare(b.title))),
    () => onError("The guide library could not be loaded."),
  )
}

export async function createProgram({
  name,
  totalWeeks,
  sessionsPerWeek,
  user,
}: CreateProgramInput) {
  const database = requireDatabase()
  const safeName = name.trim()
  const safeWeeks = safeInteger(totalWeeks, 1, 52, "Duration")
  const safeSessions = safeInteger(sessionsPerWeek, 1, 7, "Weekly sessions")

  if (safeName.length < 2 || safeName.length > 100) {
    throw new Error("Program name must be between 2 and 100 characters.")
  }

  const reference = doc(collection(database, "programs"))
  const weekThemes = Array.from({ length: safeWeeks }, (_, index) => ({
    weekNumber: index + 1,
    title: `Week ${index + 1}`,
    subtitle: "",
  }))

  const batch = writeBatch(database)
  batch.set(reference, {
    id: reference.id,
    familyId: reference.id,
    sourceProgramId: null,
    name: safeName,
    version: 1,
    status: "draft",
    totalWeeks: safeWeeks,
    totalDays: safeWeeks * 7,
    sessionsPerWeek: safeSessions,
    workoutDayCount: 0,
    guideCount: 0,
    weekThemes,
    weekThemesConfigured: false,
    rewards: EMPTY_REWARDS,
    // With the Rewards tab hidden there is nothing to configure, so it must not block publishing.
    rewardsConfigured: !features.programRewards,
    publishedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdByUid: user.uid,
    createdByEmail: user.email,
    updatedByUid: user.uid,
    updatedByEmail: user.email,
  })
  await batch.commit()

  return reference.id
}

export async function updateProgramDetails({
  program,
  name,
  totalWeeks,
  sessionsPerWeek,
  user,
}: {
  program: ProgramRecord
  name: string
  totalWeeks: number
  sessionsPerWeek: number
  user: User
}) {
  requireDraft(program)
  const database = requireDatabase()
  const safeName = name.trim()
  const safeWeeks = safeInteger(totalWeeks, 1, 52, "Duration")
  const safeSessions = safeInteger(sessionsPerWeek, 1, 7, "Weekly sessions")

  if (safeName.length < 2 || safeName.length > 100) {
    throw new Error("Program name must be between 2 and 100 characters.")
  }

  let updatedWeekThemes = [...program.weekThemes]
  if (safeWeeks > program.totalWeeks) {
    const additional = Array.from({ length: safeWeeks - program.totalWeeks }, (_, index) => ({
      weekNumber: program.totalWeeks + index + 1,
      title: `Week ${program.totalWeeks + index + 1}`,
      subtitle: "",
    }))
    updatedWeekThemes = [...updatedWeekThemes, ...additional]
  } else if (safeWeeks < program.totalWeeks) {
    updatedWeekThemes = updatedWeekThemes.slice(0, safeWeeks)
  }

  const batch = writeBatch(database)
  const reference = doc(database, "programs", program.id)

  batch.update(reference, {
    name: safeName,
    totalWeeks: safeWeeks,
    totalDays: safeWeeks * 7,
    sessionsPerWeek: safeSessions,
    weekThemes: updatedWeekThemes,
    updatedAt: serverTimestamp(),
    updatedByUid: user.uid,
    updatedByEmail: user.email,
  })

  await batch.commit()
}

type CloneProgramVersionResult = {
  programId: string
  version: number
}

export async function cloneProgramVersion(program: ProgramRecord) {
  if (program.status !== "published") {
    throw new Error("Only a published program can be versioned.")
  }
  if (!firebaseFunctions) throw new Error("Program versioning is not configured.")

  const callable = httpsCallable<
    { database: string; sourceProgramId: string },
    CloneProgramVersionResult
  >(firebaseFunctions, "cloneProgramVersion")
  const result = await callable({
    database: firebaseDatabaseId,
    sourceProgramId: program.id,
  })
  return result.data
}

export async function saveWorkoutHeroImage(
  program: ProgramRecord,
  workoutDayId: string,
  heroImage: StoredImage | null,
  user: User,
) {
  requireDraft(program)
  await updateDoc(doc(requireDatabase(), "programs", program.id, "workoutDays", workoutDayId), {
    heroImage,
    updatedAt: serverTimestamp(),
    updatedByUid: user.uid,
    updatedByEmail: user.email,
  })
}

export async function saveProgramWorkoutDay(
  program: ProgramRecord,
  input: WorkoutDayInput,
  user: User,
) {
  requireDraft(program)
  const database = requireDatabase()
  const safeLabel = input.label.trim()
  const safeFocus = input.focus.trim()
  const safeDayNumber = safeInteger(input.dayNumber, 1, 14, "Day number")
  const safeMinutes = safeInteger(input.estimatedMinutes, 1, 300, "Estimated minutes")
  const safeKcal = safeInteger(input.estimatedKcal, 0, 3000, "Estimated calories")

  if (safeLabel.length < 2 || safeLabel.length > 100) {
    throw new Error("Workout label must be between 2 and 100 characters.")
  }
  if (safeFocus.length < 2 || safeFocus.length > 80) {
    throw new Error("Workout focus must be between 2 and 80 characters.")
  }
  if (input.exercises.length < 1 || input.exercises.length > 20) {
    throw new Error("Add between 1 and 20 exercises.")
  }

  const exercises = input.exercises.map((exercise, index) => {
    const safeName = exercise.name.trim()
    const safeMuscleGroup = exercise.muscleGroup.trim()
    const safeTargetReps = exercise.targetReps.trim()
    const safeSets = safeInteger(exercise.targetSets, 1, 20, `Exercise ${index + 1} sets`)
    const safeRest = safeInteger(exercise.restSeconds, 0, 900, `Exercise ${index + 1} rest`)
    const safeWeight = exercise.defaultWeightKg == null
      ? null
      : Math.max(0, Math.round(exercise.defaultWeightKg * 10) / 10)

    if (safeName.length < 2 || safeName.length > 100) {
      throw new Error(`Exercise ${index + 1} needs a valid name.`)
    }
    if (safeMuscleGroup.length < 2 || safeMuscleGroup.length > 80) {
      throw new Error(`Exercise ${index + 1} needs a valid muscle group.`)
    }
    if (safeTargetReps.length < 1 || safeTargetReps.length > 40) {
      throw new Error(`Exercise ${index + 1} needs a rep target.`)
    }

    const startingReps = Number.parseInt(safeTargetReps.match(/\d+/)?.[0] ?? "0", 10)
    return {
      id: exercise.id || crypto.randomUUID(),
      name: safeName,
      muscleGroup: safeMuscleGroup,
      targetSets: safeSets,
      targetReps: safeTargetReps,
      restSeconds: safeRest,
      cues: exercise.cues
        .split("\n")
        .map((cue) => cue.trim())
        .filter(Boolean)
        .slice(0, 10),
      sets: Array.from({ length: safeSets }, () => ({
        reps: startingReps,
        weightKg: Number.isFinite(safeWeight) ? safeWeight : null,
      })),
    }
  })

  const isNew = !input.id
  const reference = input.id
    ? doc(database, "programs", program.id, "workoutDays", input.id)
    : doc(collection(database, "programs", program.id, "workoutDays"))
  const batch = writeBatch(database)
  batch.set(reference, {
    id: reference.id,
    dayNumber: safeDayNumber,
    label: safeLabel,
    focus: safeFocus,
    estimatedMinutes: safeMinutes,
    estimatedKcal: safeKcal,
    proofRequired: input.proofRequired,
    optional: input.optional,
    exercises,
    ...(isNew ? { createdAt: serverTimestamp(), heroImage: null } : {}),
    updatedAt: serverTimestamp(),
    updatedByUid: user.uid,
    updatedByEmail: user.email,
  }, { merge: !isNew })

  if (isNew) {
    batch.update(doc(database, "programs", program.id), {
      workoutDayCount: program.workoutDayCount + 1,
      updatedAt: serverTimestamp(),
      updatedByUid: user.uid,
      updatedByEmail: user.email,
    })
  }
  await batch.commit()

  return reference.id
}

export async function deleteProgramWorkoutDay(
  program: ProgramRecord,
  workoutDayId: string,
  user: User,
) {
  requireDraft(program)
  const database = requireDatabase()
  if (program.workoutDayCount < 1) throw new Error("This program has no workout days.")

  const batch = writeBatch(database)
  batch.delete(doc(database, "programs", program.id, "workoutDays", workoutDayId))
  batch.update(doc(database, "programs", program.id), {
    workoutDayCount: program.workoutDayCount - 1,
    updatedAt: serverTimestamp(),
    updatedByUid: user.uid,
    updatedByEmail: user.email,
  })
  await batch.commit()
}

export async function deleteProgramDraft(program: ProgramRecord) {
  requireDraft(program)
  const database = requireDatabase()
  const children = await Promise.all(["workoutDays", "weeks", "guides"].map((name) => getDocs(collection(database, "programs", program.id, name))))
  if (children.reduce((count, snapshot) => count + snapshot.size, 0) > 450) throw new Error("This draft is too large to delete in one operation.")
  const batch = writeBatch(database)
  for (const snapshot of children) for (const child of snapshot.docs) batch.delete(child.ref)
  batch.delete(doc(database, "programs", program.id))
  await batch.commit()
}

export async function publishProgram(program: ProgramRecord, user: User) {
  requireDraft(program)
  if (program.workoutDayCount < 1) {
    throw new Error("Add at least one workout day before publishing.")
  }
  if (!program.weekThemesConfigured) {
    throw new Error("Review and save the week themes before publishing.")
  }
  if (!program.rewardsConfigured) {
    throw new Error("Configure and save the reward economy before publishing.")
  }

  const database = requireDatabase()
  if (
    program.weekThemes.length !== program.totalWeeks ||
    program.weekThemes.some((theme, index) => theme.weekNumber !== index + 1 || !theme.title.trim())
  ) {
    throw new Error("Every program week needs a sequential, named theme.")
  }

  const [workoutDays, guides, weeks] = await Promise.all([
    getDocs(collection(database, "programs", program.id, "workoutDays")),
    getDocs(collection(database, "programs", program.id, "guides")),
    getDocs(collection(database, "programs", program.id, "weeks")),
  ])
  const { validateWeek } = await import("@/lib/program-week-model")
  for (let week = 1; week <= program.totalWeeks; week++) {
    const saved = weeks.docs.find((item) => item.data().weekNumber === week)?.data()
    const days = (saved?.days ?? workoutDays.docs.map((item) => ({ ...item.data(), id: item.id }))) as ProgramWorkoutDay[]
    if (!days.length) throw new Error(`Week ${week} has no training days.`)
    if (saved) validateWeek(days)
  }
  for (const guide of guides.docs) {
    const unlockWeek = Number(guide.data().unlockWeek ?? 0)
    if (!Number.isInteger(unlockWeek) || unlockWeek < 1 || unlockWeek > program.totalWeeks) {
      throw new Error(`Guide "${String(guide.data().title ?? guide.id)}" has an invalid unlock week.`)
    }
  }
  for (const workoutDay of workoutDays.docs) {
    const value = workoutDay.data().heroImage
    if (value == null) continue
    const image = readStoredImage(value)
    if (
      !image ||
      !image.storagePath.startsWith("programs/") ||
      !image.downloadUrl.startsWith("https://")
    ) {
      throw new Error(`Workout "${String(workoutDay.data().label ?? workoutDay.id)}" has an invalid hero image.`)
    }
  }

  const batch = writeBatch(database)
  batch.update(doc(database, "programs", program.id), {
    status: "published",
    publishedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedByUid: user.uid,
    updatedByEmail: user.email,
  })
  await batch.commit()
}

export async function saveProgramWeekThemes(
  program: ProgramRecord,
  themes: ProgramWeekTheme[],
  user: User,
) {
  requireDraft(program)
  if (themes.length !== program.totalWeeks) {
    throw new Error(`Add exactly ${program.totalWeeks} week themes.`)
  }

  const safeThemes = themes.map((theme, index) => {
    const title = theme.title.trim()
    const subtitle = theme.subtitle.trim()
    if (title.length < 2 || title.length > 80) {
      throw new Error(`Week ${index + 1} needs a title between 2 and 80 characters.`)
    }
    if (subtitle.length > 160) {
      throw new Error(`Week ${index + 1} description must be 160 characters or fewer.`)
    }
    return { weekNumber: index + 1, title, subtitle }
  })

  await updateDoc(doc(requireDatabase(), "programs", program.id), {
    weekThemes: safeThemes,
    weekThemesConfigured: true,
    updatedAt: serverTimestamp(),
    updatedByUid: user.uid,
    updatedByEmail: user.email,
  })
}

function safeRewardNumber(value: number, label: string, maximum = 100000) {
  return safeInteger(value, 0, maximum, label)
}

export async function saveProgramRewards(
  program: ProgramRecord,
  rewards: ProgramRewardConfig,
  user: User,
) {
  requireDraft(program)
  const safeRewards: ProgramRewardConfig = {
    values: {
      workout: safeRewardNumber(rewards.values.workout, "Workout points"),
      checkIn: safeRewardNumber(rewards.values.checkIn, "Check-in points"),
      progressPhoto: safeRewardNumber(rewards.values.progressPhoto, "Progress photo points"),
      core: safeRewardNumber(rewards.values.core, "Core points"),
      cardio: safeRewardNumber(rewards.values.cardio, "Cardio points"),
    },
    badgeTierPoints: {
      starter: safeRewardNumber(rewards.badgeTierPoints.starter, "Starter badge points"),
      consistency: safeRewardNumber(rewards.badgeTierPoints.consistency, "Consistency badge points"),
      elite: safeRewardNumber(rewards.badgeTierPoints.elite, "Elite badge points"),
    },
    badgeTargets: {
      dayRepeats: safeRewardNumber(rewards.badgeTargets.dayRepeats, "Day repeat target", 1000),
      checkInWeeks: safeRewardNumber(rewards.badgeTargets.checkInWeeks, "Check-in week target", 52),
      foundationWeek: safeRewardNumber(rewards.badgeTargets.foundationWeek, "Foundation week", 52),
      foundationSessions: safeRewardNumber(rewards.badgeTargets.foundationSessions, "Foundation sessions", 1000),
      peakWeek: safeRewardNumber(rewards.badgeTargets.peakWeek, "Peak week", 52),
      peakSessions: safeRewardNumber(rewards.badgeTargets.peakSessions, "Peak sessions", 1000),
    },
    ranks: rewards.ranks.map((rank, index) => ({
      id: rank.id.trim() || `rank-${index + 1}`,
      name: rank.name.trim(),
      emoji: rank.emoji.trim(),
      minPoints: safeRewardNumber(rank.minPoints, `Rank ${index + 1} points`),
    })).sort((a, b) => a.minPoints - b.minPoints),
    badges: rewards.badges.map((badge) => ({
      id: badge.id.trim(),
      name: badge.name.trim(),
      emoji: badge.emoji.trim(),
      description: badge.description.trim(),
      tier: badge.tier,
    })),
  }

  if (safeRewards.ranks.some((rank) => !rank.name || !rank.emoji)) {
    throw new Error("Every rank needs a name and emoji.")
  }
  if (safeRewards.badges.some((badge) => !badge.id || !badge.name || !badge.emoji)) {
    throw new Error("Every badge needs an ID, name, and emoji.")
  }
  if (new Set(safeRewards.ranks.map((rank) => rank.id)).size !== safeRewards.ranks.length) {
    throw new Error("Rank IDs must be unique.")
  }
  if (new Set(safeRewards.badges.map((badge) => badge.id)).size !== safeRewards.badges.length) {
    throw new Error("Badge rules can only be configured once.")
  }

  await updateDoc(doc(requireDatabase(), "programs", program.id), {
    rewards: safeRewards,
    rewardsConfigured: true,
    updatedAt: serverTimestamp(),
    updatedByUid: user.uid,
    updatedByEmail: user.email,
  })
}

export async function saveProgramGuide(
  program: ProgramRecord,
  input: ProgramGuideInput,
  user: User,
) {
  requireDraft(program)
  const title = input.title.trim()
  const category = input.category.trim()
  const excerpt = input.excerpt.trim()
  const body = input.body.trim()
  const readMinutes = safeInteger(input.readMinutes, 1, 120, "Read time")
  const unlockWeek = safeInteger(input.unlockWeek, 1, program.totalWeeks, "Unlock week")

  if (title.length < 2 || title.length > 100) throw new Error("Guide title must be between 2 and 100 characters.")
  if (category.length < 2 || category.length > 60) throw new Error("Guide category must be between 2 and 60 characters.")
  if (excerpt.length < 2 || excerpt.length > 240) throw new Error("Guide excerpt must be between 2 and 240 characters.")
  if (body.length < 2 || body.length > 20000) throw new Error("Guide body must be between 2 and 20,000 characters.")

  const database = requireDatabase()
  const isNew = !input.id
  const reference = input.id
    ? doc(database, "programs", program.id, "guides", input.id)
    : doc(collection(database, "programs", program.id, "guides"))
  const batch = writeBatch(database)
  batch.set(reference, {
    id: reference.id,
    title,
    category,
    excerpt,
    body,
    readMinutes,
    unlockWeek,
    ...(isNew ? { createdAt: serverTimestamp(), createdByUid: user.uid, createdByEmail: user.email } : {}),
    updatedAt: serverTimestamp(),
    updatedByUid: user.uid,
    updatedByEmail: user.email,
  }, { merge: !isNew })
  if (isNew) {
    batch.update(doc(database, "programs", program.id), {
      guideCount: program.guideCount + 1,
      updatedAt: serverTimestamp(),
      updatedByUid: user.uid,
      updatedByEmail: user.email,
    })
  }
  await batch.commit()
  return reference.id
}

export async function deleteProgramGuide(
  program: ProgramRecord,
  guideId: string,
  user: User,
) {
  requireDraft(program)
  const database = requireDatabase()
  const batch = writeBatch(database)
  batch.delete(doc(database, "programs", program.id, "guides", guideId))
  batch.update(doc(database, "programs", program.id), {
    guideCount: Math.max(0, program.guideCount - 1),
    updatedAt: serverTimestamp(),
    updatedByUid: user.uid,
    updatedByEmail: user.email,
  })
  await batch.commit()
}
