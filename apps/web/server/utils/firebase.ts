// =============================================================================
// The Admin SDK handle for the landing site's one server route.
//
// This is the only place in `apps/web` that talks to Firebase, and it does so
// as an administrator. That is not a shortcut: `firestore.rules` says
// `allow create: if isCoach()` on `accessCodes`, and the visitor filling in the
// registration form is not signed in at all — there is no client-side path to
// creating a code that does not also let anyone in the world mint themselves a
// free seat. So the write happens on the server, behind a credential the
// browser never sees.
//
// Nothing else in this app imports this file, and nothing here is bundled for
// the client: everything under `server/` is compiled into the Nitro output
// alone. See `apps/pwa/.env.example` for the long-form note on why the key is
// `NUXT_FIREBASE_SERVICE_ACCOUNT` and not `NUXT_PUBLIC_…`.
// =============================================================================
import { readFileSync } from 'node:fs'
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

/**
 * A service account key, from either of the two places it is allowed to live.
 *
 * `NUXT_FIREBASE_SERVICE_ACCOUNT` holds the JSON, usually base64'd — a PEM
 * private key contains newlines and a `.env` value cannot span lines, so the
 * raw form only works where the environment can hold one (a hosting
 * dashboard). `GOOGLE_APPLICATION_CREDENTIALS` points at the file instead.
 * Same two doors as `apps/pwa/scripts/backfill-access-codes.mjs`, deliberately.
 */
const readKey = (raw: string, path: string) => {
  const json = raw
    ? raw.startsWith('{')
      ? raw
      : Buffer.from(raw, 'base64').toString('utf8')
    : path
      ? readFileSync(path, 'utf8')
      : ''

  if (!json) return null

  let parsed: { project_id?: string }
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error(
      'NUXT_FIREBASE_SERVICE_ACCOUNT did not contain JSON. If you base64’d the key ' +
        'file, check the encoding survived the copy: `base64 -i key.json | tr -d "\\n"` ' +
        'must be one unbroken line.',
    )
  }
  if (!parsed.project_id) {
    throw new Error('The service account key has no `project_id`. That is not a key file.')
  }
  return parsed
}

/**
 * One app per process, reused across invocations.
 *
 * `initializeApp` throws on a duplicate name, and a warm serverless instance
 * runs this module once but the handler many times, so the existing app is
 * taken when there is one.
 */
let app: App | null = null

const firebaseApp = (): App => {
  if (app) return app
  const [existing] = getApps()
  if (existing) return (app = existing)

  const config = useRuntimeConfig()
  const parsed = readKey(
    config.firebaseServiceAccount?.trim() ?? '',
    config.googleApplicationCredentials?.trim() ?? '',
  )
  if (!parsed) {
    throw new Error(
      'No Firebase service account. Registration cannot issue an access code without ' +
        'one, because the rules that stop a member creating codes are exactly the ones ' +
        'this has to write past. Set NUXT_FIREBASE_SERVICE_ACCOUNT (see .env.example).',
    )
  }

  // `projectId` is passed explicitly rather than left to be discovered. With
  // `initializeApp({ credential })` alone it stays undefined, and the Firestore
  // handle then falls back to whatever ambient credentials the machine has —
  // which on a laptop with gcloud configured is a different project entirely,
  // and the writes land somewhere nobody is looking.
  return (app = initializeApp({
    credential: cert(parsed as Parameters<typeof cert>[0]),
    projectId: parsed.project_id,
  }))
}

/**
 * The Firestore database this deployment writes to.
 *
 * Named explicitly, because a project can hold several and they are entirely
 * separate databases with their own documents and their own rules. Empty means
 * `(default)`, which is the one a project starts with — the same convention as
 * `NUXT_PUBLIC_FIREBASE_DATABASE_ID` in the member app, and set per
 * environment rather than from `NODE_ENV`, which is `production` for any built
 * bundle including a staging one.
 */
export const firestore = (): Firestore => {
  const databaseId = useRuntimeConfig().firebaseDatabaseId?.trim()
  return databaseId ? getFirestore(firebaseApp(), databaseId) : getFirestore(firebaseApp())
}
