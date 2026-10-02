// =============================================================================
// One account, several cohorts, one of them active.
//
//   joinCohort         an access code redeemed by somebody who already has a
//                      membership
//   enrolmentRefusal   why a new code should not be issued to an address yet,
//                      which `createAccessCode` asks for the admin console
//
// A member can belong to more than one cohort and appears in each one's
// results, but trains in one at a time. `members/{uid}` holds the active
// membership — `cohortId`, the code, `joinedAt`, `stats` — and every rule, read
// and function resolves the cohort through it. Each cohort they have finished
// is kept beside it in `previousCohorts`, keyed by cohort id, with the stats it
// ended on: that is what puts them in the old cohort's results as well as the
// new one's.
//
// Their logs stay too. Each one belongs to a cohort by its `cohortId`, and one
// written before the field existed belongs to the cohort the member was in
// then — which, until they join another, is the one they are still in. The
// member app reads only the active cohort's, so nothing from the old one shows
// in the new one. When a member joins another cohort, the old cohort's logs are
// tagged with it and renamed to `{cohortId}~{id}`: sessions are filed as
// `w{week}-{day}`, check-ins as `week-{n}` and badges by badge id, and the new
// cohort needs those ids free.
//
// Joining while the old cohort is still running ends their part in it there
// and then. A code for another cohort should not be issued while theirs is
// running — `enrolmentRefusal` here, and the landing site's registration route
// before anybody pays — so this is for one that got through anyway.
//
// Two steps, safe to repeat:
//
//   1. set the old cohort's logs aside: tagged and renamed, still theirs
//   2. claim the code and make the new cohort the active one
//
// Until step two lands the logs set aside still carry the active cohort's id,
// so a call cut off in between leaves the member exactly where they were.
//
// What is written here is `MemberDoc` and `PreviousCohort` in
// `apps/pwa/app/data/types.ts`, restated. Two shapes, one contract — if you
// change one, change both.
// =============================================================================
import { getAuth } from 'firebase-admin/auth'
import { Timestamp, type DocumentReference, type DocumentSnapshot, type Firestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { HttpsError, type CallableRequest } from 'firebase-functions/https'
import { cohortOver } from './calendar.js'
import { app } from './databases.js'
import { identifyMember, type MemberCaller } from './member-writes.js'

// --- What -------------------------------------------------------------------

/**
 * The member's collections that belong to the cohort they were written in.
 *
 * `state` is the workout in progress, which is set down rather than kept: it is
 * a draft, not a log, and the new cohort's first one starts from nothing. The
 * others stay with the account: `lifecycleEvents` is its history,
 * `pushDevices` its phones, and `notificationState` is keyed by notification
 * id, which no other cohort's inbox shares.
 */
export const COHORT_LOGS = ['sessions', 'checkIns', 'photos', 'badges'] as const

/** Between a cohort's id and a log's own id, once the log is set aside. */
export const SET_ASIDE = '~'

/** Mirrors `PreviousCohort`: a membership the member has moved on from. */
export interface PreviousCohort {
  cohortId: string
  cohortName: string
  accessCode: string
  programId: string
  programVersion: number
  joinedAt: Timestamp | null
  leftAt: Timestamp
  /** Always `completed`: their part in it is over, however it ended. */
  status: 'completed'
  /** The cohort was still running when they joined another. */
  leftEarly: boolean
  stats: Record<string, unknown>
}

export interface JoinCohortResult {
  cohortName: string
}

/**
 * Why a code cannot be joined with. `reason` is the member app's
 * `DataSourceError` code, and `message` is shown under the code field as it is.
 */
export interface Refusal {
  reason: 'invalid-code' | 'code-claimed' | 'code-expired' | 'code-wrong-email' | 'already-member'
  message: string
}

/** Who is joining, as far as deciding whether they may goes. */
export interface Joiner {
  uid: string
  email: string
  cohortId: string
  accessCode: string
  /** Every cohort they have been in before this one. */
  previousCohortIds: string[]
}

// --- Deciding ---------------------------------------------------------------

/** As `normaliseCode` in the member app: trimmed and upper-cased. */
export const normaliseCode = (raw: unknown): string =>
  typeof raw === 'string' ? raw.trim().toUpperCase() : ''

const unusable = (message: string): Refusal => ({ reason: 'invalid-code', message })

/**
 * Whether this member may claim `code` for another cohort.
 *
 * The same checks `assessSeat` makes in the member app for a first code, plus
 * the one only a member can fail: a code for a cohort they are in, or were.
 * A cohort cannot be joined twice — its logs are already set aside under its
 * id, and a second set would be filed on top of them.
 */
export const assessJoin = (
  code: string,
  data: Record<string, unknown> | undefined,
  who: Joiner,
  now: Date,
): Refusal | 'claim' => {
  if (!data) return unusable('That code isn’t valid. Check it against your confirmation email.')
  const cohortName =
    typeof data.cohortName === 'string' && data.cohortName.trim() ? data.cohortName.trim() : 'that cohort'
  const alreadyIn = (): Refusal => ({ reason: 'already-member', message: `You’re already in ${cohortName}.` })
  const beenIn = (): Refusal => ({ reason: 'already-member', message: `You’ve already been in ${cohortName}.` })

  if (data.status === 'revoked') return unusable('That code has been revoked. Contact support.')
  if (data.status === 'claimed') {
    if (data.claimedByUid === who.uid && code === who.accessCode) return alreadyIn()
    return { reason: 'code-claimed', message: 'That code has already been used.' }
  }
  if (data.status !== 'unused') return unusable('That code isn’t set up correctly. Contact support.')

  const expiresAt = data.expiresAt instanceof Timestamp ? data.expiresAt.toMillis() : 0
  if (expiresAt < now.getTime()) {
    return { reason: 'code-expired', message: 'That code has expired. Contact support.' }
  }
  // Folded, as everywhere an address is compared: see the claim rule.
  const issuedTo = typeof data.issuedToEmail === 'string' ? data.issuedToEmail : ''
  if (issuedTo && issuedTo.toLowerCase() !== who.email.toLowerCase()) {
    return { reason: 'code-wrong-email', message: 'That code was issued to a different email address.' }
  }
  // A membership is pinned to both. A code without them would put somebody in
  // a cohort they could not log a workout in. The id becomes a path, and a log
  // prefix, so it cannot carry either separator.
  if (
    typeof data.cohortId !== 'string' ||
    !data.cohortId ||
    data.cohortId.includes('/') ||
    data.cohortId.includes(SET_ASIDE)
  ) {
    return unusable('That code isn’t set up correctly. Contact support.')
  }
  if (typeof data.programId !== 'string' || !data.programId) {
    return unusable('That code isn’t set up correctly. Contact support.')
  }

  if (data.cohortId === who.cohortId) return alreadyIn()
  if (who.previousCohortIds.includes(data.cohortId)) return beenIn()
  return 'claim'
}

/**
 * The id a log is filed under once set aside, or `null` when it already is.
 *
 * A log with no `cohortId` was written before the field existed, by the cohort
 * the member was in, which is the one being left.
 */
export const setAsideId = (id: string, cohortId: string | undefined, leaving: string): string | null =>
  id.includes(SET_ASIDE) ? null : `${cohortId || leaving}${SET_ASIDE}${id}`

/**
 * Why a new code for `cohortId` should not be issued to this member, or `null`.
 *
 * Read for the admin console, where the sentence lands in a toast as it is.
 * `cohort` is the member's current cohort document, or `null` when it is gone,
 * which nobody can still be running in.
 */
export const issueRefusal = (
  email: string,
  cohortId: string,
  member: { cohortId: string; cohortName: string; previousCohortIds: string[] },
  cohort: Record<string, unknown> | null,
  now: Date,
): string | null => {
  const name =
    (typeof cohort?.name === 'string' && cohort.name.trim()) || member.cohortName.trim() || 'their cohort'
  if (member.cohortId === cohortId) return `${email} is already a member of ${name}.`
  if (member.previousCohortIds.includes(cohortId)) return `${email} has already been a member of that cohort.`
  if (cohort && !cohortOver(cohort, now)) {
    return `${email} is in ${name}, which is still running. They can be issued a code for another cohort once it ends.`
  }
  return null
}

/** `members/{uid}.previousCohorts`, as the ids of the cohorts in it. */
const previousCohortIdsOf = (member: DocumentSnapshot): string[] => {
  const previous = member.get('previousCohorts')
  return previous && typeof previous === 'object' ? Object.keys(previous) : []
}

/**
 * `issueRefusal` for an address, looked up.
 *
 * By the account rather than by `members.email`, because Auth folds case and a
 * query on the stored address would not: an account made as `Ada@…` is the
 * one a code for `ada@…` would be redeemed on. One account, one member
 * document, in the database the code is being issued into.
 */
export const enrolmentRefusal = async (
  db: Firestore,
  email: string,
  cohortId: string,
): Promise<string | null> => {
  let uid: string
  try {
    uid = (await getAuth(app).getUserByEmail(email)).uid
  } catch (cause) {
    if ((cause as { code?: string } | null)?.code === 'auth/user-not-found') return null
    throw cause
  }
  const member = await db.doc(`members/${uid}`).get()
  if (!member.exists) return null

  const current = String(member.get('cohortId') ?? '')
  const cohort = current && !current.includes('/') ? await db.doc(`cohorts/${current}`).get() : null
  return issueRefusal(
    email,
    cohortId,
    {
      cohortId: current,
      cohortName: String(member.get('cohortName') ?? ''),
      previousCohortIds: previousCohortIdsOf(member),
    },
    cohort?.exists ? (cohort.data() ?? {}) : null,
    new Date(),
  )
}

// --- Joining ----------------------------------------------------------------

const refuse = (refusal: Refusal) =>
  new HttpsError('failed-precondition', refusal.message, { reason: refusal.reason })

/** A batch takes 500 writes, and each log set aside is two of them. */
const MOVES_PER_BATCH = 200

/** Mirrors `emptyStats` in the member app. */
const emptyStats = () => ({
  sessionsLogged: 0,
  sessionsQualified: 0,
  checkInsSubmitted: 0,
  photosUploaded: 0,
  points: 0,
  streakWeeks: 0,
  lastSessionAt: null,
})

const joinerOf = (caller: MemberCaller, member: DocumentSnapshot): Joiner => ({
  uid: caller.uid,
  email: caller.email,
  cohortId: String(member.get('cohortId') ?? ''),
  accessCode: String(member.get('accessCode') ?? ''),
  previousCohortIds: previousCohortIdsOf(member),
})

/**
 * Step one: the old cohort's logs, out of the new one's way and still the
 * member's.
 *
 * Each is copied to its set-aside id, tagged with its cohort, and the original
 * deleted, in one batch, so none is ever in both places or neither. Logs set
 * aside by an earlier move already carry a `~` and are left alone. The tag is
 * the cohort being left, which is still the active one until step two, so
 * every screen and function that filters by it goes on seeing them.
 *
 * The workout in progress is set down; see `COHORT_LOGS`.
 */
const setAsideLogs = async (db: Firestore, memberRef: DocumentReference, leaving: string): Promise<void> => {
  for (const name of COHORT_LOGS) {
    const docs = (await memberRef.collection(name).get()).docs
      .map((doc) => ({ doc, to: setAsideId(doc.id, doc.get('cohortId') as string | undefined, leaving) }))
      .filter((entry): entry is { doc: (typeof entry)['doc']; to: string } => entry.to !== null)
    for (let i = 0; i < docs.length; i += MOVES_PER_BATCH) {
      const batch = db.batch()
      for (const { doc, to } of docs.slice(i, i + MOVES_PER_BATCH)) {
        batch.set(memberRef.collection(name).doc(to), {
          ...doc.data(),
          cohortId: (doc.get('cohortId') as string | undefined) || leaving,
        })
        batch.delete(doc.ref)
      }
      await batch.commit()
    }
  }
  const open = await memberRef.collection('state').get()
  if (!open.empty) {
    const batch = db.batch()
    open.docs.forEach((doc) => batch.delete(doc.ref))
    await batch.commit()
  }
}

/**
 * Step two: claim the code and make its cohort the active one.
 *
 * The code is assessed again inside the transaction, so a claim or revocation
 * landing since the first look is not written over. The membership being left
 * goes into `previousCohorts` with the stats it ended on; the new one starts
 * from nothing, and setup is not asked again — a member who finished it keeps
 * their answers, and one who never did still has it to finish. A pause
 * belonged to the cohort it was taken in.
 */
const enterCohort = async (
  caller: MemberCaller,
  code: string,
  leaving: { id: string; name: string; running: boolean },
): Promise<string> => {
  const { db, memberRef, uid, email } = caller
  const codeRef = db.doc(`accessCodes/${code}`)

  return db.runTransaction(async (tx) => {
    const [member, codeSnap] = await Promise.all([tx.get(memberRef), tx.get(codeRef)])
    if (member.get('cohortId') !== leaving.id) {
      throw new HttpsError('aborted', 'Your membership changed while it was moving. Try again.')
    }
    const data = codeSnap.data()
    const verdict = assessJoin(code, data, joinerOf(caller, member), new Date())
    if (verdict !== 'claim') throw refuse(verdict)

    const now = Timestamp.now()
    const cohortId = String(data!.cohortId)
    const cohortName = String(data!.cohortName ?? '')
    const fromStatus = String(member.get('status') ?? '')
    const status = fromStatus === 'onboarding' ? 'onboarding' : 'active'
    const audit = { updatedAt: now, updatedByUid: uid, updatedByEmail: email }

    const previous: PreviousCohort = {
      cohortId: leaving.id,
      cohortName: leaving.name,
      accessCode: String(member.get('accessCode') ?? ''),
      programId: String(member.get('programId') ?? ''),
      programVersion: Number(member.get('programVersion') ?? 1) || 1,
      joinedAt: (member.get('joinedAt') as Timestamp | undefined) ?? null,
      leftAt: now,
      status: 'completed',
      leftEarly: leaving.running,
      stats: (member.get('stats') as Record<string, unknown> | undefined) ?? emptyStats(),
    }

    tx.update(codeRef, {
      status: 'claimed',
      claimedByUid: uid,
      // The console shows this beside the claimed code.
      claimedByName: String(member.get('profile.displayName') || '') || email,
      claimedAt: now,
      ...audit,
    })
    const kept = member.get('previousCohorts') as Record<string, PreviousCohort> | undefined
    tx.update(memberRef, {
      // The whole map rather than a dotted path, which would read the cohort
      // id as part of a field path.
      previousCohorts: { ...(kept && typeof kept === 'object' ? kept : {}), [leaving.id]: previous },
      cohortId,
      cohortName,
      programId: String(data!.programId),
      programVersion: Number(data!.programVersion ?? 1) || 1,
      accessCode: code,
      // The chat shows nothing from before this, as for any member joining.
      joinedAt: now,
      status,
      previousStatus: null,
      pauseReason: null,
      pausedAt: null,
      stats: emptyStats(),
      ...audit,
    })
    // On the new cohort's roster from the moment they are in it, as redemption
    // does for a first code. The old cohort keeps its row: they are in its
    // results as well.
    tx.set(
      db.doc(`cohorts/${cohortId}/leaderboard/${uid}`),
      {
        name: String(member.get('profile.displayName') || 'Member'),
        avatarUrl: String(member.get('profile.avatarUrl') || ''),
        updatedAt: now,
      },
      { merge: true },
    )
    tx.set(memberRef.collection('lifecycleEvents').doc(), {
      memberId: uid,
      type: 'member.joined',
      fromStatus: fromStatus || null,
      toStatus: status,
      reason: `Joined ${cohortName || cohortId}${leaving.running ? `, leaving ${leaving.name || leaving.id} early` : ` after ${leaving.name || leaving.id}`}`,
      createdAt: now,
      createdByUid: uid,
      createdByEmail: email,
    })
    return cohortName
  })
}

/**
 * Join another cohort.
 *
 * Request data: `{ database?, code }`. The member's current cohort becomes a
 * previous one — ended early for them if it is still running — and the code's
 * cohort the active one. Resolves to a `JoinCohortResult`; refuses with
 * `failed-precondition` and a `reason` the member app reads.
 */
export const joinCohortHandler = async (request: CallableRequest): Promise<JoinCohortResult> => {
  const caller = await identifyMember(request)
  const { db, memberRef } = caller

  const code = normaliseCode((request.data as { code?: unknown } | null)?.code)
  // A slash is a path separator to `doc()`, which throws on it, and no code has one.
  if (!code || code.includes('/')) {
    throw refuse(
      unusable(
        code
          ? 'That code isn’t valid. Check it against your confirmation email.'
          : 'Enter the access code from your confirmation email.',
      ),
    )
  }

  const leaving = String(caller.member.get('cohortId') ?? '')
  if (!leaving || leaving.includes('/') || leaving.includes(SET_ASIDE)) {
    throw new HttpsError('failed-precondition', 'This membership has no cohort.')
  }

  // Looked at before anything is set aside, so a code that was never going to
  // work leaves the member's logs exactly as they were.
  const [codeSnap, from] = await Promise.all([
    db.doc(`accessCodes/${code}`).get(),
    db.doc(`cohorts/${leaving}`).get(),
  ])
  const verdict = assessJoin(code, codeSnap.data(), joinerOf(caller, caller.member), new Date())
  if (verdict !== 'claim') throw refuse(verdict)

  const running = from.exists && !cohortOver(from.data() ?? {}, new Date())
  const leavingName = String(from.get('name') || caller.member.get('cohortName') || '')

  await setAsideLogs(db, memberRef, leaving)
  const cohortName = await enterCohort(caller, code, { id: leaving, name: leavingName, running })
  logger.info('A member joined another cohort', { from: leaving, to: codeSnap.get('cohortId'), leftEarly: running })
  return { cohortName }
}
