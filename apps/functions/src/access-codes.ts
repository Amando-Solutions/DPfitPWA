// =============================================================================
// Minting an access code. The one place in the system that does.
//
// There used to be two writers, and they disagreed. The landing site wrote the
// full contract; the admin console wrote a document with no `issuedToEmail`,
// no program pin and `claimedByMemberId` where the rules read `claimedByUid` —
// a code the member app refuses with "That code isn't set up correctly". Both
// now call `createAccessCode`, and the shape of a seat is decided once.
//
// One code per call, always issued to somebody. A seat is one person, and a
// code bound to an address is one only that address can redeem, so there is no
// such thing here as a batch of anonymous codes waiting to be handed out.
//
// The document written here is the one `redeemAccessCode` in the member app
// reads and `firestore.rules` claims from, so the three have to agree field for
// field. The canonical contract is `AccessCodeDoc` in `apps/pwa/app/data/types.ts`;
// it is restated below rather than imported because that type is written
// against the *client* SDK's `Timestamp`. Two shapes, one contract — if you
// change one, change both.
//
// The rule that matters most is presence, not value: a security rule that reads
// a field the document does not have errors, and an errored rule denies the
// write. So every field is written, including the ones whose value is `null`.
// =============================================================================
import { randomBytes } from 'node:crypto'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { HttpsError } from 'firebase-functions/https'

// --- Where ------------------------------------------------------------------

/**
 * The databases a code may be minted into.
 *
 * One deployment serves both, because they share a project — and so share
 * Firebase Auth, the admin claim and the service account. Anybody allowed to
 * mint into one is already allowed to mint into the other, so letting the
 * caller name the database gives nothing away. The list exists so a typo is
 * refused rather than silently writing somewhere nobody reads.
 */
export const DATABASES = ['(default)', 'staging'] as const
export type DatabaseId = (typeof DATABASES)[number]

const app = getApps()[0] ?? initializeApp()

const database = (id: DatabaseId): Firestore =>
  id === '(default)' ? getFirestore(app) : getFirestore(app, id)

// --- What -------------------------------------------------------------------

/** Mirrors `AccessCodeDoc` — see the header. */
interface AccessCodeDoc {
  code: string
  batchId: string
  cohortId: string
  cohortName: string
  /**
   * Not on `AccessCodeBase`, but the member document copies both out of here at
   * redemption and `programs/''` is not a document path, so a code without them
   * redeems fine and then throws on the first workout save.
   */
  programId: string
  programVersion: number
  expiresAt: Timestamp
  issuedToEmail: string
  issuedToWhatsapp: string | null
  status: 'unused'
  claimedByUid: null
  claimedByName: null
  claimedAt: null
  revokedAt: null
  createdAt: Timestamp
  createdByUid: string
  createdByEmail: string
  updatedAt: Timestamp
  updatedByUid: string
  updatedByEmail: string
}

/** Who the audit trail names. A person for the console, a sentinel otherwise. */
export interface Actor {
  uid: string
  email: string
}

/** What a caller sends, once `readInput` has checked it. */
export interface CreateAccessCodeInput {
  /** Defaults to `(default)`. */
  database: DatabaseId
  cohortId: string
  /** Whole days, 1–365. The claim rule refuses a past `expiresAt`. */
  expiryDays: number
  /** Who may redeem the code. Folded to lower case. */
  email: string
  /** Seeds `MemberProfile.whatsapp` at redemption. Nothing checks it. */
  whatsapp: string | null
}

export interface CreateAccessCodeResult {
  code: string
  /** The person already held a live code for this cohort, and this is it. */
  reused: boolean
  database: DatabaseId
  cohortId: string
  cohortName: string
  issuedToEmail: string
  /** ISO 8601. */
  expiresAt: string
}

export const MAX_EXPIRY_DAYS = 365

// --- Codes ------------------------------------------------------------------

