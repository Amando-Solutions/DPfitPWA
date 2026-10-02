// =============================================================================
// The member writes that are locked to a day or a week.
//
//   setRegion      where the member's days turn over, forward only
//   logSession     a workout, against the day-lock
//   submitCheckIn  a week's check-in, filed on the Cohort Clock
//   logPhoto       a progress photo, filed on the Cohort Clock
//
// These used to be client writes, and the day they were filed under came off
// the phone: its clock, and its time zone. Both belong to the phone's owner.
// Here the time is the server's and the zone is the one stored on the member
// (for what is open) or on the cohort (for which week), and the rules refuse
// the same writes from a browser. `day-lock.ts` is the logic; this file reads
// and writes around it.
//
// Every document written here is one the member app reads through its own
// types (`SessionLogDoc`, `CheckInDoc`, `ProgressPhotoDoc` and `MemberRegion` in
// `apps/pwa/app/data/types.ts`), restated as plain objects. Two shapes, one
// contract — if you change one, change both.
// =============================================================================
import {
  FieldValue,
  Timestamp,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
} from 'firebase-admin/firestore'
import { HttpsError, type CallableRequest } from 'firebase-functions/https'
import {
  cohortOver,
  cohortWeekAt,
  cohortZoneOf,
  canonicalZone,
  dateKeyIn,
  dayLabel,
  isDateKey,
  type DateKey,
} from './calendar.js'
import { DATABASES, database, type DatabaseId } from './databases.js'
import {
  memberDay,
  sessionGate,
  sessionId,
  switchRegion,
  type GateRefusal,
  type LoggedRef,
  type PlanDay,
  type PlanWeek,
  type StoredRegion,
} from './day-lock.js'
import { resolveRegion } from './regions.js'

// --- Who is asking -----------------------------------------------------------

export interface MemberCaller {
  uid: string
  email: string
  db: Firestore
  memberRef: DocumentReference
  /** Read outside any transaction, for what cannot change under one: cohort, program. */
  member: DocumentSnapshot
}

const readDatabase = (raw: unknown): DatabaseId => {
  const id = (raw as { database?: unknown } | null)?.database ?? '(default)'
  if (!DATABASES.includes(id as DatabaseId)) {
    throw new HttpsError('invalid-argument', `\`database\` must be one of: ${DATABASES.join(', ')}.`)
  }
  return id as DatabaseId
}

/**
 * The same standing `signedIn()` asks of a member in `firestore.rules`, which a
 * function bypasses and so has to ask again: the account's latest sign-in, the
 * email the membership was made with, and a sign-in the account trusts.
 *
 * Shared with `joinCohort` in `memberships.ts`, which asks the same of a member
 * moving to their next cohort.
 */
export const identifyMember = async (request: CallableRequest): Promise<MemberCaller> => {
  const auth = request.auth
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in first.')
  const db = database(readDatabase(request.data))
  const memberRef = db.doc(`members/${auth.uid}`)

  const [signIn, member] = await Promise.all([db.doc(`signIns/${auth.uid}`).get(), memberRef.get()])
  if (!signIn.exists || signIn.get('authTime') !== auth.token.auth_time) {
    throw new HttpsError('permission-denied', 'This account is signed in on another device.', {
      reason: 'signed-in-elsewhere',
    })
  }
  if (!member.exists) {
    throw new HttpsError('failed-precondition', 'No membership on this account yet.')
  }

  const email = String(auth.token.email ?? '')
  const bound = String(member.get('email') ?? '')
  if (bound && bound.toLowerCase() !== email.toLowerCase()) {
    throw new HttpsError('permission-denied', 'This account no longer matches its membership.')
  }
  const google = auth.token.firebase?.sign_in_provider === 'google.com'
  if (google && auth.token.email_verified !== true && member.get('joinedWith') !== undefined) {
    throw new HttpsError('permission-denied', 'Sign in with your email and password.')
  }

  return { uid: auth.uid, email, db, memberRef, member }
}

// --- What the member is on ---------------------------------------------------

/**
 * Whether a log belongs to the cohort the member is active in.
 *
 * A member keeps the logs of every cohort they have been in, each tagged with
 * its `cohortId` (see `memberships.ts`), and only the active cohort's count
 * towards what is open, logged or due. One with no tag was written before the
 * field existed, in the cohort they are still in.
 */
