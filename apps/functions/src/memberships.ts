// =============================================================================
// One cohort after another, on one account.
//
//   joinCohort         an access code redeemed by somebody who already has a
//                      membership
//   enrolmentRefusal   why a new code should not be issued to an address yet,
//                      which `createAccessCode` asks for the admin console
//
// An account is in one cohort at a time. `members/{uid}.cohortId` names it, and
// every rule, read and function resolves the cohort through that one field, so
// a second cohort is a move rather than a second membership. The old cohort's
// logs are deleted — its sessions, check-ins, progress photos, badges and any
// workout left open — and the member document is pointed at the new cohort with
// fresh stats. Nothing of the old cohort is kept on the account; its board
// keeps their row. The profile — name, region, body metrics, goal — carries
// over, so there is no second setup.
//
// The logs have to go, not just the pointer. Every screen reads them off the
// account rather than the cohort, and sessions are filed as `w{week}-{day}` and
// check-ins as `week-{n}`, so a second cohort on the same program would open
// with the first one's week already logged.
//
// Nobody leaves a cohort that is still running. A code for another cohort is
// not issued while one is — `enrolmentRefusal` here, and the landing site's
// registration route before anybody pays — but a code that got through anyway
// is still claimed, and held on the member as `nextCohort`. The move waits for
// the current cohort to end, and the ended screen, which is the only screen
// they can reach then, finishes it.
//
// Three steps, each safe to repeat, so a call cut off between any two is
// finished by the next one:
//
//   1. claim the code and hold it as `nextCohort`   (when a code is sent)
//   2. delete the old cohort's logs                 (once it is over)
//   3. point the member at the held cohort, and clear `nextCohort`
//
// What is written here is `PendingCohort` and `MemberDoc` in
// `apps/pwa/app/data/types.ts`, restated. Two shapes, one contract — if you
// change one, change both.
// =============================================================================
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, Timestamp, type DocumentReference, type Firestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { logger } from 'firebase-functions'
import { HttpsError, type CallableRequest } from 'firebase-functions/https'
import { cohortOver } from './calendar.js'
import { app } from './databases.js'
import { identifyMember, type MemberCaller } from './member-writes.js'

// --- What -------------------------------------------------------------------

/** Mirrors `PendingCohort`: a claimed code waiting for the current cohort to end. */
export interface PendingCohort {
  accessCode: string
  cohortId: string
  cohortName: string
  programId: string
  programVersion: number
  claimedAt: Timestamp
}

/**
 * The member's collections that belong to the cohort they were written in, and
 * so go with it.
 *
 * The others stay with the account: `lifecycleEvents` is its history,
 * `pushDevices` its phones, and `notificationState` is keyed by notification
 * id, which no other cohort's inbox shares.
 */
export const COHORT_COLLECTIONS = ['sessions', 'checkIns', 'photos', 'badges', 'state'] as const

/** One uploaded file, as a `StoredImage` names it. */
export interface StoredFile {
  bucket: string
  path: string
}

/**
 * The uploads a log points at, so they go with it: a progress photo's `image`,
 * and the `proofPhoto` on a session or a workout left open.
 *
 * The bucket comes off the download URL, because the project has one per
 * database and the URL is the only place a document records which. Only paths
 * in the member's own folder are taken — the rules put every upload of theirs
 * there — so no document, however it was written, can point this at anybody
 * else's.
 */
