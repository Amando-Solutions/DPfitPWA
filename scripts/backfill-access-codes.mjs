#!/usr/bin/env node
// =============================================================================
// Bring `accessCodes/*` documents up to the shape the claim rule requires.
//
// A code created by hand in the console is the easiest document in the system
// to leave incomplete, and the way it fails is the worst kind: a security rule
// that reads a field the document does not have does not return false, it
// *errors*, and an errored rule denies the write. So a code missing
// `issuedToEmail` passes every friendly check in the app and then dies in the
// claim transaction with nothing but "permission-denied", nowhere near
// anything that could name the field.
//
// This fills in what can be filled in safely and reports what cannot. It never
// invents a value that carries meaning: an absent `expiresAt` or `cohortId` is
// a decision somebody has to make, so those are reported, not guessed.
//
//   node scripts/backfill-access-codes.mjs --database=staging --all
//   node scripts/backfill-access-codes.mjs --database=staging --code=DPF-W4N3-KUF2 --apply
//
// Dry run unless `--apply` is passed. Read the plan first; it prints every
// field it intends to write, per document.
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
const ALL = has('all')
const CODE = flag('code').trim().toUpperCase()
const PROGRAM_ID = flag('program-id').trim()
const PROGRAM_VERSION = flag('program-version').trim()

if (!ALL && !CODE) {
  console.error(
    'Nothing to do. Pass --code=DPF-XXXX-XXXX for one document, or --all for every\n' +
      'access code in the database.\n\n' +
      '  node scripts/backfill-access-codes.mjs --database=staging --all\n' +
      '  node scripts/backfill-access-codes.mjs --database=staging --code=DPF-W4N3-KUF2 --apply\n',
  )
  process.exit(1)
}

// --- Which database ----------------------------------------------------------
//
// Named explicitly, and required. A project can hold several databases, they
// are entirely separate, and the one thing this script must never do is guess
// its way into production. `(default)` has to be typed out to be chosen.
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
//
// A service account, because this writes as an administrator: the rules that
// stop a member rewriting a code are exactly the rules this has to bypass to
// repair one. Read from `.env` so it sits with the rest of the project's
// configuration rather than in shell history.
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

  // The project id is read out of the key rather than left to be discovered.
  // `initializeApp({ credential })` alone leaves `projectId` undefined, and the
  // Firestore handle then falls back to whatever ambient credentials the
  // machine has — which on a laptop with gcloud configured is a different
  // project entirely, and the writes land somewhere nobody was looking.
  const from = (json, source) => {
    let parsed
    try {
      parsed = JSON.parse(json)
    } catch {
      console.error(
        `${source} did not contain JSON. If you base64'd the key file, check the\n` +
          'encoding survived the copy — `base64 -i key.json | tr -d "\\n"` must be one\n' +
          'unbroken line, and a .env value cannot span lines.',
      )
      process.exit(1)
    }
    if (!parsed.project_id) {
      console.error(`${source} has no \`project_id\`. That is not a service account key.`)
      process.exit(1)
    }
    try {
      // Fails on a truncated or re-wrapped private key, which is the usual
      // outcome of a copy-paste through something that reflows long lines.
      return { credential: cert(parsed), projectId: parsed.project_id }
    } catch (cause) {
      console.error(
        `${source} has a private_key OpenSSL will not read: ${cause.message}\n` +
          'Re-download the key and re-encode it; do not hand-edit the newlines.',
      )
      process.exit(1)
    }
  }

  if (raw) {
    // The .env comment offers base64 because a PEM private key has newlines a
    // .env file cannot hold, so accept either form.
    return from(
      raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'),
      'NUXT_FIREBASE_SERVICE_ACCOUNT',
    )
  }
  if (path) return from(readFileSync(path, 'utf8'), path)

  console.error(
    'No credentials. This needs a service account, because repairing a code means\n' +
      'writing past the rules that stop members doing it.\n\n' +
      '  Firebase console → Project settings → Service accounts → Generate new private key\n' +
      '  base64 -i service-account.json | tr -d "\\n"\n\n' +
      'Paste the result into NUXT_FIREBASE_SERVICE_ACCOUNT in .env (it is git-ignored),\n' +
      'or export GOOGLE_APPLICATION_CREDENTIALS pointing at the JSON file.\n',
  )
  process.exit(1)
}

// --- The repair --------------------------------------------------------------
/**
 * What this document is missing, and what can be done about it.
 *
 * Split in two on purpose. `patch` is everything with a safe, derivable value:
 * `issuedToEmail` absent and null mean the same thing (no buyer bound), and
 * `updatedBy*` can be copied from `createdBy*` because that is who last touched
 * it. `blocked` is everything that carries a decision — an expiry date, a
 * cohort — where writing a guess would be worse than the error it replaces.
 */