export const ofCohort = (log: { get: (field: string) => unknown }, cohortId: string): boolean =>
  ((log.get('cohortId') as string | undefined) || cohortId) === cohortId

/** `members/{uid}.region` as stored, or `null` when it is absent or unusable. */
const regionOf = (member: DocumentSnapshot): StoredRegion | null => {
  const raw = member.get('region') as Record<string, unknown> | undefined
  const timezone = canonicalZone(raw?.timezone)
  if (!raw || typeof raw.id !== 'string' || !timezone) return null
  return { id: raw.id, timezone, floor: isDateKey(raw.floor) ? raw.floor : null }
}

interface Cohort {
  zone: string
  /** Training opens on this day, on the cohort's calendar. */
  opensOn: DateKey | null
  programId: string
}

const readCohort = async (caller: MemberCaller): Promise<Cohort> => {
  const cohortId = String(caller.member.get('cohortId') ?? '')
  if (!cohortId || cohortId.includes('/')) {
    throw new HttpsError('failed-precondition', 'This membership has no cohort.')
  }
  const snap = await caller.db.doc(`cohorts/${cohortId}`).get()
  const zone = cohortZoneOf(snap.get('timezone'))
  const start = snap.get('startDate')

  // Every write here reads the cohort first, so this one check closes all four
  // once the cohort is over — for an app that has not heard yet, and for a call
  // made by hand.
  if (cohortOver(snap.data() ?? {}, new Date())) {
    throw new HttpsError('failed-precondition', 'Your cohort has ended, so training and chat are closed.', {
      reason: 'cohort-ended',
    })
  }

  return {
    zone,
    opensOn: start instanceof Timestamp ? dateKeyIn(start.toDate(), zone) : null,
    programId: String(snap.get('programId') ?? '').trim(),
  }
}

interface Program {
  id: string
  version: number
  qualifyingSetPercent: number
  values: { workout: number; checkIn: number; progressPhoto: number }
  weeks: PlanWeek[]
}

const DEFAULT_QUALIFYING_PERCENT = 80

const validPercent = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 100 ? value : null

const points = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0

/**
 * The member's program, its reward values and its dated weeks, read the way
 * `FirestoreDataSource` reads them: the member's pin, else the cohort's; the
 * platform threshold, else the program's, else 80; weeks with unusable dates
 * left off the schedule.
 */
const readProgram = async (caller: MemberCaller, cohort: Cohort, withDays: boolean): Promise<Program> => {
  const id = String(caller.member.get('programId') ?? '').trim() || cohort.programId
  if (!id || id.includes('/')) {
    throw new HttpsError('failed-precondition', 'This cohort has no program attached.')
  }
  const [snap, settings, weekSnap] = await Promise.all([
    caller.db.doc(`programs/${id}`).get(),
    caller.db.doc('settings/platform').get(),
    caller.db.collection(`programs/${id}/weeks`).get(),
  ])
  if (!snap.exists) throw new HttpsError('failed-precondition', 'This cohort has no program attached.')

  const weeks = weekSnap.docs
    .map((doc) => ({
      id: doc.id,
      weekNumber: doc.get('weekNumber') as unknown,
      startDate: doc.get('startDate') as unknown,
      endDate: doc.get('endDate') as unknown,
    }))
    .filter(
      (w): w is { id: string; weekNumber: number; startDate: DateKey; endDate: DateKey } =>
        Number.isInteger(w.weekNumber) &&
        (w.weekNumber as number) >= 1 &&
        isDateKey(w.startDate) &&
        isDateKey(w.endDate) &&
        w.endDate >= w.startDate,
    )
    .sort((a, b) => a.weekNumber - b.weekNumber)

  const withTheirDays = await Promise.all(
    weeks.map(async (week): Promise<PlanWeek> => {
      if (!withDays) return { ...week, days: [] }
      const days = await caller.db.collection(`programs/${id}/weeks/${week.id}/days`).get()
      return {
        ...week,
        days: days.docs.map(
          (doc): PlanDay => ({
            id: doc.id,
            date: String(doc.get('date') ?? ''),
            dayNumber: Number(doc.get('dayNumber') ?? 0) || 0,
            label: String(doc.get('label') ?? 'Workout'),
            optional: doc.get('optional') === true,
          }),
        ),
      }
    }),
  )

  const values = (snap.get('rewards.values') ?? {}) as Record<string, unknown>
  return {
    id,
    version: Number(snap.get('version') ?? caller.member.get('programVersion') ?? 0) || 0,
    qualifyingSetPercent:
      validPercent(settings.get('qualifyingSetPercent')) ??
      validPercent(snap.get('qualifyingSetPercent')) ??
      DEFAULT_QUALIFYING_PERCENT,
    values: {
      workout: points(values.workout),
      checkIn: points(values.checkIn),
      progressPhoto: points(values.progressPhoto),
    },
    weeks: withTheirDays,
  }
}