export const filesIn = (data: Record<string, unknown>, uid: string): StoredFile[] => {
  const files: StoredFile[] = []
  for (const field of ['image', 'proofPhoto']) {
    const image = data[field] as { storagePath?: unknown; downloadUrl?: unknown } | null | undefined
    const path = typeof image?.storagePath === 'string' ? image.storagePath : ''
    if (!path.startsWith(`members/${uid}/`) || path.includes('..')) continue
    let bucket = ''
    try {
      // https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{path}?…
      bucket = new URL(String(image?.downloadUrl ?? '')).pathname.match(/^\/v0\/b\/([^/]+)\/o\//)?.[1] ?? ''
    } catch {
      continue
    }
    if (bucket) files.push({ bucket, path })
  }
  return files
}

export interface JoinCohortResult {
  /** In the new cohort now. `false` is held, until the current one ends. */
  moved: boolean
  cohortName: string
}

/**
 * Why a code cannot be joined with. `reason` is the member app's
 * `DataSourceError` code, and `message` is shown under the code field as it is.
 */
export interface Refusal {
  reason:
    | 'invalid-code'
    | 'code-claimed'
    | 'code-expired'
    | 'code-wrong-email'
    | 'already-member'
    | 'already-registered'
  message: string
}

/** Who is joining, as far as deciding whether they may goes. */
export interface Joiner {
  uid: string
  email: string
  cohortId: string
  accessCode: string
  pending: PendingCohort | null
}

// --- Deciding ---------------------------------------------------------------

/** As `normaliseCode` in the member app: trimmed and upper-cased. */
export const normaliseCode = (raw: unknown): string =>
  typeof raw === 'string' ? raw.trim().toUpperCase() : ''

/** `members/{uid}.nextCohort` as stored, or `null` when there is none worth reading. */
export const pendingOf = (raw: unknown): PendingCohort | null => {
  const p = raw as Partial<PendingCohort> | null | undefined
  // Both become document paths, and `doc()` throws on a slash.
  if (!p || typeof p.accessCode !== 'string' || !p.accessCode || p.accessCode.includes('/')) return null
  if (typeof p.cohortId !== 'string' || !p.cohortId || p.cohortId.includes('/')) return null
  return {
    accessCode: p.accessCode,
    cohortId: p.cohortId,
    cohortName: typeof p.cohortName === 'string' ? p.cohortName : '',
    programId: typeof p.programId === 'string' ? p.programId : '',
    programVersion: typeof p.programVersion === 'number' ? p.programVersion : 1,
    claimedAt: p.claimedAt instanceof Timestamp ? p.claimedAt : Timestamp.fromMillis(0),
  }
}

const unusable = (message: string): Refusal => ({ reason: 'invalid-code', message })

/**
 * Whether this member may claim `code` for their next cohort.
 *
 * `claim` is a new claim. `resume` is one already made — by this member, and
 * held as their next cohort — so the call asking again is finishing one that
 * was cut off. Everything else is a refusal.
 *
 * The same checks `assessSeat` makes in the member app for a first code, plus
 * the two only a member already in a cohort can fail: a code for that same
 * cohort, and a second code while one is held.
 */
export const assessJoin = (
  code: string,
  data: Record<string, unknown> | undefined,
  who: Joiner,
  now: Date,
): Refusal | 'claim' | 'resume' => {
  if (!data) return unusable('That code isn’t valid. Check it against your confirmation email.')
  const cohortName =
    typeof data.cohortName === 'string' && data.cohortName.trim() ? data.cohortName.trim() : 'that cohort'

  if (data.status === 'revoked') return unusable('That code has been revoked. Contact support.')
  if (data.status === 'claimed') {
    if (data.claimedByUid === who.uid && code === who.pending?.accessCode) return 'resume'
    if (data.claimedByUid === who.uid && code === who.accessCode) {
      return { reason: 'already-member', message: `You’re already in ${cohortName}.` }
    }
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
  // A membership is pinned to both. A code without them would move somebody
  // into a cohort they could not log a workout in.
  if (typeof data.cohortId !== 'string' || !data.cohortId || data.cohortId.includes('/')) {
    return unusable('That code isn’t set up correctly. Contact support.')
  }
  if (typeof data.programId !== 'string' || !data.programId) {
    return unusable('That code isn’t set up correctly. Contact support.')
  }

  if (data.cohortId === who.cohortId) {
    return { reason: 'already-member', message: `You’re already in ${cohortName}.` }
  }
  if (who.pending) {
    return {
      reason: 'already-registered',
      message: `You’re already registered for ${who.pending.cohortName || 'your next cohort'}.`,
    }
  }
  return 'claim'
}

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
  member: { cohortId: string; cohortName: string; pending: PendingCohort | null },
  cohort: Record<string, unknown> | null,
  now: Date,
): string | null => {
  const name =
    (typeof cohort?.name === 'string' && cohort.name.trim()) || member.cohortName.trim() || 'their cohort'
  if (member.cohortId === cohortId) return `${email} is already a member of ${name}.`
  if (member.pending) {
    return `${email} is already registered for ${member.pending.cohortName || 'their next cohort'}.`
  }
  if (cohort && !cohortOver(cohort, now)) {
    return `${email} is in ${name}, which is still running. They can be issued a code for another cohort once it ends.`
  }
  return null
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
      pending: pendingOf(member.get('nextCohort')),
    },
    cohort?.exists ? (cohort.data() ?? {}) : null,
    new Date(),
  )
}

