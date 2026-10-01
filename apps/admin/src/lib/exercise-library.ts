import type { User } from "firebase/auth"
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  writeBatch,
  type DocumentReference,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore"
import { firebaseDb } from "@/lib/firebase"
import { exerciseTypeOf, exerciseTypes, type ExerciseType } from "@/lib/exercise-types"

export type LibraryExercise = {
  id: string
  name: string
  nameKey: string
  defaultType: ExerciseType
  videoUrl: string | null
  muscleGroup: string
  archived: boolean
}

export type LibraryExerciseInput = {
  name: string
  defaultType: ExerciseType
  videoUrl: string
  muscleGroup: string
}

const LIBRARY = "exerciseLibrary"
// One doc per normalised name; Firestore can't enforce a unique field on its own.
const NAMES = "exerciseLibraryNames"
const MAX_BATCH_WRITES = 450

function requireDatabase() {
  if (!firebaseDb) throw new Error("The exercise library is not configured.")
  return firebaseDb
}

/** "  back   squat " -> "back squat" */
export function exerciseNameKey(name: string) {
  return normalizeName(name).toLowerCase()
}

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, " ")
}

function audit(user: User) {
  return { updatedAt: serverTimestamp(), updatedByUid: user.uid, updatedByEmail: user.email }
}

function readExercise(id: string, data: Record<string, unknown>): LibraryExercise {
  return {
    id,
    name: String(data.name ?? ""),
    nameKey: String(data.nameKey ?? ""),
    defaultType: exerciseTypeOf(data.defaultType),
    videoUrl: typeof data.videoUrl === "string" && data.videoUrl ? data.videoUrl : null,
    muscleGroup: String(data.muscleGroup ?? ""),
    archived: data.archived === true,
  }
}

export function subscribeToExerciseLibrary(onData: (records: LibraryExercise[]) => void, onError: (message: string) => void): Unsubscribe {
  if (!firebaseDb) { onError("The exercise library is not configured."); return () => {} }
  return onSnapshot(collection(firebaseDb, LIBRARY), (snapshot) => {
    onData(snapshot.docs.map((item) => readExercise(item.id, item.data())).sort((a, b) => a.name.localeCompare(b.name)))
  }, () => onError("The exercise library could not be loaded."))
}

function validate(input: LibraryExerciseInput) {
  const name = normalizeName(input.name)
  if (name.length < 2 || name.length > 80) throw new Error("Exercise names must be 2–80 characters.")
  if (!exerciseTypes.some((type) => type.value === input.defaultType)) throw new Error("Choose a default exercise type.")
  const videoUrl = input.videoUrl.trim()
  if (videoUrl && (!/^https:\/\/\S+$/.test(videoUrl) || videoUrl.length > 2048)) throw new Error("Video links must be a full https:// URL.")
  const muscleGroup = input.muscleGroup.trim()
  if (muscleGroup.length > 40) throw new Error("Muscle group must be 40 characters or fewer.")
  return { name, nameKey: name.toLowerCase(), defaultType: input.defaultType, videoUrl: videoUrl || null, muscleGroup }
}

export async function createLibraryExercise(input: LibraryExerciseInput, user: User): Promise<LibraryExercise> {
  const database = requireDatabase()
  const fields = validate(input)
  const reference = doc(collection(database, LIBRARY))
  await runTransaction(database, async (transaction) => {
    const nameReference = doc(database, NAMES, fields.nameKey)
    const taken = await transaction.get(nameReference)
    if (taken.exists()) {
      const existing = await transaction.get(doc(database, LIBRARY, String(taken.data().exerciseId)))
      throw new Error(existing.data()?.archived === true
        ? `"${fields.name}" is archived in the library. Restore it instead of adding it again.`
        : `"${fields.name}" is already in the library.`)
    }
    transaction.set(reference, { ...fields, archived: false, createdAt: serverTimestamp(), ...audit(user) })
    transaction.set(nameReference, { exerciseId: reference.id })
  })
  return { id: reference.id, ...fields, archived: false }
}

/**
 * Saves a library entry and pushes a changed name, video, or muscle group onto every
 * placement in every program. The default type is never pushed: placements own their type.
 */
export async function updateLibraryExercise(exercise: LibraryExercise, input: LibraryExerciseInput, user: User) {
  const database = requireDatabase()
  const fields = validate(input)
  await runTransaction(database, async (transaction) => {
    const reference = doc(database, LIBRARY, exercise.id)
    const current = await transaction.get(reference)
    if (!current.exists()) throw new Error("This exercise no longer exists.")
    const previousKey = String(current.data().nameKey)
    if (previousKey !== fields.nameKey) {
      const nameReference = doc(database, NAMES, fields.nameKey)
      const taken = await transaction.get(nameReference)
      if (taken.exists() && taken.data().exerciseId !== exercise.id) throw new Error(`"${fields.name}" is already in the library.`)
      transaction.delete(doc(database, NAMES, previousKey))
      transaction.set(nameReference, { exerciseId: exercise.id })
    }
    transaction.update(reference, { ...fields, ...audit(user) })
  })

  const changed = fields.name !== exercise.name || fields.videoUrl !== exercise.videoUrl || fields.muscleGroup !== exercise.muscleGroup
  if (!changed) return { placementsUpdated: 0 }
  const placementsUpdated = await syncPlacements(database, exercise, {
    exerciseId: exercise.id,
    name: fields.name,
    videoUrl: fields.videoUrl,
    ...(fields.muscleGroup ? { muscleGroup: fields.muscleGroup } : {}),
  }, user)
  return { placementsUpdated }
}