const plan = (id, data) => {
  const patch = {}
  const blocked = []
  const notes = []

  if (!('issuedToEmail' in data)) {
    // The field the claim rule reads and the one that is almost always missing.
    patch.issuedToEmail = null
    notes.push('issuedToEmail → null (a generic code, redeemable by any buyer)')
  }

  // An older shape called this `claimedByMemberId`. The rule and `AccessCodeDoc`
  // both say `claimedByUid`, so carry the value across and drop the old key.
  if (!('claimedByUid' in data)) {
    patch.claimedByUid = 'claimedByMemberId' in data ? data.claimedByMemberId : null
    notes.push(`claimedByUid → ${JSON.stringify(patch.claimedByUid)}`)
  }
  if ('claimedByMemberId' in data) {
    patch.claimedByMemberId = FieldValue.delete()
    notes.push('claimedByMemberId → deleted (renamed to claimedByUid)')
  }

  for (const [field, source] of [
    ['updatedByUid', 'createdByUid'],
    ['updatedByEmail', 'createdByEmail'],
  ]) {
    if (!(field in data) && source in data) {
      patch[field] = data[source]
      notes.push(`${field} → ${JSON.stringify(data[source])} (from ${source})`)
    }
  }

  for (const field of ['claimedAt', 'claimedByName', 'revokedAt']) {
    if (!(field in data)) {
      patch[field] = null
      notes.push(`${field} → null`)
    }
  }

  if (PROGRAM_ID) {
    patch.programId = PROGRAM_ID
    patch.programVersion = PROGRAM_VERSION ? Number(PROGRAM_VERSION) : 1
    notes.push(`programId → ${JSON.stringify(PROGRAM_ID)} (v${patch.programVersion})`)
  } else if (!data.programId) {
    // Not fatal to the claim, but the member document copies this field and
    // `programs/''` is not a document path, so the first workout save throws.
    blocked.push('programId is empty — pass --program-id=<id> unless it is set elsewhere')
  }

  // Decisions, not defaults.
  if (!('status' in data)) blocked.push('status is missing — set it to "unused" in the console')
  else if (data.status !== 'unused' && data.status !== 'claimed' && data.status !== 'revoked') {
    blocked.push(`status is ${JSON.stringify(data.status)} — must be unused/claimed/revoked`)
  }
  if (!('expiresAt' in data)) blocked.push('expiresAt is missing — set a future timestamp')
  else if (data.expiresAt?.toMillis?.() < Date.now()) {
    blocked.push(`expiresAt is in the past (${data.expiresAt.toDate().toISOString()})`)
  }
  if (!data.cohortId) blocked.push('cohortId is missing — it must name a real cohort')

  if (Object.keys(patch).length) patch.updatedAt = FieldValue.serverTimestamp()
  return { id, patch, blocked, notes }
}

// --- Run ---------------------------------------------------------------------
const { credential, projectId } = credentials()
const app = initializeApp({ credential, projectId })

// `getFirestore(app, id)` rather than constructing a Firestore directly: the
// two-argument form is what carries the app's credential onto the named
// database. A bare `new Firestore({ databaseId })` builds its own client and
// authenticates with ambient credentials instead of the key above.
const db = getFirestore(app, DATABASE)

const codes = db.collection('accessCodes')
const snaps = ALL ? (await codes.get()).docs : [await codes.doc(CODE).get()]

console.log(`\ndatabase : ${DATABASE}`)
console.log(`project  : ${projectId}`)
console.log(`mode     : ${APPLY ? 'APPLY — writing' : 'dry run — nothing will be written'}\n`)

let changed = 0
let clean = 0
let stuck = 0

for (const snap of snaps) {
  if (!snap.exists) {
    console.log(`✗ ${snap.id} — no such document in "${DATABASE}"`)
    stuck++
    continue
  }

  const { id, patch, blocked, notes } = plan(snap.id, snap.data())
  const writes = Object.keys(patch).filter((k) => k !== 'updatedAt')

  if (!writes.length && !blocked.length) {
    clean++
    continue
  }

  console.log(`• ${id}`)
  for (const note of notes) console.log(`    ${note}`)
  for (const b of blocked) console.log(`    ⚠ ${b}`)

  if (writes.length) {
    if (APPLY) {
      await snap.ref.update(patch)
      console.log(`    ✓ written`)
    }
    changed++
  }
  console.log('')
}

console.log(
  `${clean} already correct · ${changed} ${APPLY ? 'updated' : 'would be updated'} · ${stuck} unreadable`,
)
if (!APPLY && changed) console.log('\nRe-run with --apply to write.\n')