// --- Joining ----------------------------------------------------------------

const refuse = (refusal: Refusal) =>
  new HttpsError('failed-precondition', refusal.message, { reason: refusal.reason })

/** A batch takes 500 writes. */
const DELETES_PER_BATCH = 500

/**
 * Whether the held code is still this member's seat in the held cohort. Read
 * before the logs go and again as the member is moved, since a coach may have
 * revoked it in between.
 */
const holdsSeat = (code: { get: (field: string) => unknown }, uid: string, pending: PendingCohort) =>
  code.get('status') === 'claimed' && code.get('claimedByUid') === uid && code.get('cohortId') === pending.cohortId

const seatGone = () => refuse(unusable('The code for your next cohort is no longer valid. Contact support.'))

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

/**
 * Step one: claim the code onto this member and hold it as their next cohort.
 *
 * The claim is the transition the rules allow a member on a first code —
 * `unused` to `claimed`, onto themselves, the same fields — made here because
 * the hold beside it is a field no member may write. See `nextCohort` in
 * `firestore.rules`.
 */
const claimAndHold = async (caller: MemberCaller, code: string): Promise<void> => {
  const { db, memberRef, uid, email } = caller
  const codeRef = db.doc(`accessCodes/${code}`)

  await db.runTransaction(async (tx) => {
    const [member, codeSnap] = await Promise.all([tx.get(memberRef), tx.get(codeRef)])
    const data = codeSnap.data()
    const verdict = assessJoin(
      code,
      data,
      {
        uid,
        email,
        cohortId: String(member.get('cohortId') ?? ''),
        accessCode: String(member.get('accessCode') ?? ''),
        pending: pendingOf(member.get('nextCohort')),
      },
      new Date(),
    )
    if (verdict === 'resume') return
    if (verdict !== 'claim') throw refuse(verdict)

    const now = Timestamp.now()
    const held: PendingCohort = {
      accessCode: code,
      cohortId: String(data!.cohortId),
      cohortName: String(data!.cohortName ?? ''),
      programId: String(data!.programId),
      programVersion: Number(data!.programVersion ?? 1) || 1,
      claimedAt: now,
    }
    const audit = { updatedAt: now, updatedByUid: uid, updatedByEmail: email }
    tx.update(codeRef, {
      status: 'claimed',
      claimedByUid: uid,
      // The console shows this beside the claimed code.
      claimedByName: String(member.get('profile.displayName') || '') || email,
      claimedAt: now,
      ...audit,
    })
    tx.update(memberRef, { nextCohort: held, ...audit })
  })
}

/**
 * Step two: the old cohort's logs, gone.
 *
 * Nothing of a finished cohort is kept on the account, so its sessions,
 * check-ins, photos, badges and any workout left open are deleted rather than
 * moved. Safe outside a transaction because the cohort is over: the functions
 * and the rules both refuse every write these collections could take.
 *
 * The documents go first, and the uploads they pointed at after, as the member
 * app deletes a photo: a file left behind is a cleanup job, a document pointing
 * at a file that is gone is a broken image. A file that will not delete is
 * logged and left, rather than stranding the member half-way between cohorts.
 */
const clearCohortLogs = async (db: Firestore, memberRef: DocumentReference, uid: string): Promise<void> => {
  const files: StoredFile[] = []
  for (const name of COHORT_COLLECTIONS) {
    const docs = (await memberRef.collection(name).get()).docs
    for (const doc of docs) files.push(...filesIn(doc.data(), uid))
    for (let i = 0; i < docs.length; i += DELETES_PER_BATCH) {
      const batch = db.batch()
      for (const doc of docs.slice(i, i + DELETES_PER_BATCH)) batch.delete(doc.ref)
      await batch.commit()
    }
  }

  const storage = getStorage(app)
  const results = await Promise.allSettled(
    files.map((file) => storage.bucket(file.bucket).file(file.path).delete({ ignoreNotFound: true })),
  )
  const failed = results.filter((result) => result.status === 'rejected').length
  if (failed) logger.warn('Some uploads from a finished cohort could not be deleted', { uid, failed })
}

/**
 * Step three: the member, pointed at the cohort they were holding.
 *
 * The held code is read again rather than trusted off the member: it is the
 * seat, and a coach may have revoked it since. Setup is not asked again — a
 * member who finished it keeps their answers, and one who never did still has
 * it to finish. A pause belonged to the cohort it was taken in.
 */