/**
 * Crockford's base32: the digits and the alphabet minus I, L, O and U.
 *
 * A member reads this off a screen and types it into a phone. Dropping I and L
 * makes `1` unambiguous and dropping O makes `0` unambiguous, which are the two
 * substitutions that actually cost people their seat. Thirty-two symbols is
 * exactly five bits, so masking a byte draws uniformly with no modulo bias.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** `DPF-XXXX-XXXX`. The document id *is* the code, and the member app only
 *  trims and upper-cases what is typed, so the hyphens are part of the id. */
export const generateCode = (): string => {
  const symbols = Array.from(randomBytes(8), (byte) => ALPHABET[byte & 31]).join('')
  return `DPF-${symbols.slice(0, 4)}-${symbols.slice(4)}`
}

/** ALREADY_EXISTS. The one failure worth retrying rather than reporting. */
const isCollision = (cause: unknown) => (cause as { code?: number })?.code === 6

// --- Input ------------------------------------------------------------------

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const invalid = (message: string) => new HttpsError('invalid-argument', message)

const text = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw invalid(`\`${name}\` is required.`)
  return value.trim()
}

/**
 * The request, checked once for every caller.
 *
 * The email is folded to lower case on the way in. The claim rule compares with
 * `.lower()` and so does the member app, so storing it folded keeps all three
 * agreeing and stops a capital letter costing somebody their seat.
 */
export const readInput = (raw: unknown): CreateAccessCodeInput => {
  const data = (raw ?? {}) as Record<string, unknown>

  const databaseId = data.database ?? '(default)'
  if (!DATABASES.includes(databaseId as DatabaseId)) {
    throw invalid(`\`database\` must be one of: ${DATABASES.join(', ')}.`)
  }

  const cohortId = text(data.cohortId, 'cohortId')
  if (cohortId.includes('/')) throw invalid('`cohortId` is a document id, not a path.')

  const expiryDays = typeof data.expiryDays === 'string' ? Number(data.expiryDays) : data.expiryDays
  if (
    typeof expiryDays !== 'number' ||
    !Number.isInteger(expiryDays) ||
    expiryDays < 1 ||
    expiryDays > MAX_EXPIRY_DAYS
  ) {
    throw invalid(`\`expiryDays\` must be a whole number from 1 to ${MAX_EXPIRY_DAYS}.`)
  }

  const email = text(data.email, 'email').toLowerCase()
  if (!EMAIL.test(email)) throw invalid('`email` is not an email address.')

  const whatsapp = typeof data.whatsapp === 'string' ? data.whatsapp.trim() : ''

  return {
    database: databaseId as DatabaseId,
    cohortId,
    expiryDays,
    email,
    whatsapp: whatsapp || null,
  }
}

// --- Cohort -----------------------------------------------------------------

interface Cohort {
  id: string
  name: string
  programId: string
  programVersion: number
}

/**
 * The cohort a code is issued against, read rather than trusted.
 *
 * `cohortId` on a code is not a label: the member-create rule re-reads it and
 * refuses to write a member into a cohort the code does not name. A code
 * pointing at a cohort that is missing, closed or has no program is a seat that
 * fails later with nothing but "permission denied" or a broken first workout.
 * Refusing here turns each of those into a legible error at issue time, and
 * gets `cohortName` and the program pin right by construction.
 *
 * `draft` is allowed on purpose: selling seats before a cohort opens is normal.
 */
const readCohort = async (db: Firestore, cohortId: string): Promise<Cohort> => {
  const snap = await db.doc(`cohorts/${cohortId}`).get()
  if (!snap.exists) {
    throw new HttpsError(
      'failed-precondition',
      `cohorts/${cohortId} does not exist. A code naming a cohort that is not there cannot be redeemed.`,
    )
  }
  const data = snap.data() as {
    name?: string
    status?: string
    programId?: string | null
    programVersion?: number | null
  }
  if (data.status === 'archived') {
    throw new HttpsError('failed-precondition', `cohorts/${cohortId} is archived.`)
  }
  if (!data.programId) {
    throw new HttpsError(
      'failed-precondition',
      `cohorts/${cohortId} has no program. A member redeeming a code for it could not save a workout.`,
    )
  }
  return {
    id: snap.id,
    name: data.name ?? '',
    programId: data.programId,
    programVersion: data.programVersion ?? 1,
  }
}

