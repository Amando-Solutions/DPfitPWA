// =============================================================================
// DP Fitness — Cloud Functions
//
// createAccessCode   The only way an access code comes into existence. One
//                    code per call, issued to one email address. Called by the
//                    admin console and by the landing site's payment webhook;
//                    `callers.ts` is how it tells them apart, `access-codes.ts`
//                    is what it writes.
// =============================================================================
import { setGlobalOptions } from 'firebase-functions'
import { onCall } from 'firebase-functions/https'
import { mintAccessCode, readInput, type CreateAccessCodeResult } from './access-codes.js'
import { identifyCaller, REGION } from './callers.js'

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
 * `reused: true` instead of a second one.
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