// --- Reading what was sent ---------------------------------------------------

const invalid = (message: string) => new HttpsError('invalid-argument', message)

const text = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.slice(0, max) : ''

const number = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 100_000) {
    throw invalid(`\`${field}\` must be a number.`)
  }
  return value
}

const numberOrNull = (value: unknown, field: string): number | null =>
  value === null || value === undefined ? null : number(value, field)

const list = (value: unknown, field: string, max: number): unknown[] => {
  if (!Array.isArray(value) || value.length > max) throw invalid(`\`${field}\` must be a list.`)
  return value
}

const SET_TYPES = ['warmup', 'normal', 'failure', 'drop']

/** A `LoggedExercise`, with nothing the type does not name. */
const readExercise = (raw: unknown) => {
  const e = (raw ?? {}) as Record<string, unknown>
  return {
    id: text(e.id, 120),
    name: text(e.name, 200),
    muscleGroup: text(e.muscleGroup, 60),
    restSeconds: number(e.restSeconds ?? 0, 'restSeconds'),
    note: text(e.note, 2000),
    ...(Number.isInteger(e.setsPrescribed) && { setsPrescribed: e.setsPrescribed as number }),
    sets: list(e.sets ?? [], 'sets', 60).map((raw) => {
      const s = (raw ?? {}) as Record<string, unknown>
      return {
        reps: number(s.reps ?? 0, 'reps'),
        weightKg: number(s.weightKg ?? 0, 'weightKg'),
        done: s.done === true,
        added: s.added === true,
        setType: SET_TYPES.includes(s.setType as string) ? (s.setType as string) : 'normal',
        previousWeightKg: numberOrNull(s.previousWeightKg, 'previousWeightKg'),
        previousReps: numberOrNull(s.previousReps, 'previousReps'),
      }
    }),
  }
}

type Exercise = ReturnType<typeof readExercise>

/**
 * A `StoredImage` the member uploaded to their own folder, or `null`. Only the
 * path is checked for ownership: the upload itself went through
 * `storage.rules`, which is what decided who could put it there.
 */
const readImage = (raw: unknown, uid: string, folder: 'proof' | 'progress') => {
  if (raw === null || raw === undefined) return null
  const i = raw as Record<string, unknown>
  const storagePath = text(i.storagePath, 500)
  const downloadUrl = text(i.downloadUrl, 2000)
  if (!storagePath.startsWith(`members/${uid}/${folder}/`) || !/^https:\/\//.test(downloadUrl)) {
    throw invalid('That image is not one of your uploads.')
  }
  return {
    storagePath,
    downloadUrl,
    width: number(i.width ?? 0, 'width'),
    height: number(i.height ?? 0, 'height'),
    bytes: number(i.bytes ?? 0, 'bytes'),
  }
}

/** As `prescribedSets` in the member app. */
const prescribedSets = (e: Exercise) =>
  e.setsPrescribed ?? e.sets.filter((set) => !set.added).length

const REFUSAL_CODE: Record<GateRefusal, 'failed-precondition' | 'not-found' | 'already-exists'> = {
  'before-start': 'failed-precondition',
  'not-open-yet': 'failed-precondition',
  'not-in-plan': 'not-found',
  'already-logged': 'already-exists',
}

/** Firestore's ALREADY_EXISTS, which a `create` over an existing document commits as. */
const alreadyExists = (cause: unknown) => (cause as { code?: unknown } | null)?.code === 6

// --- setRegion ---------------------------------------------------------------

/**
 * Set where the member's days turn over.
 *
 * Request data: `{ database?, region: { id, timezone } }`. `timezone` is read
 * only for the options that ask for one. Resolves to `{ changed }`.
 */
