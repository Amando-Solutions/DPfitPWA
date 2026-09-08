#!/usr/bin/env bun
// =============================================================================
// Write the authored content the app reads: the program, the training week,
// the guide library, the cohort, and its announcement and notification decks.
//
// The app used to `import` all of this out of `app/data/program.ts`, so every
// cohort on every deploy was shown the same six-week plan, the same badges and
// the same live call whatever the coach had actually set up. It reads all of it
// from Firestore now — which means the documents have to exist, and typing a
// forty-exercise training week into the console by hand is not a plan.
//
// So the fixture becomes the seed. It is already typed against the real
// document contracts, which is what makes this possible at all: if it compiles,
// the documents it writes are the shape the rules and the app expect.
//
//   bun run seed:program -- --database=staging               # dry run, prints the plan
//   bun run seed:program -- --database=staging --apply
//   bun run seed:program -- --database=staging --apply --fill    # add missing fields
//   bun run seed:program -- --database=staging --apply --force   # overwrite existing
//
// Dry run unless `--apply`. Existing documents are left alone unless `--force`,
// because after the first seed the console is the source of truth and a second
// run must not quietly undo a coach's edits.
// =============================================================================
import { readFileSync } from 'node:fs'
import { cert, initializeApp } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

import {
  PROGRAM_ID as FIXTURE_PROGRAM_ID,
  announcements,
  cohort,
  coreCardioDay,
  guides,
  notificationSeed,
  planDays,
  program,
} from '../app/data/program'

