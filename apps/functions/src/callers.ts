// =============================================================================
// Who is asking for an access code.
//
// `createAccessCode` has two callers that prove who they are in different ways,
// and one door for both:
//
//   The admin console   a person, signed in with Firebase Auth. The callable
//                       SDK sends their ID token as `Authorization`, and the
//                       `dpfitAdmin` claim on it is what lets them in.
//
//   The landing site    nobody signed in — a server, holding the project's
//                       service account. It sends a Google-signed ID token for
//                       that account in `X-Service-Token`.
//
// Why a second header rather than `Authorization`: a callable verifies whatever
// is in `Authorization` as a *Firebase* ID token and refuses the request before
// this code runs if it is anything else. A Google token for a service account
// is not one, so it travels beside it.
// =============================================================================
import { logger } from 'firebase-functions'
import { defineString } from 'firebase-functions/params'
import { HttpsError, type CallableRequest } from 'firebase-functions/https'
import { OAuth2Client } from 'google-auth-library'
import type { Actor } from './access-codes.js'

export const REGION = 'africa-south1'
export const FUNCTION_NAME = 'createAccessCode'
export const SERVICE_TOKEN_HEADER = 'x-service-token'

/**
 * The service account the landing site runs as — the `client_email` in its
 * `NUXT_FIREBASE_SERVICE_ACCOUNT`. Only a token for exactly this account is
 * accepted. Deploy asks for it when `apps/functions/.env` does not set it.
 */
const registrationServiceAccount = defineString('REGISTRATION_SERVICE_ACCOUNT', {
  description:
    'Service account email the landing site authenticates as (client_email in NUXT_FIREBASE_SERVICE_ACCOUNT).',
})

/**
 * What the landing site's token must be issued for.
 *
 * The function's own URL, which is the conventional audience and the one the
 * caller already knows. Fixed to the deployed URL rather than read off the
 * request, so a token minted for anything else — another function, another
 * project — is not accepted here. The landing site asks for this same string
 * even when it is calling the emulator.
 */
const audience = () =>
  `https://${REGION}-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/${FUNCTION_NAME}`

const verifier = new OAuth2Client()

export interface Caller {
  actor: Actor
  /** Groups a month of codes by where they came from, for revoking by hand. */
  batchPrefix: 'console' | 'landing'
}

/**
 * The system actor. There is no person behind a paid registration, and
 * inventing one would make the trail lie; the buyer is in `issuedToEmail`.
 */
const LANDING_ACTOR: Actor = { uid: 'system:web-registration', email: 'system:web-registration' }

export const identifyCaller = async (request: CallableRequest): Promise<Caller> => {
  // --- A person --------------------------------------------------------------
  // The claim is read off the ID token, so an admin granted it mid-session has
  // to sign in again before this will answer.
  if (request.auth) {
    if (request.auth.token.dpfitAdmin !== true) {
      throw new HttpsError('permission-denied', 'Only a DP Fit admin can create access codes.')
    }
    return {
      actor: { uid: request.auth.uid, email: request.auth.token.email ?? '' },
      batchPrefix: 'console',
    }
  }

  // --- The landing site ------------------------------------------------------
  const token = request.rawRequest.header(SERVICE_TOKEN_HEADER)
  if (!token) {
    throw new HttpsError('unauthenticated', 'Sign in to create access codes.')
  }

  let email: string | undefined
  try {
    const ticket = await verifier.verifyIdToken({ idToken: token, audience: audience() })
    const payload = ticket.getPayload()
    email = payload?.email_verified ? payload.email : undefined
  } catch {
    // Expired, wrong audience, not signed by Google. None of those is worth
    // telling the caller apart from the others.
    throw new HttpsError('unauthenticated', 'The service token could not be verified.')
  }

  if (!email || email !== registrationServiceAccount.value()) {
    // Both sides, because the refusal on its own is unreadable: the caller is
    // told a service account was rejected and never which one, and the answer
    // is a mismatch between a key in the landing site's environment and a
    // string set at deploy time here — two places, neither visible from the
    // other. Service account addresses are identifiers, not secrets.
    logger.warn('Refused a service token', {
      presented: email ?? '(no verified email on the token)',
      expected: registrationServiceAccount.value() || '(REGISTRATION_SERVICE_ACCOUNT is unset)',
    })
    throw new HttpsError('permission-denied', 'That service account cannot create access codes.')
  }
  return { actor: LANDING_ACTOR, batchPrefix: 'landing' }
}
