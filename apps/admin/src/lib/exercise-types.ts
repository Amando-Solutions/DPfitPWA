export const exerciseTypes = [
  { value: "weight-reps", label: "Weight & Reps", first: "Weight (kg)", second: "Reps", firstKey: "weightKg", secondKey: "reps" },
  { value: "bodyweight-reps", label: "Bodyweight Reps", first: null, second: "Reps", firstKey: null, secondKey: "reps" },
  { value: "weighted-bodyweight", label: "Weighted Bodyweight", first: "Added weight (kg)", second: "Reps", firstKey: "weightKg", secondKey: "reps" },
  { value: "assisted-bodyweight", label: "Assisted Bodyweight", first: "Assistance (kg)", second: "Reps", firstKey: "weightKg", secondKey: "reps" },
  { value: "duration", label: "Duration", first: null, second: "Duration (sec)", firstKey: null, secondKey: "durationSeconds" },
  { value: "weight-duration", label: "Weight & Duration", first: "Weight (kg)", second: "Duration (sec)", firstKey: "weightKg", secondKey: "durationSeconds" },
  { value: "distance-duration", label: "Distance & Duration", first: "Distance (m)", second: "Duration (sec)", firstKey: "distanceMeters", secondKey: "durationSeconds" },
  { value: "weight-distance", label: "Weight & Distance", first: "Weight (kg)", second: "Distance (m)", firstKey: "weightKg", secondKey: "distanceMeters" },
] as const

export type ExerciseType = typeof exerciseTypes[number]["value"]
export type ExerciseSection = "lifts" | "core" | "cardio"

export function exerciseTypeOf(value: unknown): ExerciseType {
  return exerciseTypes.find((type) => type.value === value)?.value ?? "weight-reps"
}

export function exerciseTypeFields(value: unknown) {
  return exerciseTypes.find((type) => type.value === value) ?? exerciseTypes[0]
}

export function sectionOf(exercise: { section?: string; muscleGroup: string }): ExerciseSection {
  if (exercise.section === "core" || exercise.section === "cardio" || exercise.section === "lifts") return exercise.section
  const group = exercise.muscleGroup.toLowerCase()
  return group === "core" || group === "cardio" ? group : "lifts"
}

export const workoutNames = ["Lower (Quad Focus)", "Upper (Push Focus)", "Lower (Posterior Chain)", "Upper (Pull Focus)", "Full Body", "Core & Cardio", "Conditioning", "Mobility & Recovery"]