const enterHeldCohort = async (
  caller: MemberCaller,
  fromCohortId: string,
  fromName: string,
): Promise<void> => {
  const { db, memberRef, uid, email } = caller

  await db.runTransaction(async (tx) => {
    const member = await tx.get(memberRef)
    const pending = pendingOf(member.get('nextCohort'))
    if (!pending || member.get('cohortId') !== fromCohortId) {
      throw new HttpsError('aborted', 'Your membership changed while it was moving. Try again.')
    }
    if (pending.cohortId === fromCohortId) {
      throw refuse({ reason: 'already-member', message: `You’re already in ${pending.cohortName || 'that cohort'}.` })
    }
    const codeSnap = await tx.get(db.doc(`accessCodes/${pending.accessCode}`))
    if (!holdsSeat(codeSnap, uid, pending)) throw seatGone()

    const now = Timestamp.now()
    const fromStatus = String(member.get('status') ?? '')
    const status = fromStatus === 'onboarding' ? 'onboarding' : 'active'

    tx.update(memberRef, {
      cohortId: pending.cohortId,
      cohortName: pending.cohortName,
      programId: pending.programId,
      programVersion: pending.programVersion,
      accessCode: pending.accessCode,
      // The chat shows nothing from before this, as for any member joining.
      joinedAt: now,
      status,
      previousStatus: null,
      pauseReason: null,
      pausedAt: null,
      stats: emptyStats(),
      nextCohort: FieldValue.delete(),
      updatedAt: now,
      updatedByUid: uid,
      updatedByEmail: email,
    })
    // On the new cohort's roster from the moment they are in it, as redemption
    // does for a first code. The old cohort keeps its row, so its board still
    // reads as it ended.
    tx.set(
      db.doc(`cohorts/${pending.cohortId}/leaderboard/${uid}`),
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
      reason: `Moved from ${fromName || fromCohortId} to ${pending.cohortName || pending.cohortId}`,
      createdAt: now,
      createdByUid: uid,
      createdByEmail: email,
    })
  })
}

/**
 * Join another cohort.
 *
 * Request data: `{ database?, code? }`. With a code, it is claimed and held,
 * and the member moves at once if their current cohort is over. Without one,
 * the cohort already held is the one moved into — what the ended screen sends.
 * Resolves to a `JoinCohortResult`; refuses with `failed-precondition` and a
 * `reason` the member app reads.
 */
export const joinCohortHandler = async (request: CallableRequest): Promise<JoinCohortResult> => {
  const caller = await identifyMember(request)
  const { db, memberRef } = caller

  const sent = (request.data as { code?: unknown } | null)?.code
  if (sent !== undefined && sent !== null) {
    const code = normaliseCode(sent)
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
    await claimAndHold(caller, code)
  }

  const member = await memberRef.get()
  const pending = pendingOf(member.get('nextCohort'))
  if (!pending) {
    throw refuse(unusable('Enter the access code for the cohort you’re joining.'))
  }

  const fromCohortId = String(member.get('cohortId') ?? '')
  if (!fromCohortId || fromCohortId.includes('/')) {
    throw new HttpsError('failed-precondition', 'This membership has no cohort.')
  }
  // Before anything is deleted: clearing the cohort they would be moved back
  // into would only throw their own logs away.
  if (pending.cohortId === fromCohortId) {
    throw refuse({ reason: 'already-member', message: `You’re already in ${pending.cohortName || 'that cohort'}.` })
  }
  const [from, seat] = await Promise.all([
    db.doc(`cohorts/${fromCohortId}`).get(),
    db.doc(`accessCodes/${pending.accessCode}`).get(),
  ])
  // A cohort that is gone has nobody still training in it.
  if (from.exists && !cohortOver(from.data() ?? {}, new Date())) {
    return { moved: false, cohortName: pending.cohortName }
  }
  // The delete cannot be taken back, so the seat it is for is checked first: a
  // revoked code would otherwise leave them with no logs and no new cohort.
  if (!holdsSeat(seat, caller.uid, pending)) throw seatGone()

  const fromName = String(from.get('name') || member.get('cohortName') || '')
  await clearCohortLogs(db, memberRef, caller.uid)
  await enterHeldCohort(caller, fromCohortId, fromName)
  logger.info('A member joined their next cohort', { from: fromCohortId, to: pending.cohortId })
  return { moved: true, cohortName: pending.cohortName }
}
