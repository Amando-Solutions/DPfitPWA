// =============================================================================
// Asking for a registration's access code.
//
// The landing site does not mint codes. `createAccessCode` in `apps/functions`
// does — for this site and for the admin console alike — so the shape of a
// seat is decided in one place instead of restated in every caller. This file
// is the request.
//
// It is a callable, spoken over plain HTTP: `POST { data }`, answered with
// `{ result }` or `{ error }`. Nobody is signed in here, so instead of a
// Firebase ID token this sends a Google-signed ID token for the service account
// `firebase.ts` already holds, in `X-Service-Token`. The function accepts it
// only for the account named in its `REGISTRATION_SERVICE_ACCOUNT`.
// =============================================================================
import { IdTokenClient, JWT } from 'google-auth-library'
import { serviceAccount } from './firebase'

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

export interface IssuedCode {
  code: string
  /** The buyer already held a live code for this cohort, and this is it. */
  reused: boolean
  /** The cohort the function read the code's details from. */
  cohortId: string
}

/** Has to match `REGION` and `FUNCTION_NAME` in `apps/functions/src/callers.ts`. */
const FUNCTION_REGION = 'africa-south1'
const FUNCTION_NAME = 'createAccessCode'

/**
 * The deployed URL. Always the audience of the token, because that is what the
 * function checks it against — including when the request itself goes to the
 * emulator through `accessCodeFunctionUrl`.
 */
const deployedUrl = () =>
  `https://${FUNCTION_REGION}-${serviceAccount().project_id}.cloudfunctions.net/${FUNCTION_NAME}`

let client: IdTokenClient | null = null

/**
 * Holds the ID token until it expires, so a warm instance signs one an hour
 * rather than one per sale.
 */
const serviceToken = async (audience: string): Promise<string> => {
  if (client?.targetAudience !== audience) {
    const key = serviceAccount()
    client = new IdTokenClient({
      targetAudience: audience,
      idTokenProvider: new JWT({ email: key.client_email, key: key.private_key }),
    })
  }
  const headers = await client.getRequestHeaders()
  return (headers.get('authorization') ?? '').replace(/^Bearer /i, '')
}

/**
 * The access code for a paid registration.
 *
 * Returns the buyer's existing live code rather than a second one when they
 * already hold one for this cohort — which is also what makes a retry safe: a
 * request that timed out here after the function had minted gets the same code
 * back the next time Zapier replays the sale.
 *
 * Throws on anything but a code. `fulfilRegistration` has recorded nothing yet
 * when this runs, so a throw leaves the registration unfulfilled and the
 * webhook answers 500 for Zapier to replay.
 */
export const issueAccessCode = async (
  registration: Registration,
  options: { cohortId: string; ttlDays: number },
): Promise<IssuedCode> => {
  const audience = deployedUrl()
  const url = useRuntimeConfig().accessCodeFunctionUrl?.trim() || audience

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-service-token': await serviceToken(audience),
    },
    body: JSON.stringify({
      data: {
        // The same database `firestore()` writes the registration to. Both read
        // one setting, so the seat cannot land somewhere the buyer is not.
        database: useRuntimeConfig().firebaseDatabaseId?.trim() || '(default)',
        cohortId: options.cohortId,
        expiryDays: options.ttlDays,
        email: registration.email,
        whatsapp: registration.whatsapp,
      },
    }),
    // Generous, for a cold start. Well inside the time Zapier waits.
    signal: AbortSignal.timeout(20_000),
  })

  const body = (await response.json().catch(() => null)) as {
    result?: { code?: string; reused?: boolean; cohortId?: string }
    error?: { status?: string; message?: string }
  } | null

  if (!response.ok || body?.error) {
    throw new Error(
      `${FUNCTION_NAME} answered ${response.status}` +
        (body?.error ? ` (${body.error.status}): ${body.error.message}` : '.'),
    )
  }
  const result = body?.result
  if (typeof result?.code !== 'string' || !result.cohortId) {
    throw new Error(`${FUNCTION_NAME} answered ${response.status} without a code.`)
  }
  return { code: result.code, reused: result.reused === true, cohortId: result.cohortId }
}
