const sets = (count, reps, weightKg = null) =>
  Array.from({ length: count }, () => ({ reps, weightKg }))

const exercise = (
  id,
  name,
  muscleGroup,
  targetSets,
  targetReps,
  restSeconds,
  cues,
  reps,
  weightKg = null,
) => ({
  id,
  name,
  muscleGroup,
  targetSets,
  targetReps,
  restSeconds,
  cues,
  sets: sets(targetSets, reps, weightKg),
})

export const programId = "recomp-six-week-v1"

export const program = {
  id: programId,
  name: "6-Week Recomp Challenge",
  version: 1,
  status: "published",
  totalWeeks: 6,
  totalDays: 42,
  sessionsPerWeek: 4,
  qualifyingSetPercent: 80,
  workoutDayCount: 5,
  weekThemes: [
    { weekNumber: 1, title: "Foundation", subtitle: "Dial in form & baseline loads" },
    { weekNumber: 2, title: "Build", subtitle: "Add volume, own the tempo" },
    { weekNumber: 3, title: "Overload", subtitle: "Push intensity, prove the work" },
    { weekNumber: 4, title: "Peak", subtitle: "Heaviest loads of the block" },
    { weekNumber: 5, title: "Refine", subtitle: "Sharpen weak points" },
    { weekNumber: 6, title: "Prove It", subtitle: "Final push & photos" },
  ],
  sourceRepo: "Amando-Solutions/DPfitPWA",
  sourceCommit: "72eb6efe1637d58609f17c2d4bacd9a2408cfbdd",
}

export const workoutDays = [
  {
    id: "day-1",
    dayNumber: 1,
    label: "Lower (Quad Focus)",
    focus: "Lower",
    estimatedMinutes: 45,
    estimatedKcal: 160,
    proofRequired: true,
    optional: false,
    exercises: [
      exercise("ex-goblet-squat", "Goblet Squat", "Quads", 4, "8-10", 90, ["Heels planted, chest tall.", "Sit between the hips.", "Two-second descent."], 10, 16),
      exercise("ex-romanian-deadlift", "Romanian Deadlift", "Hamstrings", 4, "8-10", 90, ["Hinge, don’t squat.", "Bar stays close to the legs."], 10, 30),
      exercise("ex-split-squat", "Bulgarian Split Squat", "Glutes", 3, "10 each", 75, ["Front shin vertical.", "Drive through the whole foot."], 10, 10),
      exercise("ex-calf-raise", "Standing Calf Raise", "Calves", 3, "12-15", 45, ["Full stretch at the bottom.", "Pause at the top."], 15, 20),
    ],
  },
  {
    id: "day-2",
    dayNumber: 2,
    label: "Upper (Push Focus)",
    focus: "Upper · Push",
    estimatedMinutes: 40,
    estimatedKcal: 140,
    proofRequired: true,
    optional: false,
    exercises: [
      exercise("ex-incline-db-press", "Incline Dumbbell Press", "Chest", 4, "8-10", 90, ["Set the bench to ~30°.", "Elbows at 45°.", "Control the eccentric for 2 seconds."], 10, 14),
      exercise("ex-shoulder-press", "Seated Shoulder Press", "Shoulders", 3, "10-12", 75, ["Brace the core.", "Press just in front of the ears."], 12, 10),
      exercise("ex-cable-fly", "Cable Chest Fly", "Chest", 3, "12-15", 60, ["Soft elbows.", "Squeeze for a beat at the front."], 14, 7),
      exercise("ex-tricep-pushdown", "Triceps Rope Pushdown", "Triceps", 3, "12-15", 60, ["Pin the elbows.", "Spread the rope at the bottom."], 15, 20),
    ],
  },
  {
    id: "day-3",
    dayNumber: 3,
    label: "Lower (Posterior Focus)",
    focus: "Lower · Posterior",
    estimatedMinutes: 42,
    estimatedKcal: 150,
    proofRequired: true,
    optional: false,
    exercises: [
      exercise("ex-leg-press", "Leg Press", "Quads", 4, "10-12", 90, ["Feet mid-platform.", "Stop just short of lockout."], 12, 80),
      exercise("ex-hip-thrust", "Hip Thrust", "Glutes", 4, "10-12", 90, ["Ribs down.", "Squeeze hard at the top for a beat."], 12, 40),
      exercise("ex-leg-curl", "Seated Leg Curl", "Hamstrings", 3, "12-15", 60, ["Toes pulled up.", "Control the return."], 15, 25),
      exercise("ex-leg-extension", "Leg Extension", "Quads", 3, "12-15", 60, ["Pause at the top.", "No swinging."], 15, 30),
    ],
  },
  {
    id: "day-4",
    dayNumber: 4,
    label: "Upper (Pull Focus)",
    focus: "Upper · Pull",
    estimatedMinutes: 48,
    estimatedKcal: 175,
    proofRequired: true,
    optional: false,
    exercises: [
      exercise("ex-lat-pulldown", "Lat Pulldown", "Back", 4, "8-10", 90, ["Lead with the elbows.", "Chest to the bar, not the bar to the chest."], 10, 32),
      exercise("ex-seated-row", "Seated Cable Row", "Back", 4, "10-12", 75, ["Squeeze the shoulder blades.", "No torso swing."], 12, 30),
      exercise("ex-face-pull", "Face Pull", "Rear delts", 3, "12-15", 60, ["Pull to the forehead.", "External rotation at the end."], 15, 15),
      exercise("ex-db-curl", "Dumbbell Curl", "Biceps", 3, "10-12", 60, ["Elbows pinned to the ribs.", "Slow on the way down."], 12, 8),
    ],
  },
  {
    id: "core-cardio",
    dayNumber: 5,
    label: "Core & Cardio",
    focus: "Finisher",
    estimatedMinutes: 20,
    estimatedKcal: 90,
    proofRequired: false,
    optional: true,
    exercises: [
      exercise("ex-plank", "Weighted Plank", "Core", 3, "45s", 45, ["Glutes tight.", "Neutral neck."], 1),
      exercise("ex-dead-bug", "Dead Bug", "Core", 3, "10 each", 45, ["Low back stays flat.", "Exhale as you extend."], 10),
      exercise("ex-bike", "Assault Bike Intervals", "Cardio", 5, "30s on / 30s off", 30, ["Full effort on the work interval."], 1),
    ],
  },
]
