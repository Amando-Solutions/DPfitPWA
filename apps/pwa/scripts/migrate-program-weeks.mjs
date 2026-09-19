#!/usr/bin/env node
// =============================================================================
// Restructure a program's training plan from one flat list of days into dated
// weeks.
//
//   before   programs/{programId}/workoutDays/{dayId}
//            programs/{programId}.weekThemes[]
//
//   after    programs/{programId}/weeks/week-{n}                 weekNumber, title, subtitle,
//                                                                startDate, endDate
//            programs/{programId}/weeks/week-{n}/days/{dayId}    the day, plus weekNumber
//                                                                and its date
//
// The old shape had no dates in it. A day's `dayNumber` was its position in a
// seven-day week counted from whenever each member joined, so the same session
// fell on a different date for every member and "which week is the challenge
// in" had no single answer. The new shape carries the dates, which is what lets
// Home show the cohort's week and today's session as a date comparison.
//
// The dates are the old schedule made concrete: week 1 starts on the cohort's
// `startDate` (read in the cohort's own timezone), each week is seven days, and
// each day lands on its `dayNumber`-th day of its week. Every week gets a copy
// of every day under the same id, which is what keeps existing session logs
// pointing at a real day and the "every training day N times" badge counting.
//
// Three steps, each a separate decision, all dry-run unless `--apply`:
//
//   1. weeks     always. Writes the weeks and their days. Additive: the old
//                `workoutDays` stay, so an app build that still reads them keeps
//                working until the new one is deployed.
//
//   2. --restamp re-derives `weekNumber` on every member's sessions, photos and
//                check-ins against the new weeks. Their weeks used to count from
//                each member's join date and now count from the cohort's, so a
//                member who joined in week 3 has history filed under "week 1"
//                that the app would no longer recognise as this week's. Safe to
//                re-run: after the new app is live, run it once more to catch
//                anything the old build stamped in between.
//
//   3. --prune   deletes `workoutDays` and the program's `weekThemes` and
//                `workoutDayCount`. Only once the new app is deployed — phones
//                holding the old build read `workoutDays` until they update, and
//                an installed PWA can hold an old build for a while. Refuses if
//                any old day is not represented in the weeks.
//
//   node scripts/migrate-program-weeks.mjs --database=staging --program-id=recomp-six-week-v1
//   node scripts/migrate-program-weeks.mjs --database=staging --program-id=recomp-six-week-v1 --apply
//   node scripts/migrate-program-weeks.mjs --database=staging --program-id=recomp-six-week-v1 --restamp --apply
//   node scripts/migrate-program-weeks.mjs --database=staging --program-id=recomp-six-week-v1 --prune --apply
//
// Existing week and day documents are left alone unless `--force`, so a re-run
// never undoes dates a coach has since corrected in the console.
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
const FORCE = has('force')
const RESTAMP = has('restamp')
const PRUNE = has('prune')

const DATABASE = flag('database').trim()
const PROGRAM_ID = flag('program-id').trim()
const COHORT_ID = flag('cohort-id').trim()
const START_DATE = flag('start-date').trim()

/** Who the audit fields name. A script, said plainly, rather than a coach who did not do it. */
const ACTOR = 'system:migrate-program-weeks'

const usage = (message) => {
  console.error(
    `${message}\n\n` +
      '  node scripts/migrate-program-weeks.mjs --database=staging --program-id=recomp-six-week-v1 --apply\n\n' +
      '  --database=…        required; "(default)" has to be typed to reach production\n' +
      '  --program-id=…      required; the program to restructure\n' +
      '  --cohort-id=…       whose startDate is week 1, day 1 (default: the one cohort on this program)\n' +
      '  --start-date=…      YYYY-MM-DD, instead of reading a cohort\n' +
      '  --force             replace week and day documents that already exist\n' +
      '  --restamp           re-derive weekNumber on members\' sessions, photos and check-ins\n' +
      '  --prune             delete the old workoutDays and weekThemes (after the new app is live)\n' +
      '  --apply             actually write (otherwise this is a dry run)\n',
  )
  process.exit(1)
}

