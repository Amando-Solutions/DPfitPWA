// One-off import that seeds the shared exercise library.
//
//   npm run exercise-library:seed -- --project <id> [--database (default)|staging] [--apply]
//
// Dry run by default: prints what it would create and link, writes nothing.
// With --apply it:
//   1. creates a library entry (plus its exerciseLibraryNames reservation) for every
//      built-in exercise and every exercise name already used in any program,
//      carrying over the first https video link found on those placements;
//   2. stamps `exerciseId` onto every existing placement whose name matches.
// Idempotent: existing library entries are reused and never overwritten.
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app"
import { FieldValue, getFirestore } from "firebase-admin/firestore"
import { mkdir, writeFile } from "node:fs/promises"

function readArgument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const projectId = readArgument("--project")
const databaseId = readArgument("--database") ?? "(default)"
const apply = process.argv.includes("--apply")

if (!projectId || !["(default)", "staging"].includes(databaseId)) {
  console.error("Usage: npm run exercise-library:seed -- --project <id> [--database (default)|staging] [--apply]")
  process.exit(1)
}

const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId })
const database = databaseId === "(default)" ? getFirestore(app) : getFirestore(app, databaseId)

const exerciseTypes = new Set([
  "weight-reps", "bodyweight-reps", "weighted-bodyweight", "assisted-bodyweight",
  "duration", "weight-duration", "distance-duration", "weight-distance",
])

// Formerly hardcoded in src/lib/exercise-types.ts.
const builtIn = [

  ["Back Squat", "Quads", "weight-reps"], ["Leg Press", "Quads", "weight-reps"],
  ["Walking Lunge", "Quads", "weight-reps"], ["Leg Extension", "Quads", "weight-reps"],
  ["Standing Calf Raise", "Calves", "weight-reps"], ["Barbell Bench Press", "Chest", "weight-reps"],
  ["Overhead Press", "Shoulders", "weight-reps"], ["Incline DB Press", "Chest", "weight-reps"],
  ["Lateral Raise", "Shoulders", "weight-reps"], ["Triceps Rope Pushdown", "Triceps", "weight-reps"],
  ["Deadlift", "Posterior Chain", "weight-reps"], ["Romanian Deadlift", "Hamstrings", "weight-reps"],
  ["Hip Thrust", "Glutes", "weight-reps"], ["Seated Leg Curl", "Hamstrings", "weight-reps"],
  ["Weighted Pull-Up", "Back", "weighted-bodyweight"], ["Lat Pulldown", "Back", "weight-reps"],
  ["Assisted Pull-Up", "Back", "assisted-bodyweight"], ["Barbell Row", "Back", "weight-reps"],
  ["Seated Cable Row", "Back", "weight-reps"], ["Face Pull", "Shoulders", "weight-reps"],
  ["Barbell Curl", "Biceps", "weight-reps"], ["Hanging Knee Raise", "Core", "bodyweight-reps"],
  ["Plank", "Core", "duration"], ["Cable Woodchop", "Core", "weight-reps"],
  ["Dead Bug", "Core", "bodyweight-reps"], ["Zone 2 Cardio", "Cardio", "distance-duration"],
  ["Push-Up", "Chest", "bodyweight-reps"], ["Pull-Up", "Back", "bodyweight-reps"],
  ["Weighted Dip", "Triceps", "weighted-bodyweight"], ["Assisted Dip", "Triceps", "assisted-bodyweight"],
  ["Farmer Carry", "Full Body", "weight-distance"], ["Weighted Plank", "Core", "weight-duration"],
  ["Running", "Cardio", "distance-duration"], ["Cycling", "Cardio", "distance-duration"],
  ["Rowing", "Cardio", "distance-duration"], ["Side Plank", "Core", "duration"],
]

const normalize = (name) => String(name ?? "").trim().replace(/\s+/g, " ")
const keyOf = (name) => normalize(name).toLowerCase()
const httpsVideo = (url) => typeof url === "string" && /^https:\/\/\S+$/.test(url) && url.length <= 2048 ? url : null

function guessType(exercise) {
  if (exerciseTypes.has(exercise.exerciseType)) return exercise.exerciseType
  const group = String(exercise.muscleGroup ?? "").toLowerCase()
  if (group === "cardio") return "distance-duration"
  if (group === "core") return "bodyweight-reps"
  return "weight-reps"
}

// --- 1. Existing library ----------------------------------------------------
const existing = new Map() // key -> { id, videoUrl }
for (const entry of (await database.collection("exerciseLibrary").get()).docs) {
  existing.set(String(entry.data().nameKey), { id: entry.id, videoUrl: entry.data().videoUrl ?? null })
}

