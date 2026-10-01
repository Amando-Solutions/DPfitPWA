import { applicationDefault, getApps, initializeApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

function argument(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const projectId = argument("project") ?? process.env.FIREBASE_PROJECT_ID
const databaseId = argument("database")
const apply = process.argv.includes("--apply")

if (!projectId || !["(default)", "staging"].includes(databaseId)) {
  console.error(
    "Usage: npm run chat:backfill-coach-name -- --project <id> --database <(default)|staging> [--apply]",
  )
  process.exit(1)
}

const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId })
const database = databaseId === "(default)" ? getFirestore(app) : getFirestore(app, databaseId)
const cohorts = await database.collection("cohorts").get()
const messageSnapshots = []

for (const cohort of cohorts.docs) {
  const threads = await cohort.ref.collection("threads").get()
  for (const thread of threads.docs) {
    messageSnapshots.push(await thread.ref.collection("messages").get())
  }
}

const messages = messageSnapshots.flatMap((snapshot) => snapshot.docs)
const targets = messages.filter((document) => {
  const data = document.data()
  return data.isCoach === true && data.authorName !== "Coach"
})

if (apply && targets.length > 0) {
  const writer = database.bulkWriter()
  for (const document of targets) writer.update(document.ref, { authorName: "Coach" })
  await writer.close()
}

console.log(JSON.stringify({
  mode: apply ? "applied" : "dry-run",
  projectId,
  database: databaseId,
  scanned: {
    cohorts: cohorts.size,
    threads: messageSnapshots.length,
    messages: messages.length,
  },
  plannedWrites: targets.length,
  messagePaths: targets.map((document) => document.ref.path),
}, null, 2))