// Required and with no default, for the same reason as every other script here:
// a project holds several databases and production has to be named out loud.
if (!DATABASE) usage('Pass --database. It is required and deliberately has no default.')
if (!PROGRAM_ID) usage('Pass --program-id, e.g. --program-id=recomp-six-week-v1.')

// --- Dates --------------------------------------------------------------------
//
// Calendar dates as `YYYY-MM-DD` strings throughout, matching what the app
// stores and compares. Arithmetic happens in UTC on the date alone, so no clock
// change can turn a day into 23 hours and shift everything after it.
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

const isDateKey = (value) =>
  typeof value === 'string' &&
  DATE_KEY.test(value) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value

const addDays = (key, n) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/**
 * The calendar date an instant falls on, in a named timezone.
 *
 * The reason this cannot be `toISOString().slice(0, 10)`: cohort-01 starts at
 * midnight in Lagos, which is 23:00 the previous evening in UTC, and slicing the
 * ISO string would start the whole block a day early.
 */
const dateKeyIn = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type) => parts.find((p) => p.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

/** Same rule as `weekAt` in `app/lib/domain/challenge.ts`. Keep the two in step. */
const weekNumberAt = (weeks, key) => {
  let current = null
  for (const week of weeks) if (week.startDate <= key) current = week
  return (current ?? weeks[0])?.weekNumber ?? 1
}

if (START_DATE && !isDateKey(START_DATE)) {
  usage(`--start-date must be a real date as YYYY-MM-DD. Got: ${START_DATE}`)
}

// --- Credentials -------------------------------------------------------------
// `allow write: if isCoach()` on `programs`, and step 2 writes into every
// member's subcollections, so this needs the Admin SDK. Same handling as
// `seed-program.ts`.
const readEnvFile = () => {
  try {
    const out = {}
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
    'No credentials. Set NUXT_FIREBASE_SERVICE_ACCOUNT in .env (base64 of the key JSON),\n' +
      'or export GOOGLE_APPLICATION_CREDENTIALS pointing at the JSON file.\n',
  )
  process.exit(1)
}

// --- Writes --------------------------------------------------------------------
/**
 * Batched, in chunks under Firestore's 500-write ceiling.
 *
 * The schedule for a six-week block is well under one chunk, so steps 1 and 3
 * each land atomically: the app never reads half a set of weeks. Step 2 is
 * chunked per member, and a member's history is also far under a chunk.
 */
const commitAll = async (db, writes) => {
  for (let i = 0; i < writes.length; i += 450) {
    const batch = db.batch()
    for (const write of writes.slice(i, i + 450)) write(batch)
    await batch.commit()
  }
}

// --- Step 1: weeks ---------------------------------------------------------------
const resolveStart = async (db) => {
  if (START_DATE) return { startKey: START_DATE, source: '--start-date', cohorts: [] }

  let cohorts
  if (COHORT_ID) {
    const snap = await db.doc(`cohorts/${COHORT_ID}`).get()
    if (!snap.exists) usage(`cohorts/${COHORT_ID} does not exist in ${DATABASE}.`)
    cohorts = [snap]
    if (snap.get('programId') !== PROGRAM_ID) {
      console.warn(
        `! cohorts/${COHORT_ID} names programId "${snap.get('programId')}", not "${PROGRAM_ID}". ` +
          'Using its start date anyway because you named it.\n',
      )
    }
  } else {
    cohorts = (await db.collection('cohorts').where('programId', '==', PROGRAM_ID).get()).docs
    if (cohorts.length !== 1) {
      usage(
        cohorts.length
          ? `${cohorts.length} cohorts run ${PROGRAM_ID} (${cohorts.map((c) => c.id).join(', ')}). ` +
              'Dates belong to one run of a program, so name its cohort with --cohort-id.'
          : `No cohort runs ${PROGRAM_ID}, so there is no start date to read. Pass --start-date=YYYY-MM-DD.`,
      )
    }
  }

  const cohort = cohorts[0]
  const startDate = cohort.get('startDate')
  if (typeof startDate?.toDate !== 'function') {
    usage(`cohorts/${cohort.id} has no startDate timestamp. Pass --start-date=YYYY-MM-DD.`)
  }
  const timeZone = cohort.get('timezone') || 'UTC'
  if (!cohort.get('timezone')) {
    console.warn(`! cohorts/${cohort.id} has no timezone; reading its start date in UTC.\n`)
  }
  return {
    startKey: dateKeyIn(startDate.toDate(), timeZone),
    source: `cohorts/${cohort.id}.startDate (${timeZone})`,
    cohorts,
  }
}

/** The weeks already written, with their days, keyed by document id. */
const readExistingWeeks = async (programRef) => {
  const out = new Map()
  for (const week of (await programRef.collection('weeks').get()).docs) {
    const days = (await week.ref.collection('days').get()).docs
    out.set(week.id, { data: week.data(), days: new Map(days.map((d) => [d.id, d.data()])) })
  }
  return out
}

const planWeeks = ({ program, legacyDays, startKey, now }) => {
  const themes = Array.isArray(program.weekThemes) ? program.weekThemes : []
  const totalWeeks = Number(program.totalWeeks) || themes.length
  if (!totalWeeks) {
    usage(`programs/${PROGRAM_ID} has neither totalWeeks nor weekThemes, so there is no count of weeks to build.`)
  }

  const badDays = legacyDays.filter((d) => {
    const n = d.data().dayNumber
    return !Number.isInteger(n) || n < 1 || n > 7
  })
  if (badDays.length) {
    usage(
      'These days have a dayNumber outside 1–7, so there is no day of the week to date them to:\n' +
        badDays.map((d) => `  workoutDays/${d.id}  dayNumber=${JSON.stringify(d.data().dayNumber)}`).join('\n') +
        '\nFix them in the console and re-run.',
    )
  }

  const ordered = [...legacyDays].sort((a, b) => a.data().dayNumber - b.data().dayNumber)

  return Array.from({ length: totalWeeks }, (_, i) => {
    const weekNumber = i + 1
    const theme = themes.find((t) => t?.weekNumber === weekNumber)
    const startDate = addDays(startKey, i * 7)
    return {
      id: `week-${weekNumber}`,
      data: {
        weekNumber,
        title: theme?.title ?? '',
        subtitle: theme?.subtitle ?? '',
        startDate,
        endDate: addDays(startDate, 6),
        createdAt: now,
        createdByUid: ACTOR,
        createdByEmail: ACTOR,
        updatedAt: now,
        updatedByUid: ACTOR,
        updatedByEmail: ACTOR,
      },
      days: ordered.map((day) => {
        const data = day.data()
        return {
          id: day.id,
          // Everything the coach authored, as it was — exercises, hero image,
          // `optional` — with the two fields that place it on the calendar.
          // `createdAt`/`createdBy*` stay the coach's; the update is ours.
          data: {
            ...data,
            weekNumber,
            date: addDays(startDate, data.dayNumber - 1),
            updatedAt: now,
            updatedByUid: ACTOR,
            updatedByEmail: ACTOR,
          },
        }
      }),
    }
  })
}

// --- Step 2: restamp -----------------------------------------------------------
const restamp = async ({ db, schedule, cohorts }) => {
  // Everyone whose program this is: by the member's own programId, and by
  // cohort for members whose programId is blank — the app falls back to the
  // cohort's for those, so their weeks come from this schedule too.
  const cohortIds = new Set(
    (await db.collection('cohorts').where('programId', '==', PROGRAM_ID).get()).docs.map((c) => c.id),
  )
  for (const c of cohorts) cohortIds.add(c.id)
  const timezones = new Map()
  for (const id of cohortIds) {
    timezones.set(id, (await db.doc(`cohorts/${id}`).get()).get('timezone') || 'UTC')
  }

  const members = new Map()
  for (const m of (await db.collection('members').where('programId', '==', PROGRAM_ID).get()).docs) {
    members.set(m.id, m)
  }
  for (const id of cohortIds) {
    for (const m of (await db.collection('members').where('cohortId', '==', id).get()).docs) {
      const programId = (m.get('programId') ?? '').trim()
      if (!programId || programId === PROGRAM_ID) members.set(m.id, m)
    }
  }

  console.log(`\nStep 2 · restamp weekNumber · ${members.size} member(s)\n`)

  let changed = 0
  let collisions = 0

  for (const member of members.values()) {
    const timeZone = timezones.get(member.get('cohortId')) || 'UTC'
    const weekOf = (ts) => weekNumberAt(schedule, dateKeyIn(ts.toDate(), timeZone))
    const writes = []
    const lines = []

    for (const [collection, field] of [
      ['sessions', 'completedAt'],
      ['photos', 'takenAt'],
    ]) {
      for (const snap of (await member.ref.collection(collection).get()).docs) {
        const at = snap.get(field)
        if (typeof at?.toDate !== 'function') continue
        const next = weekOf(at)
        const was = snap.get('weekNumber')
        if (next === was) continue
        lines.push(`    ${collection}/${snap.id}  week ${was} → ${next}`)
        writes.push((batch) => batch.update(snap.ref, { weekNumber: next }))
      }
    }

    // A check-in's id is its week, which is what makes it one per week, so a
    // changed week is a move rather than a field update. Two check-ins that
    // land in the same new week cannot both have it; those are reported and
    // left exactly as they are for a person to decide.
    const checkInRef = (id) => member.ref.collection('checkIns').doc(id)
    const checkIns = (await member.ref.collection('checkIns').get()).docs
    const planned = checkIns
      .filter((snap) => typeof snap.get('submittedAt')?.toDate === 'function')
      .map((snap) => {
        const next = weekOf(snap.get('submittedAt'))
        return { snap, next, target: `week-${next}` }
      })

    // Ids that keep the document they hold: anything unstamped, anything
    // already under the right id, and both sides of a collision.
    const staying = new Set(checkIns.map((c) => c.id))
    for (const p of planned) if (p.snap.id !== p.target) staying.delete(p.snap.id)

    const byTarget = new Map()
    for (const p of planned) byTarget.set(p.target, [...(byTarget.get(p.target) ?? []), p])
    const collided = new Set()
    for (const [target, group] of byTarget) {
      if (group.length < 2) continue
      collisions++
      lines.push(
        `    ! checkIns ${group.map((p) => p.snap.id).join(' and ')} both fall in ${target}; left as they are`,
      )
      for (const p of group) {
        staying.add(p.snap.id)
        collided.add(p.snap.id)
      }
    }

    // A move onto an id whose document is staying would overwrite it. Blocking
    // one move keeps its source in place, which can block a move onto *that*
    // id, so settle until nothing changes.
    let moves = planned.filter((p) => !staying.has(p.snap.id))
    for (let settled = false; !settled; ) {
      settled = true
      for (const p of moves) {
        if (staying.has(p.target) && !staying.has(p.snap.id)) {
          staying.add(p.snap.id)
          settled = false
          collisions++
          lines.push(
            `    ! checkIns/${p.snap.id} belongs in ${p.target}, which another check-in keeps; left as it is`,
          )
        }
      }
      moves = moves.filter((p) => !staying.has(p.snap.id))
    }

    // Each path is written at most once: a moved-from id that another move
    // lands on is overwritten by that move instead of being deleted.
    const landing = new Set(moves.map((p) => p.target))
    for (const p of moves) {
      lines.push(`    checkIns/${p.snap.id} → checkIns/${p.target}`)
      writes.push((batch) => batch.set(checkInRef(p.target), { ...p.snap.data(), weekNumber: p.next }))
      if (!landing.has(p.snap.id)) writes.push((batch) => batch.delete(p.snap.ref))
    }
    for (const p of planned) {
      const was = p.snap.get('weekNumber')
      if (p.snap.id !== p.target || collided.has(p.snap.id) || was === p.next) continue
      lines.push(`    checkIns/${p.snap.id}  week ${was} → ${p.next}`)
      writes.push((batch) => batch.update(p.snap.ref, { weekNumber: p.next }))
    }

    if (!lines.length) continue
    changed += writes.length
    const name = member.get('profile')?.displayName || '(no name)'
    console.log(`  members/${member.id}  ${name}`)
    for (const line of lines) console.log(line)
    if (APPLY && writes.length) await commitAll(db, writes)
  }

  console.log(
    changed
      ? `\n  ${changed} write(s) ${APPLY ? 'applied' : 'planned'}.`
      : '\n  Every weekNumber already matches the schedule.',
  )
  if (collisions) {
    console.log(
      `  ${collisions} check-in collision(s) left untouched. Each is two check-ins in one\n` +
        '  cohort week; keep one in the console and delete the other.',
    )
  }
}

// --- Step 3: prune ---------------------------------------------------------------
const prune = async ({ db, programRef, program, legacyDays, weeksAfter }) => {
  console.log('\nStep 3 · prune the old shape\n')

  // Nothing is deleted that the weeks do not carry: every old day id has to be
  // present in at least one week, or its exercises would be gone.
  const carried = new Set([...weeksAfter.values()].flatMap((w) => [...w.days.keys()]))
  const lost = legacyDays.filter((d) => !carried.has(d.id))
  if (!weeksAfter.size || lost.length) {
    console.error(
      weeksAfter.size
        ? `  Refusing: ${lost.map((d) => `workoutDays/${d.id}`).join(', ')} not in any week.`
        : '  Refusing: there are no weeks to prune down to. Run step 1 first.',
    )
    process.exitCode = 1
    return
  }

  const writes = legacyDays.map((day) => {
    console.log(`  delete  programs/${PROGRAM_ID}/workoutDays/${day.id}`)
    return (batch) => batch.delete(day.ref)
  })
  const legacyFields = ['weekThemes', 'workoutDayCount'].filter((f) => program[f] !== undefined)
  if (legacyFields.length) {
    console.log(`  unset   programs/${PROGRAM_ID}  ${legacyFields.join(', ')}`)
    writes.push((batch) =>
      batch.update(programRef, {
        ...Object.fromEntries(legacyFields.map((f) => [f, FieldValue.delete()])),
        updatedAt: FieldValue.serverTimestamp(),
        updatedByUid: ACTOR,
        updatedByEmail: ACTOR,
      }),
    )
  }
  if (!writes.length) {
    console.log('  Nothing left of the old shape.')
    return
  }
  if (APPLY) await commitAll(db, writes)
}

// --- Run ----------------------------------------------------------------------
const run = async () => {
  const { credential, projectId } = credentials()
  initializeApp({ credential, projectId })
  const db = getFirestore(DATABASE)

  const programRef = db.doc(`programs/${PROGRAM_ID}`)
  const programSnap = await programRef.get()
  if (!programSnap.exists) usage(`programs/${PROGRAM_ID} does not exist in ${DATABASE}.`)
  const program = programSnap.data()

  const legacyDays = (await programRef.collection('workoutDays').get()).docs
  const existing = await readExistingWeeks(programRef)

  console.log(`project    ${projectId}`)
  console.log(`database   ${DATABASE}`)
  console.log(`program    programs/${PROGRAM_ID} · ${program.name ?? ''}`)
  console.log(`old shape  ${legacyDays.length} workoutDays`)
  console.log(`new shape  ${existing.size} weeks already written`)
  console.log(APPLY ? '\nAPPLY\n' : '\nDRY RUN · nothing is written without --apply\n')

  // `weeksAfter` is the database as it will stand once step 1 has run, which
  // is what steps 2 and 3 have to judge against — in a dry run as much as for
  // real, or the plan printed would not be the plan applied.
  const weeksAfter = new Map(existing)
  let cohorts = []

  console.log('Step 1 · weeks and their days\n')
  if (!legacyDays.length) {
    console.log('  No workoutDays to build from — already pruned, or never seeded. Skipping.')
  } else {
    const start = await resolveStart(db)
    cohorts = start.cohorts
    console.log(`  week 1 starts ${start.startKey}  (from ${start.source})\n`)

    const planned = planWeeks({
      program,
      legacyDays,
      startKey: start.startKey,
      now: new Date(),
    })
    const writes = []
    let skipped = 0

    for (const week of planned) {
      const had = existing.get(week.id)
      const weekRef = programRef.collection('weeks').doc(week.id)
      const title = week.data.title ? ` · ${week.data.title}` : ''
      if (had && !FORCE) {
        skipped++
        console.log(`  skip   weeks/${week.id}  (exists — --force to replace)`)
      } else {
        console.log(
          `  ${had ? 'over' : 'writ'}e  weeks/${week.id}  ${week.data.startDate} → ${week.data.endDate}${title}`,
        )
        writes.push((batch) => batch.set(weekRef, week.data))
      }

      // A week left in place keeps its own dates, which a coach may have moved;
      // a day added beneath it is dated from those rather than from the plan.
      const keptStart = had && !FORCE && isDateKey(had.data.startDate) ? had.data.startDate : null
      const daysAfter = new Map(had?.days ?? [])
      for (const day of week.days) {
        const hadDay = had?.days.has(day.id)
        if (hadDay && !FORCE) {
          skipped++
          continue
        }
        if (keptStart) day.data.date = addDays(keptStart, day.data.dayNumber - 1)
        const optional = day.data.optional ? ' (optional)' : ''
        console.log(
          `           days/${day.id.padEnd(12)} ${day.data.date}  day ${day.data.dayNumber} · ${day.data.label}${optional}`,
        )
        writes.push((batch) => batch.set(weekRef.collection('days').doc(day.id), day.data))
        daysAfter.set(day.id, day.data)
      }
      weeksAfter.set(week.id, {
        data: had && !FORCE ? had.data : week.data,
        days: daysAfter,
      })
    }

    const last = planned[planned.length - 1]
    for (const cohort of cohorts) {
      const end = cohort.get('endDate')
      const timeZone = cohort.get('timezone') || 'UTC'
      const endKey = typeof end?.toDate === 'function' ? dateKeyIn(end.toDate(), timeZone) : null
      if (last && endKey && endKey !== last.data.endDate) {
        console.log(
          `\n  note   cohorts/${cohort.id}.endDate is ${endKey}; the schedule ends ${last.data.endDate}.\n` +
            '         Nothing reads endDate for the calendar, but correct it in the console if it is wrong.',
        )
      }
    }

    console.log(
      `\n  ${writes.length} write(s) ${APPLY ? 'applied' : 'planned'}, ${skipped} existing document(s) left alone.`,
    )
    if (APPLY && writes.length) await commitAll(db, writes)
  }

  if (RESTAMP) {
    const schedule = [...weeksAfter.values()]
      .map((w) => w.data)
      .filter((w) => Number.isInteger(w.weekNumber) && isDateKey(w.startDate))
      .sort((a, b) => a.weekNumber - b.weekNumber)
    if (!schedule.length) {
      console.error('\nStep 2 · restamp: there are no dated weeks to stamp against. Run step 1 first.')
      process.exitCode = 1
    } else {
      if (!cohorts.length) {
        cohorts = (await db.collection('cohorts').where('programId', '==', PROGRAM_ID).get()).docs
      }
      await restamp({ db, schedule, cohorts })
    }
  }

  if (PRUNE) await prune({ db, programRef, program, legacyDays, weeksAfter })

  console.log('')
  if (!APPLY) console.log('Nothing written. Re-run with --apply once the plan above looks right.')
  if (!RESTAMP || !PRUNE) {
    console.log(
      '\nOrder of operations:\n' +
        '  1. --apply              write the weeks (the old app keeps working)\n' +
        '  2. deploy the app build that reads weeks\n' +
        '  3. --restamp --apply    re-file members\' history under the cohort\'s weeks\n' +
        '  4. --prune --apply      once installed apps have picked up the new build',
    )
  }
}

run().catch((cause) => {
  console.error(cause)
  process.exit(1)
})
