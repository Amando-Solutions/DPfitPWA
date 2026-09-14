#!/usr/bin/env node
// =============================================================================
// Give every member the roster row their cohort needs to see them.
//
// `cohorts/{id}/leaderboard/{uid}` is the only collection one member may read
// about another. Member documents carry email addresses, body weight, injuries
// and allergies, and `firestore.rules` never opens them to a peer — so this
// projection is not just the board's data source, it is the whole answer to
// "who is in my cohort". A member with no row here is invisible to everyone
// they train alongside: uncounted in the chat header, absent from the board,
// and impossible to name with an `@` in chat.
//
// Until now the row was first written at the display-name step of setup. That
// left two gaps, and this closes the historical half of both:
//
//   - a member who redeemed their code and never finished setup has no row at
//     all, and never will
//   - a member who finished setup has a row with no `sessions` field until
//     their first qualifying session
//
// The second was invisible for a different reason: `listLeaderboard` used to
// order by `sessions`, and a Firestore `orderBy` returns only documents that
// have the field. Both are fixed going forward — the row is written when the
// seat is claimed, and the query no longer orders — but neither fix reaches
// members who are already in this state. That is what this is for.
//
//   node scripts/backfill-roster.mjs --database=staging
//   node scripts/backfill-roster.mjs --database=staging --apply
//
// Dry run unless `--apply`. Rows that already exist are left exactly as they
// are: their `sessions` count is the board's record of work somebody did, and
// this script has no better source for it than the row itself.
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
    'No credentials. A member may only write their own roster row, so filling in\n' +
      'somebody else’s takes a service account. See FIREBASE.md.\n',
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

  let written = 0
  let present = 0
  let blocked = 0
  let nameless = 0

  for (const doc of members.docs) {
    const data = doc.data()
    const cohortId = typeof data.cohortId === 'string' ? data.cohortId.trim() : ''

    if (!cohortId) {
      blocked++
      console.log(`  blocked  members/${doc.id}  no cohortId — not in a cohort to be seen in`)
      continue
    }

    const ref = db.doc(`cohorts/${cohortId}/leaderboard/${doc.id}`)
    const existing = await ref.get()
    if (existing.exists) {
      present++
      continue
    }

    const profile = data.profile ?? {}
    const displayName = typeof profile.displayName === 'string' ? profile.displayName.trim() : ''

    // The same fallback the app's three writers use. A member who never set a
    // name is still in the cohort and still has to be counted; what they cannot
    // be is usefully named, so they are reported separately below.
    const name = displayName || 'Member'
    if (!displayName) nameless++

    // `sessions` comes from the member's own counter rather than being left
    // out. This row is new, so there is nothing to overwrite, and seeding it
    // with what they have actually logged means the board is right the moment
    // it appears instead of after their next session.
    const sessions = Number(data?.stats?.sessionsQualified) || 0

    console.log(
      `  write    cohorts/${cohortId}/leaderboard/${doc.id}  ` +
        `name "${name}" · sessions ${sessions}` +
        (displayName ? '' : '  (no display name set)'),
    )
    written++

    if (APPLY) {
      await ref.set({
        name,
        avatarUrl: typeof profile.avatarUrl === 'string' ? profile.avatarUrl : '',
        sessions,
        updatedAt: FieldValue.serverTimestamp(),
      })
    }
  }

  console.log('')
  console.log(
    `${members.size} member(s): ${present} already listed, ` +
      `${written} ${APPLY ? 'added' : 'to add'}, ${blocked} blocked.`,
  )
  if (!APPLY && written) console.log('Nothing written. Re-run with --apply.')
  if (APPLY && written) console.log('Written. A dry run now should report them as already listed.')
  if (nameless) {
    console.log(
      `\n${nameless} of those have no display name and will be listed as "Member".\n` +
        'They are in the cohort and are counted, but several of them are\n' +
        'indistinguishable in a mention list. They set a real one by finishing setup.',
    )
  }
  if (blocked) {
    console.log(
      '\nBlocked members have no `cohortId`, so there is no roster for them to join.\n' +
        'That is a member document to look at by hand, not something to guess at.',
    )
  }
}

run().catch((cause) => {
  console.error(cause)
  process.exit(1)
})