export interface SetRegionResult {
  changed: boolean
  /** As stored, with `since` in epoch milliseconds. */
  region: { id: string; timezone: string; floor: DateKey | null; sinceMs: number }
}

export const setRegionHandler = async (request: CallableRequest): Promise<SetRegionResult> => {
  const caller = await identifyMember(request)
  const sent = (request.data as { region?: { id?: unknown; timezone?: unknown } } | null)?.region
  const choice = resolveRegion(sent?.id, sent?.timezone)
  if (!choice) throw invalid('Pick a region from the list.')

  const cohort = await readCohort(caller)
  return caller.db.runTransaction(async (tx) => {
    const now = new Date()
    const member = await tx.get(caller.memberRef)
    const current = regionOf(member)
    if (current?.id === choice.id && current.timezone === choice.timezone) {
      const since = member.get('region.since') as Timestamp | undefined
      return { changed: false, region: { ...current, sinceMs: since?.toMillis() ?? now.getTime() } }
    }

    const next = switchRegion(now, current, choice, cohort.zone)
    tx.update(caller.memberRef, {
      region: { ...next, since: Timestamp.fromDate(now) },
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUid: caller.uid,
      updatedByEmail: caller.email,
    })
    return { changed: true, region: { ...next, sinceMs: now.getTime() } }
  })
}

// --- logSession --------------------------------------------------------------

/**
 * Log a finished workout.
 *
 * Request data: `{ database?, session: { dayId, planWeek, durationSeconds,
 * note, proofPhoto, exercises } }`. Everything else on the document — its day,
 * week, time, totals, and whether it qualifies — is decided here, and comes
 * back as a `LogSessionResult` so the member app can show what was stored
 * without reading it again.
 */
export interface LogSessionResult {
  id: string
  dayNumber: number
  label: string
  weekNumber: number
  planWeek: number
  dayKey: DateKey
  completedAtMs: number
  setsDone: number
  setsTotal: number
  volumeKg: number
  qualifies: boolean
  rewardPoints: number
  loggedCore: boolean
  loggedCardio: boolean
  programId: string
  programVersion: number
}