/** Archives an exercise programs still use (placements keep their copy); deletes it otherwise. */
export async function removeLibraryExercise(exercise: LibraryExercise, user: User): Promise<"archived" | "deleted"> {
  const database = requireDatabase()
  const placements = await findPlacements(database, exercise)
  if (placements.length > 0) {
    await setLibraryExerciseArchived(exercise, true, user)
    return "archived"
  }
  const batch = writeBatch(database)
  batch.delete(doc(database, LIBRARY, exercise.id))
  batch.delete(doc(database, NAMES, exercise.nameKey))
  await batch.commit()
  return "deleted"
}

export async function setLibraryExerciseArchived(exercise: LibraryExercise, archived: boolean, user: User) {
  const database = requireDatabase()
  const batch = writeBatch(database)
  batch.update(doc(database, LIBRARY, exercise.id), { archived, ...audit(user) })
  await batch.commit()
}

// --- Placements --------------------------------------------------------------

type Placement = {
  reference: DocumentReference
  programId: string
  programStatus: string
  scheduleRevision: number
  // A console week doc keeps its days inline; PWA and legacy day docs hold exercises directly.
  shape: "week" | "day"
  data: Record<string, unknown>
}

type ExerciseLike = { exerciseId?: unknown; name?: unknown }

// Placements saved before the library existed only carry a name, so match on that too.
function placementMatcher(exercise: LibraryExercise) {
  return (item: ExerciseLike) => item.exerciseId === exercise.id
    || ((item.exerciseId == null || item.exerciseId === "") && exerciseNameKey(String(item.name ?? "")) === exercise.nameKey)
}

function exercisesOf(value: unknown): ExerciseLike[] {
  return Array.isArray(value) ? value.filter((item): item is ExerciseLike => !!item && typeof item === "object") : []
}

async function findPlacements(database: Firestore, exercise: LibraryExercise) {
  const matches = placementMatcher(exercise)
  const programs = await getDocs(collection(database, "programs"))
  const found: Placement[] = []
  for (const program of programs.docs) {
    const status = String(program.data().status ?? "")
    // Archived programs are frozen by the rules; nothing there can be updated.
    if (status !== "draft" && status !== "published") continue
    const base = { programId: program.id, programStatus: status, scheduleRevision: Number(program.data().scheduleRevision ?? 0) }
    const [weeks, workoutDays] = await Promise.all([
      getDocs(collection(program.ref, "weeks")),
      getDocs(collection(program.ref, "workoutDays")),
    ])
    for (const week of weeks.docs) {
      const days = week.data().days
      if (Array.isArray(days) && days.some((day) => exercisesOf(day?.exercises).some(matches))) {
        found.push({ ...base, reference: week.ref, shape: "week", data: week.data() })
      }
      const nested = await getDocs(collection(week.ref, "days"))
      for (const day of nested.docs) {
        if (exercisesOf(day.data().exercises).some(matches)) found.push({ ...base, reference: day.ref, shape: "day", data: day.data() })
      }
    }
    for (const day of workoutDays.docs) {
      if (exercisesOf(day.data().exercises).some(matches)) found.push({ ...base, reference: day.ref, shape: "day", data: day.data() })
    }
  }
  return found
}

async function syncPlacements(database: Firestore, exercise: LibraryExercise, patch: Record<string, unknown>, user: User) {
  const matches = placementMatcher(exercise)
  const placements = await findPlacements(database, exercise)
  const patchExercises = (value: unknown) => exercisesOf(value).map((item) => matches(item) ? { ...item, ...patch } : item)

  let updated = 0
  const byProgram = new Map<string, Placement[]>()
  for (const placement of placements) byProgram.set(placement.programId, [...(byProgram.get(placement.programId) ?? []), placement])
  for (const group of byProgram.values()) {
    const { programId, scheduleRevision } = group[0]!
    for (let start = 0; start < group.length; start += MAX_BATCH_WRITES) {
      const batch = writeBatch(database)
      for (const placement of group.slice(start, start + MAX_BATCH_WRITES)) {
        if (placement.shape === "week") {
          const days = (placement.data.days as Array<Record<string, unknown>>).map((day) => ({ ...day, exercises: patchExercises(day.exercises) }))
          batch.update(placement.reference, { days, ...audit(user) })
        } else {
          batch.update(placement.reference, { exercises: patchExercises(placement.data.exercises), ...audit(user) })
        }
        updated += exercisesOf(placement.shape === "week"
          ? (placement.data.days as Array<Record<string, unknown>>).flatMap((day) => exercisesOf(day.exercises))
          : placement.data.exercises).filter(matches).length
      }
      // Bumping the revision makes an editor with unsaved changes reload instead of overwriting the sync.
      if (start === 0) batch.update(doc(database, "programs", programId), { scheduleRevision: scheduleRevision + 1, ...audit(user) })
      await batch.commit()
    }
  }
  return updated
}
