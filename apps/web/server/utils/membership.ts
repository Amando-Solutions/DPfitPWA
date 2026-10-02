// =============================================================================
// Whether an address may buy a seat yet.
//
// An account is in one cohort at a time, and moves to the next once the one it
// is in is over (`joinCohort` in `apps/functions`). So a member whose cohort is
// still running is not sold another seat. It is asked here, before they are
// sent to Selar, because once they have paid the code is owed whatever this
// would have said — and `createAccessCode` does not ask it of this site.
//
// Restates `issueRefusal` in `apps/functions/src/memberships.ts` and
// `cohortOver` in `apps/functions/src/calendar.ts`, worded for the buyer rather
// than for the coach. Two copies, one rule — if you change one, change both.
// =============================================================================
import { Timestamp, type Firestore } from 'firebase-admin/firestore'

/** The cohort's zone when its document has none it can use. As in the functions. */
const COHORT_ZONE_FALLBACK = 'Africa/Lagos'

const zoneOf = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim()) return COHORT_ZONE_FALLBACK
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: value.trim() }).resolvedOptions().timeZone
  } catch {
    return COHORT_ZONE_FALLBACK
  }
}

const dateKeyIn = (at: Date, timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).format(at)

/**
 * Archived, or past the last day its `endDate` names, on the cohort's own
 * calendar. No usable `endDate` is no end on the calendar.
 */
export const cohortOver = (
  cohort: { status?: unknown; endDate?: unknown; timezone?: unknown },
  now: Date,
): boolean => {
  if (cohort.status === 'archived') return true
  if (!(cohort.endDate instanceof Timestamp)) return false
  const zone = zoneOf(cohort.timezone)
  return dateKeyIn(now, zone) > dateKeyIn(cohort.endDate.toDate(), zone)
}

/**
 * One answer for every refusal, and it names nothing.
 *
 * The form is public and takes any address, so whatever it says about one it
 * says to whoever typed it. Naming the cohort would tell a stranger where
 * somebody trains; three different sentences would tell them which of three
 * situations that person is in. The member reading this already knows which.
 */
export const ENROLLED = 'This email already has a place in a DP Fitness cohort that hasn’t ended yet. You can register for another once it has.'

/**
 * Whether `email` cannot buy a seat in `cohortId` yet: `ENROLLED`, or `null`
 * when nothing stands in the way.
 *
 * Refused while their cohort is running, when `cohortId` is the cohort they
 * are already in, and while they hold their next one. Found by the address
 * stored on the member document, which is the account's and arrives
 * lower-cased, as the form's does. A member the lookup misses — an address
 * stored in another case by an old sign-in — is not stranded: their code is
 * held until their cohort ends.
 */
export async function enrolmentRefusal(db: Firestore, email: string, cohortId: string, now = new Date()) {
  const found = await db.collection('members').where('email', '==', email).limit(1).get()
  const member = found.docs[0]
  if (!member) return null

  const current = String(member.get('cohortId') ?? '')
  if (current === cohortId) return ENROLLED
  const held = member.get('nextCohort')
  if (held && typeof held === 'object') return ENROLLED

  const cohort = current && !current.includes('/') ? await db.doc(`cohorts/${current}`).get() : null
  const data = cohort?.exists ? (cohort.data() ?? {}) : null
  return data && !cohortOver(data, now) ? ENROLLED : null
}
