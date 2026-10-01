import { applicationDefault, getApps, initializeApp } from "firebase-admin/app"
import { FieldValue, getFirestore } from "firebase-admin/firestore"

function argument(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const projectId = argument("project") ?? process.env.FIREBASE_PROJECT_ID
const databaseId = argument("database")
const apply = process.argv.includes("--apply")

if (!projectId || !["(default)", "staging"].includes(databaseId)) {
  console.error(
    "Usage: npm run program:backfill -- --project <id> --database <(default)|staging> [--apply]",
  )
  process.exit(1)
}

const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId })
const database = databaseId === "(default)" ? getFirestore(app) : getFirestore(app, databaseId)
const [programs, cohorts] = await Promise.all([
  database.collection("programs").limit(100).get(),
  database.collection("cohorts").limit(100).get(),
])

const programPlans = await Promise.all(programs.docs.map(async (document) => {
  const data = document.data()
  const guideCount = (await document.ref.collection("guides").count().get()).data().count
  const updates = {}
  if (typeof data.familyId !== "string" || !data.familyId.trim()) {
    updates.familyId = document.id.replace(/-v\d+$/i, "")
  }
  if (!("sourceProgramId" in data)) updates.sourceProgramId = null
  if (data.guideCount !== guideCount) updates.guideCount = guideCount
  if (data.status === "published" && data.weekThemesConfigured !== true) {
    updates.weekThemesConfigured = true
  }
  if (data.status === "published" && data.rewardsConfigured !== true) {
    updates.rewardsConfigured = true
  }
  if (data.status === "draft" && !("weekThemesConfigured" in data)) {
    updates.weekThemesConfigured = false
  }
  if (data.status === "draft" && !("rewardsConfigured" in data)) {
    updates.rewardsConfigured = false
  }
  return { id: document.id, updates }
}))

const cohortPlans = cohorts.docs.map((document) => {
  const data = document.data()
  const updates = {}
  if (!("liveCall" in data)) updates.liveCall = null
  if (!("leaderboardVisible" in data)) updates.leaderboardVisible = false
  if (!("leaderboardRevealWeek" in data)) updates.leaderboardRevealWeek = 1
  return {
    id: document.id,
    updates,
    requiresCoachReview: !data.coach || typeof data.coach !== "object",
  }
})

const changedPrograms = programPlans.filter((plan) => Object.keys(plan.updates).length > 0)
const changedCohorts = cohortPlans.filter((plan) => Object.keys(plan.updates).length > 0)
const coachReviews = cohortPlans.filter((plan) => plan.requiresCoachReview).map((plan) => plan.id)

if (apply && changedPrograms.length + changedCohorts.length > 0) {
  const batch = database.batch()
  const audit = {
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUid: "system:program-authoring-backfill",
    updatedByEmail: "dev@dayopius.com",
  }
  for (const plan of changedPrograms) {
    batch.update(database.collection("programs").doc(plan.id), { ...plan.updates, ...audit })
  }
  for (const plan of changedCohorts) {
    batch.update(database.collection("cohorts").doc(plan.id), { ...plan.updates, ...audit })
  }
  await batch.commit()
}

console.log(JSON.stringify({
  mode: apply ? "applied" : "dry-run",
  projectId,
  database: databaseId,
  bounds: { programs: 100, cohorts: 100 },
  scanned: { programs: programs.size, cohorts: cohorts.size },
  plannedWrites: changedPrograms.length + changedCohorts.length,
  programs: changedPrograms,
  cohorts: changedCohorts,
  coachIdentityRequiresManualReview: coachReviews,
}, null, 2))
