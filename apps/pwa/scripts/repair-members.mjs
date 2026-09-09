#!/usr/bin/env node
// =============================================================================
// Give member documents back the `programId` their access code never carried.
//
// `members/{uid}.programId` decides which program the app reads: the plan, the
// guides, the threshold every session is judged against and the point values
// every reward is paid at. A member whose code was written before the landing
// site started copying it — or by hand in the console without it — has the
// empty string there, and `programs/''` is not a document path. Firestore
// rejects it for having an odd number of segments, so the read does not return
// "not found", it throws, and it throws on the boot path.
//
// The app has a fallback for exactly this — `FirestoreDataSource.program()`
// resolves the cohort's `programId` instead and logs a warning — so nobody is
// locked out while this is outstanding. But it is a fallback: the member
// document is still wrong, and it cannot fix itself, because `firestore.rules`
// makes `programId` immutable on a member update. That is the right rule — what
// a member was prescribed is not theirs to change — and it is why this runs on
// the Admin SDK.
//
//   node scripts/repair-members.mjs --database=staging
//   node scripts/repair-members.mjs --database=staging --apply
//
// Dry run unless `--apply`. Nothing is guessed: a member whose cohort has no
// `programId` either is reported and skipped, because inventing one would bind
// them to a plan nobody chose for them.
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
const DATABASE = flag('database').trim()

if (!DATABASE) {
  console.error(
    'Pass --database. It is required and deliberately has no default: a project can\n' +
      'hold several databases and they are separate, so the production one has to be\n' +
      'named out loud to be written to.\n\n' +
      '  --database=staging\n' +
      '  --database="(default)"\n',
  )
  process.exit(1)
}

// --- Credentials -------------------------------------------------------------
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
    'No credentials. `programId` is immutable to the member who owns the document,\n' +
      'which is exactly why repairing one takes a service account. See FIREBASE.md.\n',
  )
  process.exit(1)
}

// --- Run ----------------------------------------------------------------------
const run = async () => {
  const { credential, projectId } = credentials()
  initializeApp({ credential, projectId })
  const db = getFirestore(DATABASE)

  console.log(`project    ${projectId}`)
  console.log(`database   ${DATABASE}`)
  console.log(APPLY ? '\nAPPLY\n' : '\nDRY RUN\n')

  const members = await db.collection('members').get()

  // Cohorts are read once and reused: every member of a cohort resolves to the
  // same answer, and a per-member read would be one round trip each to learn it
  // again.
  const cohorts = new Map()
  const cohortProgram = async (cohortId) => {
    if (!cohorts.has(cohortId)) {
      const snap = await db.doc(`cohorts/${cohortId}`).get()
      cohorts.set(cohortId, snap.exists ? (snap.data() ?? {}) : null)
    }
    return cohorts.get(cohortId)
  }

  let repaired = 0
  let blocked = 0
  let fine = 0

  for (const doc of members.docs) {
    const data = doc.data()
    const current = typeof data.programId === 'string' ? data.programId.trim() : ''
    if (current) {
      fine++
      continue
    }

    const cohortId = data.cohortId
    if (!cohortId) {
      blocked++
      console.log(`  blocked  members/${doc.id}  no cohortId either — needs a person`)
      continue
    }

    const cohort = await cohortProgram(cohortId)
    const programId = cohort?.programId?.trim?.() ?? ''
    if (!programId) {
      blocked++
      console.log(
        `  blocked  members/${doc.id}  cohorts/${cohortId} names no program either`,
      )
      continue
    }

    // `programVersion` comes along when the member's is missing or zero. It
    // pins what they were prescribed, and a member pinned to version 0 of a
    // program that has no version 0 is the same class of bug one field over.
    const patch = { programId }
    const version = cohort.programVersion
    if (!data.programVersion && typeof version === 'number') patch.programVersion = version

    console.log(
      `  repair   members/${doc.id}  programId → "${programId}"` +
        (patch.programVersion ? ` · programVersion → ${patch.programVersion}` : ''),
    )
    repaired++

    if (APPLY) {
      await doc.ref.update({ ...patch, updatedAt: FieldValue.serverTimestamp() })
    }
  }

  console.log('')
  console.log(`${members.size} member(s): ${fine} already fine, ${repaired} to repair, ${blocked} blocked.`)
  if (!APPLY && repaired) console.log('Nothing written. Re-run with --apply.')
  if (blocked) {
    console.log(
      '\nBlocked members are not a bug to work around: their cohort does not name a\n' +
        'program, so there is no right answer to write. Set `programId` on the cohort\n' +
        '(the seed script does) and run this again.',
    )
  }
}

run().catch((cause) => {
  console.error(cause)
  process.exit(1)
})
