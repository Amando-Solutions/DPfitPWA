// =============================================================================
// DP Fitness — Cloud Functions
//
// createAccessCode   The only way an access code comes into existence. One
//                    code per call, issued to one email address. Called by the
//                    admin console and by the landing site's payment webhook;
//                    `callers.ts` is how it tells them apart, `access-codes.ts`
//                    is what it writes.
//
// releasePreorderCodes
//                    Hourly. Calls the landing site's release route, which
//                    sends the access codes held during a cohort's pre-order
//                    once it has closed. See `release.ts`.
//
// pushNotification, pushMessage (and their *Staging twins)
//                    The member app's inbox, sent as a phone push to members
//                    who turned it on. One pair per database, because a trigger
//                    watches exactly one. See `push.ts`.
// =============================================================================
import { setGlobalOptions } from 'firebase-functions'
import { onCall } from 'firebase-functions/https'
import { mintAccessCode, readInput, type CreateAccessCodeResult } from './access-codes.js'
import { identifyCaller, REGION } from './callers.js'
import { pushCohortMessage, pushCohortNotification } from './push.js'
export { releasePreorderCodes } from './release.js'

/**
 * Beside the data. Both Firestore databases are in `africa-south1`, and a
 * function in another region pays a cross-continent round trip on every read.
 * The landing site builds the URL from this, so moving it is a change there too.
 */
setGlobalOptions({ region: REGION, maxInstances: 10 })

/**
 * Create one access code for one person.
 *
 * Request data:
 *
 *   {
 *     database?:   '(default)' | 'staging'   // defaults to (default)
 *     cohortId:    string
 *     expiryDays:  number                    // whole days, 1–365
 *     email:       string                    // who may redeem it
 *     whatsapp?:   string                    // copied into their profile
 *   }
 *
 * Resolves to a `CreateAccessCodeResult`. If that email already holds an
 * unused, unexpired code for the cohort, that code comes back with
 * `reused: true` instead of a second one, its expiry pushed out to
 * `expiryDays` from now if it would end sooner.
 *
 * Refuses with `unauthenticated`, `permission-denied`, `invalid-argument`,
 * `failed-precondition` (the cohort is missing, archived or has no program) or
 * `aborted` (no free code after four draws).
 *
 * From the admin console:
 *
 *   httpsCallable(getFunctions(app, 'africa-south1'), 'createAccessCode')
 */
export const createAccessCode = onCall(async (request): Promise<CreateAccessCodeResult> => {
  const caller = await identifyCaller(request)
  const input = readInput(request.data)
  const batchId = `${caller.batchPrefix}-${new Date().toISOString().slice(0, 7)}`
  return mintAccessCode(input, caller.actor, batchId)
})

// --- Push -------------------------------------------------------------------
// Staging gets its own pair so the whole path can be tried there first: a
// staging member's device is registered in the staging database, and only a
// trigger on that database will ever find it.
export const pushNotification = pushCohortNotification('(default)')
export const pushMessage = pushCohortMessage('(default)')
export const pushNotificationStaging = pushCohortNotification('staging')
export const pushMessageStaging = pushCohortMessage('staging')