// --- Arguments ---------------------------------------------------------------
const argv = process.argv.slice(2)
const flag = (name: string, fallback = ''): string => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`))
  if (!hit) return fallback
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : 'true'
}
const has = (name: string) => flag(name) !== ''

const APPLY = has('apply')
const FORCE = has('force')

/**
 * Bring existing documents up to the current shape without touching what is
 * already set.
 *
 * The middle ground between skipping and `--force`, and the mode this repo
 * actually needed: the program document in staging predates `rewards`, so it is
 * correct in every field it has and unusable without the one it lacks. `--force`
 * would fix it by overwriting a coach's edits to everything else; skipping
 * leaves points, badges and ranks at zero forever.
 *
 * Only top-level keys, and only absent ones. A `rewards` block that exists but
 * is half-written is a decision, not a gap, and merging into it would produce a
 * shape nobody authored.
 */
const FILL = has('fill')

/**
 * Which database, named explicitly and with no default.
 *
 * A project holds several and they are entirely separate stores. The one thing
 * this must never do is guess its way into production, so `(default)` has to be
 * typed out to be chosen.
 */
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

/**
 * The ids the documents land under.
 *
 * These are the two values that have to agree with something outside this
 * script: `accessCodes/{code}.cohortId` names the cohort a member is written
 * into, and the member document copies `programId` off the same code. A seed
 * under different ids produces a member whose program path resolves to nothing,
 * which surfaces as an empty Train screen rather than as an error.
 */
const PROGRAM_ID = flag('program-id', FIXTURE_PROGRAM_ID).trim()
const COHORT_ID = flag('cohort-id', cohort.id).trim()

/**
 * The coach, denormalised onto the cohort.
 *
 * Worth flags of its own because it is the one piece of seeded content that is
 * about a real person: it is the name and face on the DM header and on every
 * message they send, and the fixture's is a stock photograph. Left unset, the
 * fixture's values go in — fine for staging, wrong for anywhere a member will
 * see it, so `--coach-name` and friends exist to get it right on the way in
 * rather than through a follow-up edit.
 */
const COACH = has('no-coach')
  ? null
  : {
      uid: flag('coach-uid', cohort.coach.uid).trim(),
      name: flag('coach-name', cohort.coach.name).trim(),
      title: flag('coach-title', cohort.coach.title).trim(),
      avatarUrl: flag('coach-avatar', cohort.coach.avatarUrl).trim(),
    }

// --- Credentials -------------------------------------------------------------
//
// A service account, because this writes content only a coach may write —
// `allow write: if isCoach()` on both `programs` and `cohorts`. Read from `.env`
// so it sits with the rest of the project's configuration rather than in shell
// history. Same handling as `backfill-access-codes.mjs`.
const readEnvFile = (): Record<string, string> => {
  try {
    const out: Record<string, string> = {}
    for (const line of readFileSync('.env', 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (m?.[1]) out[m[1]] = (m[2] ?? '').trim().replace(/^["']|["']$/g, '')
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
  // `initializeApp({ credential })` alone leaves `projectId` undefined and the
  // Firestore handle falls back to whatever ambient credentials the machine
  // has, which on a laptop with gcloud configured is a different project.
  const from = (json: string, source: string) => {
    let parsed: { project_id?: string }
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
    return { credential: cert(parsed as never), projectId: parsed.project_id }
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
      'member doing it, which takes a service account.\n\n' +
      '  Firebase console → Project settings → Service accounts → Generate new private key\n' +
      '  base64 -i service-account.json | tr -d "\\n"\n\n' +
      'Paste the result into NUXT_FIREBASE_SERVICE_ACCOUNT in .env (git-ignored), or\n' +
      'export GOOGLE_APPLICATION_CREDENTIALS pointing at the JSON file.\n',
  )
  process.exit(1)
}

// --- Fixture → document -------------------------------------------------------
/**
 * Swap the client SDK's `Timestamp` for a `Date` on the way out.
 *
 * The fixture is typed against `firebase/firestore` because the app is, and the
 * Admin SDK does not recognise the client's `Timestamp` class — handed one it
 * writes a map with `seconds` and `nanoseconds` keys, which reads back as an
 * object rather than an instant and breaks every `orderBy` and `.toMillis()`
 * over it. A `Date` it does understand, and converts to a real timestamp.
 *
 * Duck-typed on `toDate` rather than `instanceof`, because the fixture and this
 * script can end up holding two copies of the firebase module and `instanceof`
 * is false across them — a failure that would be silent and total.
 */
const toAdmin = (value: unknown): unknown => {
  if (value === null || typeof value !== 'object') return value
  if (typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate()
  }
  if (Array.isArray(value)) return value.map(toAdmin)
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toAdmin(v)]),
  )
}

/** Everything except `id`: the document id is the key, never a field inside it. */
const body = <T extends { id: string }>(doc: T): Record<string, unknown> => {
  const { id: _id, ...rest } = doc
  return toAdmin(rest) as Record<string, unknown>
}

interface Planned {
  path: string
  label: string
  data: Record<string, unknown>
}

const plan = (): Planned[] => {
  const out: Planned[] = []

  out.push({
    path: `programs/${PROGRAM_ID}`,
    label: `program · ${program.name} v${program.version}`,
    // `id` is dropped and the two ids are re-stated from the flags, so a seed
    // under a different program id is internally consistent rather than a
    // document that names one id and lives at another.
    data: body(program),
  })

  // The finisher is a workout day like any other — `optional: true` is what
  // keeps it out of the weekly quota — so it is seeded into the same
  // collection rather than treated as a special case.
  for (const day of [...planDays, coreCardioDay]) {
    out.push({
      path: `programs/${PROGRAM_ID}/workoutDays/${day.id}`,
      label: `workout day ${day.dayNumber} · ${day.label}`,
      data: body(day),
    })
  }

  for (const guide of guides) {
    out.push({
      path: `programs/${PROGRAM_ID}/guides/${guide.id}`,
      label: `guide · ${guide.title}`,
      data: body(guide),
    })
  }

  // `body(cohort)` spreads the fixture's own `coach`, so `--no-coach` has to
  // remove it rather than merely decline to override it.
  const cohortData: Record<string, unknown> = {
    ...body(cohort),
    programId: PROGRAM_ID,
    programVersion: program.version,
    // Three fields the fixture cannot be right about, overridden rather than
    // copied.
    //
    // `liveCall` because seeding one would put a fake Google Meet link on
    // every member's Home screen and a dead button is worse than no card —
    // it is a decision, so it starts null and the coach makes it. The count
    // because nothing in the app maintains it and a seeded 48 is a number
    // that is wrong from the first member who joins. `memberCount` is not
    // read by any screen (Chat counts the board projection), and it should
    // not start out lying either.
    liveCall: null,
    memberCount: 0,
    leaderboardVisible: false,
    // `--no-coach` leaves the block off the document entirely rather than
    // writing an empty one. The DM header falls back to "Your coach", which
    // is a complete header; a `coach` map full of empty strings would render
    // a blank name and read as a bug.
    ...(COACH ? { coach: COACH } : {}),
  }
  if (!COACH) delete cohortData.coach

  out.push({
    path: `cohorts/${COHORT_ID}`,
    label: `cohort · ${cohort.name}`,
    data: cohortData,
  })

  for (const announcement of announcements) {
    out.push({
      path: `cohorts/${COHORT_ID}/announcements/${announcement.id}`,
      label: `announcement · ${announcement.title}`,
      data: body(announcement),
    })
  }

  for (const notification of notificationSeed) {
    out.push({
      path: `cohorts/${COHORT_ID}/notifications/${notification.id}`,
      label: `notification · ${notification.title}`,
      data: body(notification),
    })
  }

  return out
}

// --- Run ----------------------------------------------------------------------
const run = async () => {
  const { credential, projectId } = credentials()
  initializeApp({ credential, projectId })
  const db: Firestore = getFirestore(DATABASE)

  const planned = plan()

  console.log(`project    ${projectId}`)
  console.log(`database   ${DATABASE}`)
  console.log(`program    programs/${PROGRAM_ID}`)
  console.log(`cohort     cohorts/${COHORT_ID}`)
  console.log(
    COACH ? `coach      ${COACH.name} · ${COACH.title}` : 'coach      (not written)',
  )
  console.log(`documents  ${planned.length}`)
  const mode = FORCE ? 'overwriting' : FILL ? 'filling gaps' : 'creating only'
  console.log(APPLY ? `\nAPPLY · ${mode}\n` : `\nDRY RUN · ${mode}\n`)

  let written = 0
  let skipped = 0

  // One document at a time rather than a batch. It is a one-off of well under a
  // hundred writes, and being able to name the document that failed is worth
  // more here than the round trips a batch would save.
  for (const item of planned) {
    const ref = db.doc(item.path)
    const snap = await ref.get()
    const exists = snap.exists

    if (exists && !FORCE) {
      if (!FILL) {
        skipped++
        console.log(`  skip   ${item.path}  (exists — --fill to add missing fields, --force to replace)`)
        continue
      }

      const current = snap.data() ?? {}
      const missing = Object.keys(item.data).filter((key) => current[key] === undefined)
      if (!missing.length) {
        skipped++
        console.log(`  ok     ${item.path}  (complete)`)
        continue
      }

      console.log(`  fill   ${item.path}  + ${missing.join(', ')}`)
      if (APPLY) {
        await ref.set(
          Object.fromEntries(missing.map((key) => [key, item.data[key]])),
          { merge: true },
        )
        written++
      }
      continue
    }

    console.log(`  ${exists ? 'over' : 'writ'}e  ${item.path}  ${item.label}`)
    if (APPLY) {
      // `set` without merge: the fixture is the whole document, and a merge
      // would leave fields from an older shape sitting underneath it.
      await ref.set(item.data)
      written++
    }
  }

  console.log('')
  if (!APPLY) {
    console.log(`Nothing written. ${planned.length - skipped} document(s) would be.`)
    console.log('Re-run with --apply once the plan above looks right.')
  } else {
    console.log(`Wrote ${written} document(s), skipped ${skipped}.`)
  }

  if (skipped && !FORCE && !FILL) {
    console.log(
      '\nSkipped documents already exist. After the first seed the console is the\n' +
        'source of truth, so a second run leaves coach edits alone. Pass --fill to add\n' +
        'only the fields they are missing, or --force to replace them outright.',
    )
  }

  console.log(
    '\nThe live call is not seeded as a decision: it is on the cohort document as\n' +
      '`liveCall`, and Home renders no card while it is null. Set it with\n' +
      '`bun run live-call -- --database=… --when="…" --url=…`, or in the console.',
  )
}

run().catch((cause) => {
  console.error(cause)
  process.exit(1)
})
