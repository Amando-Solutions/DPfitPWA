import { exerciseTypeFields, sectionOf } from "./exercise-types"
import type { ProgramExercise, ProgramWorkoutDay } from "./programs"

export type ProgramWeek = { weekNumber: number; days: ProgramWorkoutDay[] }

export function resolveWeek(weeks: ProgramWeek[], legacyDays: ProgramWorkoutDay[], weekNumber: number) {
  return weeks.find((week) => week.weekNumber === weekNumber)?.days ?? legacyDays
}

// Legacy days predate the section toggles; Firestore rejects undefined fields.
export function normalizeDay(day: ProgramWorkoutDay): ProgramWorkoutDay {
  return { ...day, coreEnabled: day.coreEnabled !== false, cardioEnabled: day.cardioEnabled !== false }
}

// Published programs can be edited live, but only when a week keeps the same days.
export function sameDayStructure(a: ProgramWorkoutDay[], b: ProgramWorkoutDay[]) {
  const key = (days: ProgramWorkoutDay[]) => days.map((day) => `${day.id}:${day.dayNumber}`).sort().join("|")
  return key(a) === key(b)
}

export function activeExercises(day: ProgramWorkoutDay) {
  return day.exercises.filter((exercise) => {
    const section = sectionOf(exercise)
    return section === "lifts" || (section === "core" ? day.coreEnabled !== false : day.cardioEnabled !== false)
  })
}

export function weekFingerprint(days: ProgramWorkoutDay[]) {
  return JSON.stringify(days.map((day) => ({
    dayNumber: day.dayNumber, label: day.label, focus: day.focus,
    estimatedMinutes: day.estimatedMinutes, estimatedKcal: day.estimatedKcal,
    proofRequired: day.proofRequired, optional: day.optional, heroImage: day.heroImage,
    coreEnabled: day.coreEnabled !== false, cardioEnabled: day.cardioEnabled !== false,
    exercises: day.exercises.map(({ id: _id, ...exercise }) => exercise),
  })))
}

export function matchingWeek(weeks: ProgramWeek[], legacy: ProgramWorkoutDay[], weekNumber: number) {
  const fingerprint = weekFingerprint(resolveWeek(weeks, legacy, weekNumber))
  for (let prior = 1; prior < weekNumber; prior++) {
    if (weekFingerprint(resolveWeek(weeks, legacy, prior)) === fingerprint) return prior
  }
  return null
}

function targetNumber(value: string, label: string, required: boolean) {
  if (!value.trim() && !required) return 0
  if (!/^\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?(?:\s*\/?\s*(?:each|leg|side))?$/.test(value.trim())) {
    throw new Error(`${label}: enter a number or range, such as 8-10.`)
  }
  const numbers = value.match(/\d+(?:\.\d+)?/g)!.map(Number)
  if (numbers.some((number) => !Number.isFinite(number) || number > 1_000_000) || (required && numbers[0]! <= 0) || (numbers.length > 1 && numbers[1]! < numbers[0]!)) {
    throw new Error(`${label}: enter a valid positive target.`)
  }
  return numbers[0]!
}

export function prepareExercise(exercise: ProgramExercise): ProgramExercise {
  const fields = exerciseTypeFields(exercise.exerciseType)
  if (!exercise.name.trim()) throw new Error("Select an exercise for every row.")
  if (!Number.isInteger(exercise.targetSets) || exercise.targetSets < 1 || exercise.targetSets > 20) throw new Error(`${exercise.name}: sets must be between 1 and 20.`)
  const primary = exercise.targetValue ?? ""
  const secondary = exercise.targetSecondary ?? exercise.targetReps
  const first = fields.firstKey ? targetNumber(primary, `${exercise.name} ${fields.first}`, false) : 0
  const second = targetNumber(secondary, `${exercise.name} ${fields.second}`, true)
  const set = { reps: 0, weightKg: null as number | null, durationSeconds: 0, distanceMeters: 0 }
  if (fields.firstKey) set[fields.firstKey] = first
  set[fields.secondKey] = second
  return { ...exercise, exerciseType: fields.value, section: sectionOf(exercise), targetValue: primary, targetSecondary: secondary, targetReps: secondary, sets: Array.from({ length: exercise.targetSets }, () => ({ ...set })) }
}

export function validateWeek(days: ProgramWorkoutDay[]) {
  if (days.length > 14) throw new Error("A week can contain at most 14 workout days.")
  const numbers = new Set<number>()
  const ids = new Set<string>()
  return days.map((day) => {
    if (!day.id || ids.has(day.id)) throw new Error("Workout day identifiers must be unique within a week.")
    ids.add(day.id)
    if (!Number.isInteger(day.dayNumber) || day.dayNumber < 1 || day.dayNumber > 14 || numbers.has(day.dayNumber)) throw new Error("Each workout needs a unique day number between 1 and 14.")
    numbers.add(day.dayNumber)
    if (!day.label.trim() || day.label.length > 100) throw new Error("Select a workout name for each day.")
    if (day.exercises.length > 20) throw new Error(`${day.label}: a workout can contain at most 20 exercises.`)
    const exercises = day.exercises.map(prepareExercise)
    if (activeExercises({ ...day, exercises }).length === 0) throw new Error(`${day.label}: add at least one enabled exercise.`)
    return normalizeDay({ ...day, exercises })
  }).sort((a, b) => a.dayNumber - b.dayNumber)
}