export const logSessionHandler = async (request: CallableRequest): Promise<LogSessionResult> => {
  const caller = await identifyMember(request)
  const raw = ((request.data as { session?: unknown } | null)?.session ?? {}) as Record<string, unknown>

  const dayId = text(raw.dayId, 120)
  const planWeek = raw.planWeek
  if (!dayId || dayId.includes('/') || !Number.isInteger(planWeek)) {
    throw invalid('`dayId` and `planWeek` are required.')
  }
  const exercises = list(raw.exercises, 'exercises', 40).map(readExercise)
  const proofPhoto = readImage(raw.proofPhoto, caller.uid, 'proof')
  const durationSeconds = Math.max(0, Math.min(number(raw.durationSeconds ?? 0, 'durationSeconds'), 86_400))

  const cohort = await readCohort(caller)
  const program = await readProgram(caller, cohort, true)

  // The totals, from the sets themselves rather than from what the phone added up.
  const setsTotal = exercises.reduce((n, e) => n + e.sets.length, 0)
  const setsDone = exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0)
  const volumeKg = Math.round(
    exercises.reduce(
      (n, e) => n + e.sets.filter((s) => s.done).reduce((v, s) => v + s.weightKg * s.reps, 0),
      0,
    ),
  )
  const denominator = exercises.reduce((n, e) => n + prescribedSets(e), 0) || setsTotal
  const qualifies = denominator > 0 && (setsDone / denominator) * 100 >= program.qualifyingSetPercent
  const rewardPoints = qualifies ? program.values.workout : 0
  const loggedIn = (group: string) =>
    exercises.some((e) => e.muscleGroup.toLowerCase() === group && e.sets.some((s) => s.done))

  const sessions = caller.memberRef.collection('sessions')
  try {
    return await caller.db.runTransaction(async (tx) => {
      const now = new Date()
      const [member, logged] = await Promise.all([
        tx.get(caller.memberRef),
        tx.get(sessions.where('dayId', '==', dayId)),
      ])

      const cohortId = String(member.get('cohortId'))
      const gate = sessionGate({
        now,
        region: regionOf(member),
        cohortZone: cohort.zone,
        opensOn: cohort.opensOn,
        weeks: program.weeks,
        // The same day in a cohort they were in before is not this one logged.
        logged: logged.docs.filter((doc) => ofCohort(doc, cohortId)).map(
          (doc): LoggedRef => ({
            dayId: String(doc.get('dayId')),
            weekNumber: Number(doc.get('weekNumber')),
            planWeek: Number.isInteger(doc.get('planWeek')) ? doc.get('planWeek') : undefined,
            dayKey: isDateKey(doc.get('dayKey')) ? doc.get('dayKey') : undefined,
            completedAtMs: (doc.get('completedAt') as Timestamp | undefined)?.toMillis() ?? 0,
          }),
        ),
        dayId,
        planWeek: planWeek as number,
      })
      if (!gate.ok) {
        throw new HttpsError(REFUSAL_CODE[gate.reason], gate.message, { reason: gate.reason })
      }

      const completedAt = Timestamp.fromDate(now)
      const ref = sessions.doc(sessionId(gate))
      const decided = {
        dayNumber: gate.day.dayNumber,
        label: gate.day.label,
        weekNumber: gate.weekNumber,
        planWeek: gate.planWeek,
        dayKey: gate.dayKey,
        setsDone,
        setsTotal,
        volumeKg,
        qualifies,
        rewardPoints,
        loggedCore: loggedIn('core'),
        loggedCardio: loggedIn('cardio'),
        programId: program.id,
        programVersion: program.version,
      }
      tx.create(ref, {
        ...decided,
        cohortId,
        dayId,
        completedAt,
        durationSeconds,
        proofPhoto,
        note: text(raw.note, 2000),
        exercises,
        createdAt: completedAt,
      })
      // The counters and the log they summarise land together, so the board can
      // never show a total the sessions behind it do not support.
      tx.update(caller.memberRef, {
        'stats.sessionsLogged': FieldValue.increment(1),
        'stats.sessionsQualified': FieldValue.increment(qualifies ? 1 : 0),
        'stats.points': FieldValue.increment(rewardPoints),
        'stats.lastSessionAt': completedAt,
        updatedAt: FieldValue.serverTimestamp(),
      })
      if (qualifies) {
        tx.set(
          caller.db.doc(`cohorts/${member.get('cohortId')}/leaderboard/${caller.uid}`),
          {
            name: String(member.get('profile.displayName') || 'Member'),
            avatarUrl: String(member.get('profile.avatarUrl') || ''),
            sessions: FieldValue.increment(1),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        )
      }
      return { id: ref.id, ...decided, completedAtMs: now.getTime() }
    })
  } catch (cause) {
    if (alreadyExists(cause)) {
      throw new HttpsError('already-exists', 'That session is already logged.', { reason: 'already-logged' })
    }
    throw cause
  }
}

// --- submitCheckIn -----------------------------------------------------------

const TRAINING_FEELS = ['too-easy', 'just-right', 'too-hard']

/**
 * Send this week's check-in. The week is the Cohort Clock's, so it is the one
 * the check-in screen named. One per week: the document id is the week.
 *
 * Request data: `{ database?, checkIn: { workoutsDone, nutritionPct, energy,
 * trainingFeel, pain, note } }`. Resolves to what was decided.
 */
export interface SubmitCheckInResult {
  id: string
  weekNumber: number
  submittedAtMs: number
  rewardPoints: number
}

