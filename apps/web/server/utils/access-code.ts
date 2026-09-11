// =============================================================================
// Issuing an access code from the landing page's registration form.
//
// The document written here is the same one `redeemAccessCode` in the member
// app reads and the same one `firestore.rules` claims from, so the two have to
// agree field for field. The canonical contract is `AccessCodeDoc` in
// `apps/pwa/app/data/types.ts`, with the hand-authoring table in `FIREBASE.md`;
// it is restated below rather than imported because that type is written
// against the *client* SDK's `Timestamp` and lives in a workspace this app does
// not depend on. Two shapes, one contract — if you change one, change both.
//
// The rule that matters most is not about values but about presence: a security
// rule that reads a field the document does not have does not evaluate to
// false, it errors, and an errored rule denies the write. So every field below
// is written, including the four whose value is `null`.
// =============================================================================
import { randomBytes } from 'node:crypto'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'

/**
 * What the form collects, already validated and normalised by the route.
 */
export interface Registration {
  fullName: string
  email: string
  whatsapp: string
  /** An IANA zone, e.g. `Africa/Lagos` — picked from a list, not typed. */
  timezone: string
}

/** The cohort a code is issued against, read rather than configured. */
export interface Cohort {
  id: string
  name: string
  programId: string
  programVersion: number
}

/**
 * The stored access code. Mirrors `AccessCodeDoc` — see the header.
 *
 * `programId` and `programVersion` are not on `AccessCodeBase`, but the member
 * document copies them out of here at redemption and `programs/''` is not a
 * document path, so leaving them off makes the first workout save throw. They
 * are read off the cohort, which is where the answer actually lives.
 */
