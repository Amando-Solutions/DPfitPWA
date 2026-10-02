// =============================================================================
// DP Fitness — Cloud Functions
//
// createAccessCode   The only way an access code comes into existence. One
//                    code per call, issued to one email address. Called by the
//                    admin console and by the landing site's payment webhook;
//                    `callers.ts` is how it tells them apart, `access-codes.ts`
//                    is what it writes.
//
// cloneProgramVersion
//                    Copies a published program into its next version, as a
//                    draft. Called by the admin console. See `programs.ts`.
//
// releasePreorderCodes
//                    Every 15 minutes. Calls the landing site's release route, which
//                    sends the access codes held during a cohort's pre-order
//                    once it has closed. See `release.ts`.
//
// remindLiveCalls    Every 15 minutes. On the day of each live call, puts a
//                    notification in the cohort's inbox, which pushes it too.
//                    Nothing is sent when a call is scheduled. See
//                    `live-call-reminders.ts`.
//
// joinCohort         An access code redeemed by somebody who already has a
//                    membership. Its cohort becomes the active one; the one
//                    they were in stays theirs, in its results, and ends early
//                    for them if it is still running. See `memberships.ts`.
//
// completeCohorts    Every 15 minutes. Marks an active cohort `completed` once
//                    its last day has passed. See `cohort-status.ts`.
//
// setRegion, logSession, submitCheckIn, logPhoto
//                    The member writes locked to a day or a week. The day is
//                    the server's time in the member's stored region; the week
//                    is the Cohort Clock, in the cohort's zone. The rules refuse
//                    these writes from a browser. See `member-writes.ts`.
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
import {
  logPhotoHandler,
  logSessionHandler,
  setRegionHandler,
  submitCheckInHandler,
} from './member-writes.js'
import { joinCohortHandler } from './memberships.js'
import { clonePublishedProgram } from './programs.js'
import { pushCohortMessage, pushCohortNotification } from './push.js'
export { completeCohorts } from './cohort-status.js'
export { remindLiveCalls } from './live-call-reminders.js'
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
 * `failed-precondition` (the cohort is missing, completed, archived or has no program; or,
 * from the console, the address belongs to a member whose cohort is still
 * running) or `aborted` (no free code after four draws).
 *
 * The landing site is not asked the enrolment question here. It asks before
 * the buyer pays (`register.post.ts`), and a code it requests now is for a sale
 * that has been paid: refusing it would strand the money, and `joinCohort`
 * takes the member in whenever they redeem it.
 *
 * From the admin console:
 *
 *   httpsCallable(getFunctions(app, 'africa-south1'), 'createAccessCode')
 */
export const createAccessCode = onCall(async (request): Promise<CreateAccessCodeResult> => {
  const caller = await identifyCaller(request)
  const input = readInput(request.data)
  const batchId = `${caller.batchPrefix}-${new Date().toISOString().slice(0, 7)}`
  return mintAccessCode(input, caller.actor, batchId, {
    checkEnrolment: caller.batchPrefix === 'console',
  })
})

/**
 * Copy a published program into its next version, as a draft, for the admin
 * console. Needs the `dpfitAdmin` claim. See `programs.ts`.
 */
export const cloneProgramVersion = onCall(clonePublishedProgram)

// --- Member writes ----------------------------------------------------------
// Called by the member app with its own ID token, from
// `getFunctions(app, 'africa-south1')`. Each takes `database` like
// `createAccessCode` does, so the staging site writes to the staging database.
export const setRegion = onCall(setRegionHandler)
export const logSession = onCall(logSessionHandler)
export const submitCheckIn = onCall(submitCheckInHandler)
export const logPhoto = onCall(logPhotoHandler)
export const joinCohort = onCall(joinCohortHandler)

// --- Push -------------------------------------------------------------------
// Staging gets its own pair so the whole path can be tried there first: a
// staging member's device is registered in the staging database, and only a
// trigger on that database will ever find it.
export const pushNotification = pushCohortNotification('(default)')
export const pushMessage = pushCohortMessage('(default)')
export const pushNotificationStaging = pushCohortNotification('staging')
export const pushMessageStaging = pushCohortMessage('staging')