export const submitCheckInHandler = async (request: CallableRequest): Promise<SubmitCheckInResult> => {
  const caller = await identifyMember(request)
  const raw = ((request.data as { checkIn?: unknown } | null)?.checkIn ?? {}) as Record<string, unknown>

  const whole = (value: unknown, field: string, min: number, max: number) => {
    if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
      throw invalid(`\`${field}\` must be a whole number from ${min} to ${max}.`)
    }
    return value as number
  }
  const fields = {
    workoutsDone: whole(raw.workoutsDone, 'workoutsDone', 0, 14),
    nutritionPct: whole(raw.nutritionPct, 'nutritionPct', 0, 100),
    energy: raw.energy === null ? null : whole(raw.energy, 'energy', 1, 10),
    trainingFeel: TRAINING_FEELS.includes(raw.trainingFeel as string) ? (raw.trainingFeel as string) : null,
    pain: text(raw.pain, 2000),
    note: text(raw.note, 2000),
  }

  const cohort = await readCohort(caller)
  const program = await readProgram(caller, cohort, false)

  try {
    return await caller.db.runTransaction(async (tx) => {
      const now = new Date()
      const member = await tx.get(caller.memberRef)
      if (cohort.opensOn && memberDay(now, regionOf(member), cohort.zone) < cohort.opensOn) {
        throw new HttpsError(
          'failed-precondition',
          `Check-ins open with training, on ${dayLabel(cohort.opensOn)}.`,
          { reason: 'before-start' },
        )
      }

      const weekNumber = cohortWeekAt(program.weeks, now, cohort.zone)
      const cohortId = String(member.get('cohortId'))
      const checkIns = caller.memberRef.collection('checkIns')
      const ref = checkIns.doc(`week-${weekNumber}`)
      // And under the id `joinCohort` sets it aside at, which a join cut off
      // half-way leaves in this same cohort.
      const [filed, setAside] = await Promise.all([tx.get(ref), tx.get(checkIns.doc(`${cohortId}~week-${weekNumber}`))])
      if (filed.exists || setAside.exists) {
        throw new HttpsError('already-exists', `Your week ${weekNumber} check-in is already in.`, {
          reason: 'check-in-submitted',
        })
      }
      tx.create(ref, {
        ...fields,
        cohortId,
        weekNumber,
        submittedAt: Timestamp.fromDate(now),
        rewardPoints: program.values.checkIn,
      })
      tx.update(caller.memberRef, {
        'stats.checkInsSubmitted': FieldValue.increment(1),
        'stats.points': FieldValue.increment(program.values.checkIn),
        updatedAt: FieldValue.serverTimestamp(),
      })
      return {
        id: ref.id,
        weekNumber,
        submittedAtMs: now.getTime(),
        rewardPoints: program.values.checkIn,
      }
    })
  } catch (cause) {
    if (alreadyExists(cause)) {
      throw new HttpsError('already-exists', 'This week’s check-in is already in.', {
        reason: 'check-in-submitted',
      })
    }
    throw cause
  }
}

// --- logPhoto ----------------------------------------------------------------

const POSES = ['front', 'side', 'back']

/**
 * File a progress photo the member has already uploaded.
 *
 * Before training opens only the first is taken: it is the "before" the block
 * is measured from. Request data: `{ database?, pose, image }`. Resolves to
 * what was decided.
 */
export interface LogPhotoResult {
  id: string
  weekNumber: number
  takenAtMs: number
}

export const logPhotoHandler = async (request: CallableRequest): Promise<LogPhotoResult> => {
  const caller = await identifyMember(request)
  const raw = (request.data ?? {}) as Record<string, unknown>
  if (!POSES.includes(raw.pose as string)) throw invalid('`pose` must be front, side or back.')
  const image = readImage(raw.image, caller.uid, 'progress')
  if (!image) throw invalid('`image` is required.')

  const cohort = await readCohort(caller)
  const program = await readProgram(caller, cohort, false)
  const photos = caller.memberRef.collection('photos')

  return caller.db.runTransaction(async (tx) => {
    const now = new Date()
    const [member, filed] = await Promise.all([tx.get(caller.memberRef), tx.get(photos)])
    const cohortId = String(member.get('cohortId'))
    const beforeStart =
      cohort.opensOn !== null && memberDay(now, regionOf(member), cohort.zone) < cohort.opensOn
    // This cohort's photos: a "before" from a cohort they were in earlier is not this one's.
    if (beforeStart && filed.docs.some((doc) => ofCohort(doc, cohortId))) {
      throw new HttpsError(
        'failed-precondition',
        `More progress photos open with training, on ${dayLabel(cohort.opensOn!)}.`,
        { reason: 'before-start' },
      )
    }

    const ref = photos.doc()
    const weekNumber = cohortWeekAt(program.weeks, now, cohort.zone)
    tx.create(ref, {
      pose: raw.pose,
      cohortId,
      weekNumber,
      image,
      takenAt: Timestamp.fromDate(now),
    })
    tx.update(caller.memberRef, {
      'stats.photosUploaded': FieldValue.increment(1),
      'stats.points': FieldValue.increment(program.values.progressPhoto),
      updatedAt: FieldValue.serverTimestamp(),
    })
    return { id: ref.id, weekNumber, takenAtMs: now.getTime() }
  })
}
