// =============================================================================
// GET /api/challenge — when the next cohort starts.
//
// The hero badge used to carry the date as authored copy, which made moving the
// start of a cohort a code change and a deploy. It is not a copy decision: it
// is the coach's, and it already has a home in `cohorts/{id}.startDate` — the
// same field the member app counts the six weeks from. This route is the
// landing site reading that field rather than restating it.
//
// The cohort is `registrationCohortId`, the one a self-serve registration
// joins. That is the point: the date on the badge and the cohort somebody is
// buying a seat in cannot drift apart, because they are the same document.
//
// It answers with a formatted label and not only an instant, on purpose. A
// Firestore timestamp is a moment in UTC and the cohort carries its own
// `timezone`; a browser somewhere else formatting that instant lands a day
// either side of the date the coach set — a start stored as midnight in Lagos
// is 23:00 the day before in UTC. So the day is decided here, in the cohort's
// own zone, and the client only prints the string.
//
// Nothing here is secret and nothing is written, so nothing is worth a 500.
// Every failure answers with nulls; the badge drops the clause and reads
// "6-week challenge", which is true. Showing a stale hard-coded date instead
// would be the one outcome worse than showing none.
// =============================================================================
import { Timestamp } from 'firebase-admin/firestore'
import type { ChallengeStart } from '../../app/data/landing'
import { firestore } from '../utils/firebase'

const NOT_KNOWN: ChallengeStart = { startsOn: null, startsLabel: null }

/**
 * The zone to read the start day in when the cohort does not name one.
 *
 * `CohortDoc.timezone` is not optional and every real cohort has it, so this is
 * for a half-written document rather than a supported state. Lagos rather than
 * UTC because that is where these cohorts run: a start stored as local midnight
 * formats to the right day in the coach's zone and to the day before in UTC,
 * and of the two guesses only one of them is ever right here.
 */
const FALLBACK_ZONE = 'Africa/Lagos'

/**
 * One read per instance per window, not one per visitor.
 *
 * The badge is on the first screen of the most-visited page on the site, and
 * the answer changes a handful of times a year. In-memory and therefore
 * per-instance, like the throttle in `register.post.ts` — which is fine for a
 * cache in a way it is not for a limit, because the worst a cold start costs is
 * one more document read.
 */
const CACHE_TTL_MS = 5 * 60_000
let cached: { at: number; value: ChallengeStart } | null = null

/**
 * Both strings, or nulls if the field is not a timestamp.
 *
 * `en-CA` is the shortest way to `YYYY-MM-DD` in a named zone, and `en-GB` is
 * what prints `12 Aug` rather than `Aug 12`. The month is deliberately short:
 * the badge is one line of tracked uppercase and a full month name breaks it.
 */
const describe = (startDate: unknown, timeZone: string): ChallengeStart => {
  if (!(startDate instanceof Timestamp)) return NOT_KNOWN
  const at = startDate.toDate()

  try {
    return {
      startsOn: new Intl.DateTimeFormat('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone,
      }).format(at),
      startsLabel: new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        timeZone,
      }).format(at),
    }
  } catch {
    // An unparseable `timezone` on the document. Worth saying out loud, since
    // every day-boundary gate in the member app reads the same field.
    console.warn(`[challenge] cohort timezone ${timeZone} is not a zone Intl knows.`)
    return NOT_KNOWN
  }
}

export default defineEventHandler(async (event): Promise<ChallengeStart> => {
  // Short, and shared: the answer is the same for everybody and a CDN holding
  // it for a minute is a minute the coach's change takes to appear, which is
  // the right trade for a date that moves a few times a year.
  setResponseHeader(event, 'Cache-Control', 'public, max-age=60, s-maxage=60')

  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value

  const cohortId = useRuntimeConfig().registrationCohortId

  try {
    const snap = await firestore().doc(`cohorts/${cohortId}`).get()
    if (!snap.exists) {
      console.warn(
        `[challenge] cohorts/${cohortId} does not exist, so the hero has no start date to ` +
          'show. NUXT_REGISTRATION_COHORT_ID has to name a real cohort — it is also the ' +
          'cohort every access code this site issues is written against.',
      )
      cached = { at: Date.now(), value: NOT_KNOWN }
      return NOT_KNOWN
    }

    const value = describe(snap.get('startDate'), snap.get('timezone') || FALLBACK_ZONE)
    if (!value.startsLabel) {
      console.warn(`[challenge] cohorts/${cohortId} has no usable startDate. Set it in the console.`)
    }

    cached = { at: Date.now(), value }
    return value
  } catch (cause) {
    // Usually no service account — which is a normal state at build time, where
    // this route is called to prerender the page and the credential may not be
    // in the environment. The client asks again on mount, so a build without
    // one costs the badge its date until the page is open, not for good.
    console.warn('[challenge] could not read the cohort start date:', cause)
    return NOT_KNOWN
  }
})
