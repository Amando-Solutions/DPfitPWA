#!/usr/bin/env node
// =============================================================================
// Set — or clear — the demo video on one exercise in one week's training day.
//
// The video is `videoUrl` on an entry of the day's `exercises` array, at
// `programs/{programId}/weeks/{weekId}/days/{dayId}`, and the How to tab plays
// it. Null renders the "Video coming soon" placeholder.
//
// The URL is an https link to the video file itself, from any host: an
// UploadThing file URL, a storage bucket download URL, a CDN. Not a page that
// shows a video — a YouTube or Google Drive share link is HTML and will not
// play. Before writing, the link is fetched to check it serves a video the app
// can play, and anything doubtful is printed as a warning.
//
//   node scripts/set-exercise-video.mjs --database=staging --program-id=recomp-six-week-v1 \
//     --week=4 --day=1 --exercise=1 \
//     --url="https://<app-id>.ufs.sh/f/<file-key>"
//
//   node scripts/set-exercise-video.mjs … --show
//   node scripts/set-exercise-video.mjs … --clear --apply
//
// Dry run unless `--apply`, like the other scripts here: it prints the exercise
// it found and the change it intends to make, and writes nothing.
//
// Only the one week. Day and exercise ids repeat across weeks, so week 1's
// goblet squat is a separate copy from week 4's and keeps whatever it has.
//
// The console can do this too, and this exists because it cannot edit one
// element of an array: changing one exercise's video there means retyping the
// day's whole `exercises` list, and a slip in it is a broken training day.
// =============================================================================
import { readFileSync } from 'node:fs'
import { cert, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

// --- Arguments ---------------------------------------------------------------
const argv = process.argv.slice(2)
const flag = (name, fallback = '') => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`))
  if (!hit) return fallback
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : 'true'
}
const has = (name) => flag(name) !== ''

const APPLY = has('apply')
const SHOW = has('show')
const CLEAR = has('clear')
const URL_ = flag('url').trim()

const DATABASE = flag('database').trim()
const PROGRAM_ID = flag('program-id').trim()
const WEEK = Number(flag('week').trim())
/** `1` for the day numbered 1 in the week, or a document id like `day-1`. */
const DAY = flag('day').trim()
/** `1` for the first exercise in the day, or an exercise id like `ex-goblet-squat`. */
const EXERCISE = flag('exercise').trim()

/** Who the audit fields name. A script, said plainly, rather than a coach who did not do it. */
const ACTOR = 'system:set-exercise-video'

const usage = (message) => {
  console.error(
    `${message}\n\n` +
      '  node scripts/set-exercise-video.mjs --database=staging --program-id=recomp-six-week-v1 \\\n' +
      '    --week=4 --day=1 --exercise=1 --url="https://<app-id>.ufs.sh/f/<file-key>" --apply\n\n' +
      '  --url        an https link to the video file itself, from any host\n' +
      '  --day        the day number in the week (1), or its document id (day-1)\n' +
      '  --exercise   its position in the day (1), or its id (ex-goblet-squat)\n' +
      '  --show       print the video currently set, change nothing\n' +
      '  --clear      remove it, so the How to tab shows the placeholder\n' +
      '  --apply      actually write (otherwise this is a dry run)\n',
  )
  process.exit(1)
}

// Required and with no default, for the same reason as every other script here:
// a project holds several databases and production has to be named out loud.
if (!DATABASE) usage('Pass --database. It is required and deliberately has no default.')
if (!PROGRAM_ID) usage('Pass --program-id, e.g. --program-id=recomp-six-week-v1.')
if (!Number.isInteger(WEEK) || WEEK < 1) usage('Pass --week as a week number, e.g. --week=4.')
if (!DAY) usage('Pass --day, e.g. --day=1 or --day=day-1.')
if (!EXERCISE) usage('Pass --exercise, e.g. --exercise=1 or --exercise=ex-goblet-squat.')

if (!SHOW && !CLEAR) {
  if (!URL_) usage('Pass --url, or --clear to remove the video, or --show to read it.')
  // The same check the rules make, so a URL they would refuse from the app is
  // refused here too rather than slipped past them by the Admin SDK.
  if (!/^https:\/\/.+/.test(URL_) || URL_.length > 2048) {
    usage(`--url must be an https link of at most 2048 characters. Got: ${URL_}`)
  }
}

// --- Credentials -------------------------------------------------------------
// `allow write: if isCoach()` on `programs/**`, so this needs the Admin SDK.
const readEnvFile = () => {
  try {
    const out = {}
    for (const line of readFileSync('.env', 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
    return out
  } catch {
    return {}
  }
}

const credentials = () => {
  const env = { ...readEnvFile(), ...process.env }
  const raw = env.NUXT_FIREBASE_SERVICE_ACCOUNT?.trim()
  const path = env.GOOGLE_APPLICATION_CREDENTIALS?.trim()

  const from = (json, source) => {
    let parsed
    try {
      parsed = JSON.parse(json)
    } catch {
      console.error(`${source} did not contain JSON. Check the base64 survived the copy.`)
      process.exit(1)
    }
    if (!parsed.project_id) {
      console.error(`${source} has no \`project_id\`. That is not a service account key.`)
      process.exit(1)
    }
    return { credential: cert(parsed), projectId: parsed.project_id }
  }

  if (raw) {
    return from(
      raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'),
      'NUXT_FIREBASE_SERVICE_ACCOUNT',
    )
  }
  if (path) return from(readFileSync(path, 'utf8'), path)

  console.error(
    'No credentials. Writing a program means writing past the rules that stop a\n' +
      'member doing it, which takes a service account. See FIREBASE.md.\n',
  )
  process.exit(1)
}

// --- Lookup -------------------------------------------------------------------
const isPosition = (value) => /^\d+$/.test(value)

const fail = (message) => {
  console.error(message)
  process.exit(1)
}

/** By `weekNumber`, not by id: nothing in the app reads the `week-{n}` id. */
const findWeek = async (program) => {
  const hits = await program.collection('weeks').where('weekNumber', '==', WEEK).get()
  if (hits.size === 1) return hits.docs[0]
  if (hits.size > 1) {
    fail(`${hits.size} weeks have weekNumber ${WEEK}: ${hits.docs.map((d) => d.id).join(', ')}.`)
  }
  const all = await program.collection('weeks').get()
  const numbers = all.docs.map((d) => d.get('weekNumber')).sort((a, b) => a - b)
  fail(`No week ${WEEK} in ${program.path}. Weeks there: ${numbers.join(', ') || '(none)'}.`)
}

const findDay = async (week) => {
  const days = week.ref.collection('days')
  if (!isPosition(DAY)) {
    const snap = await days.doc(DAY).get()
    if (snap.exists) return snap
  } else {
    const hits = await days.where('dayNumber', '==', Number(DAY)).get()
    if (hits.size === 1) return hits.docs[0]
    if (hits.size > 1) {
      fail(`${hits.size} days have dayNumber ${DAY}: ${hits.docs.map((d) => d.id).join(', ')}.`)
    }
  }
  const all = await days.get()
  const listed = all.docs.map((d) => `${d.id} (Day ${d.get('dayNumber')}: ${d.get('label')})`)
  fail(`No day ${DAY} in ${week.ref.path}. Days there:\n  ${listed.join('\n  ') || '(none)'}`)
}

/** Index into the day's `exercises`, or exits naming what is there. */
const findExercise = (exercises, dayPath) => {
  const index = isPosition(EXERCISE)
    ? Number(EXERCISE) - 1
    : exercises.findIndex((e) => e.id === EXERCISE)
  if (index >= 0 && index < exercises.length) return index
  const listed = exercises.map((e, i) => `${i + 1}. ${e.id} (${e.name})`)
  fail(`No exercise ${EXERCISE} in ${dayPath}. Exercises there:\n  ${listed.join('\n  ') || '(none)'}`)
}

// --- Probe --------------------------------------------------------------------
/**
 * What the link actually serves, as warnings. Empty means it looks playable.
 *
 * The link can come from anywhere, and the ways it goes wrong are all invisible
 * until a member opens the exercise: a share page instead of the file, a host
 * that refuses the request, a type the browser will not play. Asking for the
 * first two bytes answers all of those without downloading the clip.
 *
 * Warnings, not refusals. A host can answer a script differently from a browser,
 * and a link that is wrong today may be fixed at the host tomorrow.
 */
const probe = async (url) => {
  let res
  try {
    res = await fetch(url, { headers: { Range: 'bytes=0-1' }, signal: AbortSignal.timeout(15_000) })
  } catch (cause) {
    return [`could not fetch it (${cause.cause?.code ?? cause.message}). Check the link opens in a browser.`]
  }
  await res.body?.cancel()

  if (!res.ok) return [`the host answered ${res.status}. Members will get the "can't play" fallback.`]

  const warnings = []
  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (type === 'text/html') {
    warnings.push('it serves a web page, not a video file. Use the direct link to the file.')
  } else if (!type.startsWith('video/')) {
    warnings.push(`it serves "${type || 'no content type'}", not video/*. Safari may refuse to play it.`)
  } else if (type !== 'video/mp4') {
    warnings.push(`it is ${type}. MP4 (H.264) is the format every browser plays.`)
  }
  // Safari, and every browser on iOS, will not play a video from a host that
  // ignores range requests.
  if (res.status !== 206) {
    warnings.push('the host ignores range requests, which iPhones need to play video.')
  }
  return warnings
}

// --- Run ----------------------------------------------------------------------
const describe = (url) => url || '(none — How to shows "Video coming soon")'

const run = async () => {
  const { credential, projectId } = credentials()
  initializeApp({ credential, projectId })
  const db = getFirestore(DATABASE)

  const program = db.doc(`programs/${PROGRAM_ID}`)
  if (!(await program.get()).exists) {
    const ids = (await db.collection('programs').listDocuments()).map((d) => d.id)
    fail(
      `programs/${PROGRAM_ID} does not exist in "${DATABASE}".\n` +
        `Programs there: ${ids.join(', ') || '(none)'}`,
    )
  }

  const week = await findWeek(program)
  const day = await findDay(week)
  const dayRef = day.ref

  const exercises = day.get('exercises') ?? []
  const index = findExercise(exercises, dayRef.path)
  const exercise = exercises[index]
  const before = exercise.videoUrl ?? null

  console.log(`project    ${projectId}`)
  console.log(`database   ${DATABASE}`)
  console.log(`day        ${dayRef.path}`)
  console.log(`           Week ${WEEK}, Day ${day.get('dayNumber')}: ${day.get('label')}`)
  console.log(`exercise   ${index + 1}. ${exercise.name} (${exercise.id})`)
  console.log(`current    ${describe(before)}`)

  if (SHOW) return

  const next = CLEAR ? null : URL_
  console.log(`new        ${describe(next)}`)

  if (next) {
    const warnings = await probe(next)
    console.log(warnings.length ? '' : 'check      serves a video with range support')
    for (const w of warnings) console.log(`warning    ${w}`)
  }

  if (before === next) {
    console.log('\nAlready set. Nothing to do.')
    return
  }
  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply.')
    return
  }

  // Firestore cannot update one element of an array, so the whole list is
  // rewritten — inside a transaction, re-read, so a coach's edit to another
  // exercise between the read above and this write is kept rather than undone.
  // The exercise is found again by id in case the list was reordered meanwhile.
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(dayRef)
    const list = fresh.get('exercises') ?? []
    const at = list.findIndex((e) => e.id === exercise.id)
    if (at < 0) throw new Error(`${exercise.id} left ${dayRef.path} while this ran. Nothing written.`)
    list[at] = { ...list[at], videoUrl: next }
    tx.update(dayRef, {
      exercises: list,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUid: ACTOR,
      updatedByEmail: ACTOR,
    })
  })
  console.log('\nWritten. Members see it the next time the plan loads.')
}

run().catch((cause) => {
  console.error(cause)
  process.exit(1)
})
