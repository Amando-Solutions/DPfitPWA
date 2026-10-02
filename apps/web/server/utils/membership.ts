// =============================================================================
// Whether an address may buy a seat yet.
//
// A member can belong to several cohorts but trains in one at a time
// (`joinCohort` in `apps/functions`), and only one cohort runs at a time. So a
// member whose cohort is still running is not sold another seat. It is asked
// here, before they are sent to Selar, because once they have paid the code is
// owed whatever this would have said — and `createAccessCode` does not ask it
// of this site.
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
 * Completed or archived, or past the last day its `endDate` names, on the
 * cohort's own calendar. No usable `endDate` is no end on the calendar.
 */
export const cohortOver = (
  cohort: { status?: unknown; endDate?: unknown; timezone?: unknown },
  now: Date,
): boolean => {
  if (cohort.status === 'archived' || cohort.status === 'completed') return true
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
export const ENROLLED = 'This email can’t register for this cohort. If you’re in a DP Fitness cohort that hasn’t ended yet, you can register for another once it has.'

/**
 * Whether `email` cannot buy a seat in `cohortId` yet: `ENROLLED`, or `null`
 * when nothing stands in the way.
 *
 * Refused while their cohort is running, and when `cohortId` is a cohort they
 * are in or have been in. Found by the address stored on the member document,
 * which is the account's and arrives lower-cased, as the form's does. A member the lookup misses — an address
 * stored in another case by an old sign-in — is not stranded: redeeming the
 * code ends their part in the running cohort and starts the new one.
 */
export async function enrolmentRefusal(db: Firestore, email: string, cohortId: string, now = new Date()) {
  const found = await db.collection('members').where('email', '==', email).limit(1).get()
  const member = found.docs[0]
  if (!member) return null

  const current = String(member.get('cohortId') ?? '')
  if (current === cohortId) return ENROLLED
  const previous = member.get('previousCohorts')
  if (previous && typeof previous === 'object' && cohortId in previous) return ENROLLED

  const cohort = current && !current.includes('/') ? await db.doc(`cohorts/${current}`).get() : null
  const data = cohort?.exists ? (cohort.data() ?? {}) : null
  return data && !cohortOver(data, now) ? ENROLLED : null
}
