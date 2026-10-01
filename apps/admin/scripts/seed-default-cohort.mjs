import { applicationDefault, getApps, initializeApp } from "firebase-admin/app"
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore"

function readArgument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const projectId = readArgument("--project")
const databaseId = readArgument("--database") ?? "(default)"
const startDateInput = readArgument("--start-date") ?? new Date().toISOString().slice(0, 10)

if (
  !projectId ||
  !["(default)", "staging"].includes(databaseId) ||
  !/^\d{4}-\d{2}-\d{2}$/.test(startDateInput)
) {
  console.error(
    "Usage: bun run cohort:seed-default --project <id> [--database (default)|staging] [--start-date YYYY-MM-DD]",
  )
  process.exit(1)
}

/**
 * Midnight at the start of the cohort's last day: the end of its final week,
 * not the day after. `endDate` names the day the cohort runs to the end of (see
 * "Closing a cohort" in ADMIN_NOTIFICATIONS.md). The seeded cohort is on Lagos
 * time, which has no daylight saving, so whole days from its midnight are exact.
 */
function lastDayFrom(startDate, durationWeeks) {
  const endDate = new Date(startDate)
  endDate.setUTCDate(endDate.getUTCDate() + durationWeeks * 7 - 1)
  return endDate
}

const app =
  getApps()[0] ??
  initializeApp({ credential: applicationDefault(), projectId })
const database = databaseId === "(default)"
  ? getFirestore(app)
  : getFirestore(app, databaseId)
const reference = database.collection("cohorts").doc("cohort-01")
const [snapshot, memberCountSnapshot] = await Promise.all([
  reference.get(),
  database.collection("members").where("cohortId", "==", "cohort-01").count().get(),
])
const memberCount = memberCountSnapshot.data().count

if (snapshot.exists) {
  const data = snapshot.data()
  const patch = {}
  if (data.memberCount !== memberCount) patch.memberCount = memberCount
  if (!data.endDate && data.startDate instanceof Timestamp) {
    patch.endDate = Timestamp.fromDate(lastDayFrom(data.startDate.toDate(), Number(data.durationWeeks ?? 6)))
  }
  if (!data.coach) {
    patch.coach = {
      uid: "system:seed",
      name: "DP Fit Coach",
      title: "Coach",
      avatarUrl: "",
    }
  }
  if (!("liveCall" in data)) patch.liveCall = null
  if (!("leaderboardVisible" in data)) patch.leaderboardVisible = false
  if (!("leaderboardRevealWeek" in data)) patch.leaderboardRevealWeek = 1
  if (!data.programId) {
    patch.programId = "recomp-six-week-v1"
    patch.programName = "6-Week Recomp Challenge"
    patch.programVersion = 1
  }

  const writes = Object.keys(patch).length ? 1 : 0
  if (writes) {
    await reference.update({ ...patch, updatedAt: FieldValue.serverTimestamp() })
  }
  console.log(
    JSON.stringify(
      {
        result: writes ? "compatibility-fields-updated" : "already-seeded",
        database: databaseId,
        cohortId: reference.id,
        memberCount,
        fieldsUpdated: Object.keys(patch),
        writes,
      },
      null,
      2,
    ),
  )
  process.exit(0)
}

const startDate = new Date(`${startDateInput}T00:00:00+01:00`)
const endDate = lastDayFrom(startDate, 6)

await reference.create({
  name: "Cohort 01",
  status: "active",
  startDate: Timestamp.fromDate(startDate),
  endDate: Timestamp.fromDate(endDate),
  durationWeeks: 6,
  timezone: "Africa/Lagos",
  memberCount,
  coach: {
    uid: "system:seed",
    name: "DP Fit Coach",
    title: "Coach",
    avatarUrl: "",
  },
  liveCall: null,
  leaderboardVisible: false,
  leaderboardRevealWeek: 1,
  programId: "recomp-six-week-v1",
  programName: "6-Week Recomp Challenge",
  programVersion: 1,
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
  createdByUid: "system:seed",
  createdByEmail: "dev@dayopius.com",
  updatedByUid: "system:seed",
  updatedByEmail: "dev@dayopius.com",
  archivedAt: null,
})

console.log(
  JSON.stringify(
    {
      result: "seeded",
      database: databaseId,
      cohortId: reference.id,
      memberCount,
      writes: 1,
    },
    null,
    2,
  ),
)