// --- 2. Candidates: built-ins, then every placement in every program ---------
const candidates = new Map() // key -> { name, defaultType, muscleGroup, videoUrl, sources }
function offer(name, defaultType, muscleGroup, videoUrl, source) {
  const clean = normalize(name)
  if (clean.length < 2 || clean.length > 80) return
  const key = clean.toLowerCase()
  const current = candidates.get(key)
  if (!current) {
    candidates.set(key, { name: clean, defaultType, muscleGroup: String(muscleGroup ?? "").trim().slice(0, 40), videoUrl: httpsVideo(videoUrl), sources: new Set([source]) })
    return
  }
  current.sources.add(source)
  current.videoUrl ??= httpsVideo(videoUrl)
  if (!current.muscleGroup && muscleGroup) current.muscleGroup = String(muscleGroup).trim().slice(0, 40)
}
for (const [name, muscleGroup, type] of builtIn) offer(name, type, muscleGroup, null, "built-in")

const placementDocs = [] // { ref, shape, data }
for (const program of (await database.collection("programs").get()).docs) {
  const weeks = await program.ref.collection("weeks").get()
  for (const week of weeks.docs) {
    if (Array.isArray(week.data().days)) placementDocs.push({ ref: week.ref, shape: "week", data: week.data() })
    for (const day of (await week.ref.collection("days").get()).docs) placementDocs.push({ ref: day.ref, shape: "day", data: day.data() })
  }
  for (const day of (await program.ref.collection("workoutDays").get()).docs) placementDocs.push({ ref: day.ref, shape: "day", data: day.data() })
}

const exercisesIn = (placement) => placement.shape === "week"
  ? placement.data.days.flatMap((day) => Array.isArray(day?.exercises) ? day.exercises : [])
  : Array.isArray(placement.data.exercises) ? placement.data.exercises : []

for (const placement of placementDocs) {
  for (const exercise of exercisesIn(placement)) {
    if (exercise && typeof exercise === "object") offer(exercise.name, guessType(exercise), exercise.muscleGroup, exercise.videoUrl, placement.ref.path.split("/")[1])
  }
}

// --- 3. Plan ------------------------------------------------------------------
const toCreate = [...candidates.entries()].filter(([key]) => !existing.has(key))
const ids = new Map([...existing].map(([key, value]) => [key, value.id]))
for (const [key] of toCreate) ids.set(key, database.collection("exerciseLibrary").doc().id)

const links = [] // { ref, update, count }
for (const placement of placementDocs) {
  let count = 0
  const link = (exercise) => {
    if (!exercise || typeof exercise !== "object" || exercise.exerciseId) return exercise
    const id = ids.get(keyOf(exercise.name))
    if (!id) return exercise
    count++
    return { ...exercise, exerciseId: id }
  }
  const update = placement.shape === "week"
    ? { days: placement.data.days.map((day) => ({ ...day, exercises: Array.isArray(day?.exercises) ? day.exercises.map(link) : day?.exercises })) }
    : { exercises: Array.isArray(placement.data.exercises) ? placement.data.exercises.map(link) : placement.data.exercises }
  if (count) links.push({ ref: placement.ref, update, count })
}

console.log(`Database: ${databaseId}${apply ? "" : "  (dry run: nothing is written)"}`)
console.log(`Library entries: ${existing.size} existing, ${toCreate.length} to create`)
for (const [, entry] of toCreate) {
  console.log(`  + ${entry.name.padEnd(36)} ${entry.defaultType.padEnd(20)} ${entry.videoUrl ? "video" : "     "}  ${[...entry.sources].join(", ")}`)
}
console.log(`Videos carried over: ${toCreate.filter(([, entry]) => entry.videoUrl).length}`)
console.log(`Placements to link: ${links.reduce((total, link) => total + link.count, 0)} across ${links.length} documents`)

if (!apply) process.exit(0)

// --- 4. Apply -----------------------------------------------------------------
// Back up every document this run modifies, so linking can be reverted exactly.
await mkdir("backups", { recursive: true })
const backupFile = `backups/exercise-library-seed-${databaseId.replace(/[()]/g, "")}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
await writeFile(backupFile, JSON.stringify(links.map((link) => {
  const placement = placementDocs.find((item) => item.ref.path === link.ref.path)
  return { path: link.ref.path, before: placement.shape === "week" ? { days: placement.data.days } : { exercises: placement.data.exercises } }
}), null, 2))
console.log(`Backup of ${links.length} documents written to ${backupFile}`)

const audit = { updatedAt: FieldValue.serverTimestamp(), updatedByUid: "seed-exercise-library", updatedByEmail: null }
const failures = []
const writer = database.bulkWriter()
writer.onWriteError((error) => {
  if (error.failedAttempts < 3) return true
  failures.push(`${error.documentRef.path}: ${error.message}`)
  return false
})
for (const [key, entry] of toCreate) {
  const id = ids.get(key)
  writer.create(database.doc(`exerciseLibrary/${id}`), {
    name: entry.name, nameKey: key, defaultType: entry.defaultType, videoUrl: entry.videoUrl,
    muscleGroup: entry.muscleGroup, archived: false, createdAt: FieldValue.serverTimestamp(), ...audit,
  })
  writer.create(database.doc(`exerciseLibraryNames/${key}`), { exerciseId: id })
}
for (const link of links) writer.update(link.ref, link.update)
await writer.close()
if (failures.length) {
  console.error(`${failures.length} writes failed:`)
  for (const failure of failures) console.error(`  ${failure}`)
  process.exit(1)
}
console.log("Done.")
