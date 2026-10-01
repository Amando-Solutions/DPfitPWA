// Read-only. Lists every cohort whose stored `endDate` isn't midnight at the
// start of its intended last day, in its own time zone, beside the value it
// should hold. Writes nothing.
//
// `endDate` names the last day: the cohort runs to the end of it and closes at
// the midnight after (see "Closing a cohort" in ADMIN_NOTIFICATIONS.md). The
// console used to store `startDate + durationWeeks × 7 days`, the day after the
// last day, which keeps members in a day too long. The intended last day here is
// `startDate + durationWeeks × 7 − 1` days; a cohort whose last day was moved on
// purpose shows up too, so read the list before fixing anything.
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"

function readArgument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const projectId = readArgument("--project")
const databaseId = readArgument("--database") ?? "(default)"

if (!projectId || !["(default)", "staging"].includes(databaseId)) {
  console.error("Usage: bun run cohort:check-end-dates --project <id> [--database (default)|staging]")
  process.exit(1)
}

const LAGOS = "Africa/Lagos"

function zoneOf(value) {
  if (typeof value !== "string" || !value.trim()) return LAGOS
  try {
    new Intl.DateTimeFormat("en", { timeZone: value })
    return value
  } catch {
    return LAGOS
  }
}

function wallClock(date, zone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date)
  const part = (type) => Number(parts.find((item) => item.type === type)?.value)
  return { year: part("year"), month: part("month"), day: part("day"), hour: part("hour"), minute: part("minute"), second: part("second") }
}

const pad = (value) => String(value).padStart(2, "0")
const dayIn = (date, zone) => { const c = wallClock(date, zone); return `${c.year}-${pad(c.month)}-${pad(c.day)}` }
const timeIn = (date, zone) => { const c = wallClock(date, zone); return `${pad(c.hour)}:${pad(c.minute)}` }
const addDays = (day, days) => {
  const [year, month, date] = day.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10)
}
const offsetAt = (instant, zone) => {
  const c = wallClock(new Date(instant), zone)
  return Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second) - Math.floor(instant / 1000) * 1000
}
/** Midnight at the start of `day` in `zone`. */
const startOfDay = (day, zone) => {
  const [year, month, date] = day.split("-").map(Number)
  const wall = Date.UTC(year, month - 1, date)
  return new Date(wall - offsetAt(wall - offsetAt(wall, zone), zone))
}

const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId })
const database = databaseId === "(default)" ? getFirestore(app) : getFirestore(app, databaseId)
const snapshot = await database.collection("cohorts").get()

const rows = []
for (const cohort of snapshot.docs) {
  const data = cohort.data()
  const zone = zoneOf(data.timezone)
  const start = data.startDate instanceof Timestamp ? data.startDate.toDate() : null
  const end = data.endDate instanceof Timestamp ? data.endDate.toDate() : null
  const weeks = Number(data.durationWeeks)
  if (!start || !Number.isInteger(weeks) || weeks < 1) {
    rows.push({ cohortId: cohort.id, name: data.name ?? null, problem: "no usable startDate or durationWeeks; check by hand" })
    continue
  }
  const intendedLastDay = addDays(dayIn(start, zone), weeks * 7 - 1)
  const intended = startOfDay(intendedLastDay, zone)
  if (end && end.getTime() === intended.getTime()) continue

  rows.push({
    cohortId: cohort.id,
    name: data.name ?? null,
    status: data.status ?? null,
    timezone: zone,
    startDay: dayIn(start, zone),
    durationWeeks: weeks,
    stored: end ? { iso: end.toISOString(), day: dayIn(end, zone), time: timeIn(end, zone) } : null,
    corrected: { iso: intended.toISOString(), day: intendedLastDay, time: "00:00" },
    problem: !end ? "no endDate"
      : dayIn(end, zone) === addDays(intendedLastDay, 1) ? "a day late: stored as the day after the last day"
      : dayIn(end, zone) !== intendedLastDay ? "a different day: moved on purpose, or a mistake"
      : "right day, but not midnight",
  })
}

console.log(JSON.stringify({ database: databaseId, cohorts: snapshot.size, needsReview: rows.length, rows, writes: 0 }, null, 2))