interface AccessCodeDoc {
  code: string
  batchId: string
  cohortId: string
  cohortName: string
  programId: string
  programVersion: number
  expiresAt: Timestamp
  issuedToEmail: string
  issuedToWhatsapp: string
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

/**
 * Who the audit trail names for a code nobody authored by hand.
 *
 * A sentinel rather than an address, because there is no person behind this
 * write and inventing one would make the trail lie. The buyer is not lost —
 * they are in `issuedToEmail`, which is the field that actually decides who may
 * redeem the code.
 */
const SYSTEM_ACTOR = 'system:web-registration'

/**
 * Crockford's base32: the digits and the alphabet minus I, L, O and U.
 *
 * Chosen because a member reads this code off a screen and types it into a
 * phone. Dropping I and L makes `1` unambiguous and dropping O makes `0`
 * unambiguous, which are the two substitutions that actually cost people their
 * seat. Thirty-two symbols is also exactly five bits, which is what lets the
 * draw below be uniform without a modulo bias.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** `DPF-XXXX-XXXX`. Hyphens included: the document id *is* the code, and the
 *  member app only trims and upper-cases what is typed, so the shape has to
 *  match exactly what a member sees. */
export const generateCode = (): string => {
  // One byte per symbol, masked to five bits. Rejection sampling is
  // unnecessary because 32 divides 256 evenly.
  const symbols = Array.from(randomBytes(8), (byte) => ALPHABET[byte & 31]).join('')
  return `DPF-${symbols.slice(0, 4)}-${symbols.slice(4)}`
}

/** ALREADY_EXISTS. The one failure worth retrying rather than reporting. */
const isCollision = (cause: unknown) => (cause as { code?: number })?.code === 6

/**
 * The cohort a self-serve registration joins, read rather than assumed.
 *
 * `cohortId` on a code is not a label: the member-create rule re-reads this
 * document and refuses to write a member into a cohort the code does not name,
 * so a code pointing at a cohort that does not exist is a seat that can never
 * be redeemed and fails with nothing but "permission denied". Reading it here
 * turns that into a legible error at issue time, and gets `cohortName` and the
 * program pin right by construction instead of by copy-paste.
 */
export const readCohort = async (db: Firestore, cohortId: string): Promise<Cohort> => {
  const snap = await db.doc(`cohorts/${cohortId}`).get()
  if (!snap.exists) {
    throw new Error(
      `cohorts/${cohortId} does not exist. Registration issues codes against it, and a ` +
        'code naming a cohort that is not there cannot be redeemed. Set ' +
        'NUXT_REGISTRATION_COHORT_ID to a real cohort.',
    )
  }
  const data = snap.data() as {
    name?: string
    programId?: string | null
    programVersion?: number | null
  }
  return {
    id: snap.id,
    name: data.name ?? '',
    programId: data.programId ?? '',
    programVersion: data.programVersion ?? 1,
  }
}

/**
 * An unexpired, unclaimed code already issued to this address, if there is one.
 *
 * Registering is not an idempotent act by nature — a double-tapped button, a
 * refreshed page, somebody who filled the form in twice a week apart — and each
 * of those minting its own seat means codes nobody will ever redeem cluttering
 * the collection and, worse, a buyer holding two. One equality filter, so the
 * automatic single-field index covers it; `status` and `expiresAt` are settled
 * in memory rather than adding a composite index for a query that returns
 * one or two documents.
 */
export const existingCode = async (db: Firestore, email: string) => {
  const snap = await db.collection('accessCodes').where('issuedToEmail', '==', email).get()
  const now = Date.now()
  const live = snap.docs.find((doc) => {
    const data = doc.data() as { status?: string; expiresAt?: Timestamp }
    return data.status === 'unused' && (data.expiresAt?.toMillis() ?? 0) > now
  })
  return live?.id ?? null
}

/**
 * Mint a code for a paid registration.
 *
 * No longer writes the registration document, and no longer decides when a
 * code should exist: that is `fulfilRegistration`, which owns the transaction
 * that makes this happen exactly once per payment. This is only the minting —
 * pick an id nothing has taken, write the seat.
 *
 * Re-registering with an address that already holds a live code returns that
 * code instead of a second one. A buyer who somehow pays twice has a refund
 * coming, not two seats.
 */
export const issueAccessCode = async (
  db: Firestore,
  registration: Registration,
  cohort: Cohort,
  options: { ttlDays: number },
): Promise<{ code: string; reused: boolean }> => {
  const reused = await existingCode(db, registration.email)
  if (reused) return { code: reused, reused: true }

  const now = Timestamp.now()
  const expiresAt = Timestamp.fromMillis(now.toMillis() + options.ttlDays * 86_400_000)

  // Groups everything the site issued in one month, which is the granularity
  // anybody revoking a bad batch by hand actually wants.
  const batchId = `landing-${new Date(now.toMillis()).toISOString().slice(0, 7)}`

  // Four attempts is generous for a 32^8 space; it is here for the birthday
  // collision, not for a full collection.
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
      // Lower-cased on the way in. The claim rule folds case with `.lower()`
      // and so does the member app, so storing it folded keeps all three
      // agreeing and stops a capital letter costing somebody their seat.
      issuedToEmail: registration.email,
      // Rides on the code so it can reach the member. The registration holds
      // the same number, but no client may read that collection, and this is
      // the one document the redeemer can already see — so this is what
      // `MemberProfile.whatsapp` is seeded from. Nothing checks it: the code is
      // bound to an address, not to a phone.
      issuedToWhatsapp: registration.whatsapp,
      status: 'unused',
      claimedByUid: null,
      claimedByName: null,
      claimedAt: null,
      revokedAt: null,
      createdAt: now,
      createdByUid: SYSTEM_ACTOR,
      createdByEmail: SYSTEM_ACTOR,
      updatedAt: now,
      updatedByUid: SYSTEM_ACTOR,
      updatedByEmail: SYSTEM_ACTOR,
    }

    try {
      // `create`, not `set`: it fails if the id is taken, which is what makes
      // the retry below correct rather than a silent overwrite of somebody
      // else's unredeemed seat.
      await db.doc(`accessCodes/${code}`).create(doc)
      return { code, reused: false }
    } catch (cause) {
      if (!isCollision(cause)) throw cause
    }
  }

  throw new Error('Could not find an unused access code after four attempts.')
}
