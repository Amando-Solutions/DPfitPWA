#!/usr/bin/env node
// =============================================================================
// Set — or clear — the weekly live call on a cohort.
//
// The call lives at `cohorts/{cohortId}.liveCall`, as `{ when, joinUrl }`, and
// Home reads it straight off the cohort document. Null renders no card at all:
// a cohort between blocks has no call to advertise, and a card whose button
// goes nowhere is worse than no card. That is the whole reason this can clear
// as well as set.
//
//   node scripts/set-live-call.mjs --database=staging --cohort=cohort-01 \
//     --when="Tuesday, 7:00 PM WAT" --url=https://meet.google.com/abc-defg-hij
//
//   node scripts/set-live-call.mjs --database=staging --cohort=cohort-01 --show
//   node scripts/set-live-call.mjs --database=staging --cohort=cohort-01 --clear --apply
//
// Dry run unless `--apply`, like the other scripts here: it prints the change
// it intends to make, before and after, and writes nothing.
//
// The console does the same job — Firestore → cohorts → the document → the
// `liveCall` map — and this exists because that is a fiddly nested map to type
// correctly every week, and a half-typed one (a time with no link) is exactly
// the state the app has to treat as "no call".
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
const WHEN = flag('when').trim()
const URL_ = flag('url').trim()

const DATABASE = flag('database').trim()
const COHORT = flag('cohort').trim()

const usage = (message) => {
  console.error(
    `${message}\n\n` +
      '  node scripts/set-live-call.mjs --database=staging --cohort=cohort-01 \\\n' +
      '    --when="Tuesday, 7:00 PM WAT" --url=https://meet.google.com/abc-defg-hij --apply\n\n' +
      '  --show    print the call currently set, change nothing\n' +
      '  --clear   remove it, so Home stops rendering the card\n' +
      '  --apply   actually write (otherwise this is a dry run)\n',
  )
  process.exit(1)
}

// Required and with no default, for the same reason as every other script here:
// a project holds several databases and production has to be named out loud.
if (!DATABASE) usage('Pass --database. It is required and deliberately has no default.')
if (!COHORT) usage('Pass --cohort, e.g. --cohort=cohort-01.')

if (!SHOW && !CLEAR) {
  // Both halves or neither. A time with no link is a button that goes nowhere
  // and a link with no time is a meeting nobody knows to attend, so the app
  // treats either half alone as no call — which would make a partial write look
  // exactly like this script having done nothing.
  if (!WHEN || !URL_) {
    usage(
      'Pass both --when and --url. A time with no link, or a link with no time, is\n' +
        'not a call the app will render — it needs both, so half of one is refused\n' +
        'here rather than written and silently ignored.',
    )
  }
  if (!/^https?:\/\//i.test(URL_)) {
    usage(`--url must be a full http(s) link. Got: ${URL_}`)
  }
}

// --- Credentials -------------------------------------------------------------
// `allow write: if isCoach()` on `cohorts/{id}`, so this needs the Admin SDK.
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
    'No credentials. Writing a cohort means writing past the rules that stop a\n' +
      'member doing it, which takes a service account. See FIREBASE.md.\n',
  )
  process.exit(1)
}

// --- Run ----------------------------------------------------------------------
const describe = (call) =>
  call && call.when && call.joinUrl
    ? `${call.when}\n             ${call.joinUrl}`
    : '(none — Home renders no live call card)'

const run = async () => {
  const { credential, projectId } = credentials()
  initializeApp({ credential, projectId })
  const db = getFirestore(DATABASE)

  const ref = db.doc(`cohorts/${COHORT}`)
  const snap = await ref.get()
  if (!snap.exists) {
    console.error(
      `cohorts/${COHORT} does not exist in "${DATABASE}".\n` +
        'Check --cohort against the id your access codes name, and remember the two\n' +
        'databases are separate stores.',
    )
    process.exit(1)
  }

  const before = snap.data().liveCall ?? null
  console.log(`project    ${projectId}`)
  console.log(`database   ${DATABASE}`)
  console.log(`cohort     cohorts/${COHORT}`)
  console.log(`current    ${describe(before)}`)

  if (SHOW) return

  const next = CLEAR ? null : { when: WHEN, joinUrl: URL_ }
  console.log(`new        ${describe(next)}`)

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply.')
    return
  }

  // `update` rather than `set(..., { merge: true })`: the document must already
  // exist, which was checked above, and a merge would create it half-formed if
  // the id were wrong. `updatedAt` moves with it so the console shows when.
  await ref.update({ liveCall: next, updatedAt: FieldValue.serverTimestamp() })
  console.log('\nWritten. Members pick it up on their next load.')
}

run().catch((cause) => {
  console.error(cause)
  process.exit(1)
})