// --- Minting ----------------------------------------------------------------

/**
 * An unexpired, unclaimed code already issued to this address for this cohort.
 *
 * Issuing is not idempotent by nature — a webhook retried, an admin pressing
 * the button twice — and each of those minting its own seat leaves somebody
 * holding two. Scoped to the cohort so a live code from last cohort is not
 * handed to somebody joining this one. One equality filter, so the automatic
 * single-field index covers it; the rest is settled in memory.
 */
const existingCode = async (db: Firestore, email: string, cohortId: string) => {
  const snap = await db.collection('accessCodes').where('issuedToEmail', '==', email).get()
  const now = Date.now()
  return (
    snap.docs.find((doc) => {
      const data = doc.data() as { status?: string; cohortId?: string; expiresAt?: Timestamp }
      return (
        data.status === 'unused' &&
        data.cohortId === cohortId &&
        (data.expiresAt?.toMillis() ?? 0) > now
      )
    }) ?? null
  )
}

/**
 * One code for one person, or the live one they already hold.
 *
 * A replacement for a code that is still live means revoking that one first;
 * otherwise this hands the same code back, marked `reused`.
 *
 * `create`, not `set`: it fails if the id is taken, which is what makes the
 * retry correct rather than a silent overwrite of somebody else's unredeemed
 * seat. Four attempts is generous for a 32^8 space; it is here for the birthday
 * collision, not for a full collection.
 */
export const mintAccessCode = async (
  input: CreateAccessCodeInput,
  actor: Actor,
  batchId: string,
): Promise<CreateAccessCodeResult> => {
  const db = database(input.database)
  const cohort = await readCohort(db, input.cohortId)

  const result = (code: string, reused: boolean, expiresAt: Timestamp): CreateAccessCodeResult => ({
    code,
    reused,
    database: input.database,
    cohortId: cohort.id,
    cohortName: cohort.name,
    issuedToEmail: input.email,
    expiresAt: expiresAt.toDate().toISOString(),
  })

  const live = await existingCode(db, input.email, cohort.id)
  if (live) return result(live.id, true, (live.data() as { expiresAt: Timestamp }).expiresAt)

  const now = Timestamp.now()
  const expiresAt = Timestamp.fromMillis(now.toMillis() + input.expiryDays * 86_400_000)

  for (let attempt = 0; attempt < 4; attempt++) {
    const code = generateCode()
    const doc: AccessCodeDoc = {
      code,
      batchId,
      cohortId: cohort.id,
      cohortName: cohort.name,
      programId: cohort.programId,
      programVersion: cohort.programVersion,
      expiresAt,
      issuedToEmail: input.email,
      issuedToWhatsapp: input.whatsapp,
      status: 'unused',
      claimedByUid: null,
      claimedByName: null,
      claimedAt: null,
      revokedAt: null,
      createdAt: now,
      createdByUid: actor.uid,
      createdByEmail: actor.email,
      updatedAt: now,
      updatedByUid: actor.uid,
      updatedByEmail: actor.email,
    }

    try {
      await db.doc(`accessCodes/${code}`).create(doc)
    } catch (cause) {
      if (isCollision(cause)) continue
      throw cause
    }

    // The code itself is never logged: it is the secret a seat is spent with,
    // and logs are read by more people than the collection is.
    logger.info('Minted an access code', {
      database: input.database,
      cohortId: cohort.id,
      batchId,
      actor: actor.uid,
    })
    return result(code, false, expiresAt)
  }

  throw new HttpsError('aborted', 'Could not find an unused access code after four attempts.')
}
