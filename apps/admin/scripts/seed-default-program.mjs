import { applicationDefault, getApps, initializeApp } from "firebase-admin/app"
import { FieldValue, getFirestore } from "firebase-admin/firestore"

import { program, programId, workoutDays } from "./program-v1-data.mjs"

function readArgument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const projectId = readArgument("--project")
const databaseId = readArgument("--database") ?? "(default)"
const cohortId = readArgument("--cohort") ?? "cohort-01"

if (!projectId || !["(default)", "staging"].includes(databaseId)) {
  console.error(
    "Usage: npm run program:seed-default -- --project <id> [--database (default)|staging] [--cohort cohort-01]",
  )
  process.exit(1)
}

const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId })
const database = databaseId === "(default)"
  ? getFirestore(app)
  : getFirestore(app, databaseId)
const programReference = database.collection("programs").doc(programId)
const cohortReference = database.collection("cohorts").doc(cohortId)
const dayReferences = workoutDays.map((day) => programReference.collection("workoutDays").doc(day.id))
const [programSnapshot, cohortSnapshot, ...daySnapshots] = await database.getAll(
  programReference,
  cohortReference,
  ...dayReferences,
)

if (!cohortSnapshot.exists) {
  throw new Error(`Cohort not found: ${cohortId}`)
}

const comparable = (value) => JSON.stringify(value)
const emptyRewards = {
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
const programDocument = {
  ...program,
  rewards: programSnapshot.data()?.rewards ?? emptyRewards,
}
const workoutDocuments = workoutDays.map((day, index) => ({
  ...day,
  heroImage: daySnapshots[index]?.data()?.heroImage ?? null,
}))
const hasProgramChanged =
  !programSnapshot.exists ||
  !programSnapshot.data()?.createdAt ||
  !programSnapshot.data()?.createdByUid ||
  !programSnapshot.data()?.updatedAt ||
  comparable(
    Object.fromEntries(
      Object.keys(programDocument).map((key) => [key, programSnapshot.data()?.[key]]),
    ),
  ) !== comparable(programDocument)
const changedDays = workoutDocuments.filter((day, index) => {
  const snapshot = daySnapshots[index]
  if (!snapshot.exists) return true
  if (!snapshot.data()?.createdAt || !snapshot.data()?.updatedAt) return true
  return comparable(Object.fromEntries(Object.keys(day).map((key) => [key, snapshot.data()?.[key]]))) !== comparable(day)
})
const cohortProgram = {
  programId,
  programName: program.name,
  programVersion: program.version,
}
const hasAssignmentChanged = comparable({
  programId: cohortSnapshot.data().programId ?? null,
  programName: cohortSnapshot.data().programName ?? null,
  programVersion: cohortSnapshot.data().programVersion ?? null,
}) !== comparable(cohortProgram)

const writeCount = Number(hasProgramChanged) + changedDays.length + Number(hasAssignmentChanged)
if (writeCount > 0) {
  const batch = database.batch()
  if (hasProgramChanged) {
    batch.set(programReference, {
      ...programDocument,
      createdAt: programSnapshot.exists
        ? programSnapshot.data().createdAt
        : FieldValue.serverTimestamp(),
      createdByUid: programSnapshot.data()?.createdByUid ?? "system:seed",
      createdByEmail: programSnapshot.data()?.createdByEmail ?? "dev@dayopius.com",
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUid: "system:seed",
      updatedByEmail: "dev@dayopius.com",
      publishedAt: programSnapshot.exists
        ? programSnapshot.data().publishedAt
        : FieldValue.serverTimestamp(),
    }, { merge: true })
  }
  for (const day of changedDays) {
    const index = workoutDocuments.findIndex((candidate) => candidate.id === day.id)
    const existing = daySnapshots[index]
    batch.set(programReference.collection("workoutDays").doc(day.id), {
      ...day,
      createdAt: existing?.data()?.createdAt ?? FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUid: "system:seed",
      updatedByEmail: "dev@dayopius.com",
    })
  }
  if (hasAssignmentChanged) {
    batch.update(cohortReference, {
      ...cohortProgram,
      updatedAt: FieldValue.serverTimestamp(),
    })
  }
  await batch.commit()
}

console.log(JSON.stringify({
  result: writeCount ? "seeded" : "already-seeded",
  database: databaseId,
  programId,
  cohortId,
  workoutDays: workoutDays.length,
  exercises: workoutDays.reduce((total, day) => total + day.exercises.length, 0),
  writes: writeCount,
}, null, 2))
