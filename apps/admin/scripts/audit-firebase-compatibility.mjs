import { applicationDefault, getApps, initializeApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

function readArgument(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const projectId = readArgument("project") ?? process.env.FIREBASE_PROJECT_ID
const databaseId = readArgument("database")

if (!projectId || !["(default)", "staging"].includes(databaseId)) {
  console.error(
    "Usage: npm run firebase:compatibility:audit -- --project <id> --database <(default)|staging>",
  )
  process.exit(1)
}

const app = getApps()[0] ?? initializeApp({
  credential: applicationDefault(),
  projectId,
})
const database = databaseId === "(default)"
  ? getFirestore(app)
  : getFirestore(app, databaseId)

const [codes, cohorts, programs, members] = await Promise.all([
  database.collection("accessCodes").limit(200).get(),
  database.collection("cohorts").limit(100).get(),
  database.collection("programs").limit(100).get(),
  database.collection("members").limit(100).get(),
])

const countWhere = (documents, predicate) =>
  documents.reduce((total, document) => total + Number(predicate(document.data())), 0)

const report = {
  projectId,
  database: databaseId,
  readsCappedAt: 500,
  accessCodes: {
    scanned: codes.size,
    missingIssuedToEmail: countWhere(codes.docs, (data) => !("issuedToEmail" in data)),
    missingIssuedToWhatsapp: countWhere(
      codes.docs,
      (data) => !("issuedToWhatsapp" in data),
    ),
    missingProgramPin: countWhere(
      codes.docs,
      (data) => !data.programId || typeof data.programVersion !== "number",
    ),
    unusedMissingProgramPin: countWhere(
      codes.docs,
      (data) =>
        data.status === "unused" &&
        (!data.programId || typeof data.programVersion !== "number"),
    ),
    claimedMissingProgramPin: countWhere(
      codes.docs,
      (data) =>
        data.status === "claimed" &&
        (!data.programId || typeof data.programVersion !== "number"),
    ),
    missingClaimedByUid: countWhere(codes.docs, (data) => !("claimedByUid" in data)),
    legacyClaimedByMemberId: countWhere(
      codes.docs,
      (data) => "claimedByMemberId" in data,
    ),
  },
  cohorts: {
    scanned: cohorts.size,
    missingEndDate: countWhere(cohorts.docs, (data) => !("endDate" in data)),
    missingCoach: countWhere(cohorts.docs, (data) => !("coach" in data)),
    missingMemberFacingDefaults: countWhere(
      cohorts.docs,
      (data) =>
        !("liveCall" in data) ||
        !("leaderboardVisible" in data) ||
        !("leaderboardRevealWeek" in data),
    ),
    missingProgramPin: countWhere(
      cohorts.docs,
      (data) => !data.programId || typeof data.programVersion !== "number",
    ),
  },
  programs: {
    scanned: programs.size,
    missingRewards: countWhere(programs.docs, (data) => !("rewards" in data)),
  },
  members: {
    scanned: members.size,
    missingEmail: countWhere(members.docs, (data) => !("email" in data)),
    sampleMissingEmail: countWhere(
      members.docs,
      (data) => !("email" in data) && data.isSample === true,
    ),
    nonSampleMissingEmail: countWhere(
      members.docs,
      (data) => !("email" in data) && data.isSample !== true,
    ),
    missingProgramPin: countWhere(
      members.docs,
      (data) => !data.programId || typeof data.programVersion !== "number",
    ),
  },
}

console.log(JSON.stringify(report, null, 2))
