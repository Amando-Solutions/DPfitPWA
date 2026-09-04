// =============================================================================
// The Firebase handles, initialised once.
//
// `initializeApp` throws if it is called twice for the same name, and there are
// two callers that both legitimately need the app: the Nuxt plugin, which
// exposes it to components, and `FirestoreDataSource`, which is constructed
// outside the plugin system. So initialisation lives here and both go through
// it.
//
// Everything is client-only. The app runs with `ssr: false`, and the Firebase
// web SDK expects a browser (IndexedDB for auth persistence, `window` for the
// email-link flow), so the accessors throw rather than half-work on the server.
// =============================================================================
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, onAuthStateChanged, type Auth, type User } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'
import { getStorage, type FirebaseStorage } from 'firebase/storage'

export interface FirebaseWebConfig {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket: string
  messagingSenderId: string
  appId: string
  measurementId: string
  /**
   * Which Firestore database in the project, when it is not the first one.
   *
   * A project can hold several, and they are separate databases with separate
   * documents and separate rules — not namespaces. Empty means `(default)`,
   * which is what a project starts with and what every SDK assumes when it is
   * not told otherwise.
   *
   * It is configuration rather than something derived from `NODE_ENV`, because
   * `NODE_ENV` is `production` for *any* built bundle, a staging deploy
   * included. Keying off it would send the staging site to the production
   * database, which is the one mistake in this area that cannot be undone.
   */
  databaseId: string
}

let app: FirebaseApp | null = null
let databaseId = ''

/**
 * Whether there is enough configuration to talk to a project at all.
 *
 * `projectId` is the one that decides it: without it every read resolves to a
 * URL that does not exist, and the failure surfaces as an opaque network error
 * on some later screen rather than as "you have not configured Firebase".
 */
export const isFirebaseConfigured = (config: Partial<FirebaseWebConfig>): boolean =>
  Boolean(config.projectId && config.apiKey)

export const initFirebase = (config: FirebaseWebConfig): FirebaseApp => {
  if (app) return app
  databaseId = config.databaseId?.trim() ?? ''
  // No second argument. `initializeApp(config, name)` names the *app*, not the
  // database — passing "staging" there creates an app called "staging" instead
  // of `[DEFAULT]`, which changes nothing about where the data goes and makes
  // the `getApp()` below throw, because that returns `[DEFAULT]` by name.
  // Choosing a database is `getFirestore(app, id)`, in `firebaseDb`.
  app = getApps().length ? getApp() : initializeApp(config)
  return app
}

const require_ = (): FirebaseApp => {
  if (import.meta.server) {
    throw new Error('Firebase is client-only here; the app runs with ssr: false.')
  }
  if (!app) {
    throw new Error('Firebase has not been initialised. See plugins/firebase.client.ts.')
  }
  return app
}

export const firebaseAuth = (): Auth => getAuth(require_())

/**
 * The configured database, or `(default)` when none is named.
 *
 * `getFirestore(app)` — the one-argument form — always means `(default)`, no
 * matter what the app was called or what environment it thinks it is in. This
 * is the only place in the codebase that decides otherwise.
 */
export const firebaseDb = (): Firestore =>
  databaseId ? getFirestore(require_(), databaseId) : getFirestore(require_())

// `storageBucket` comes from the same config block, so the bucket follows the
// environment for the same reason and by the same route as everything else.
export const firebaseStorage = (): FirebaseStorage => getStorage(require_())

let restored: Promise<void> | null = null

/**
 * Resolves once the SDK has finished restoring any persisted session.
 *
 * This is the one piece of Firebase Auth that reliably catches people out.
 * `auth.currentUser` is `null` immediately after `getAuth()` — not because
 * nobody is signed in, but because reading the persisted session out of
 * IndexedDB is asynchronous and has not finished yet. Anything that checks
 * `currentUser` on the boot path therefore sees a signed-out user every time,
 * and the route middleware bounces a perfectly valid member back to the
 * sign-in screen on every reload.
 *
 * `onAuthStateChanged` fires once that restore completes, whichever way it
 * went, so awaiting the first callback is what makes "is anyone signed in" a
 * question with a correct answer. Resolved once and cached: after the first
 * fire, `auth.currentUser` is authoritative and stays current on its own.
 */
export const authRestored = (): Promise<void> => {
  if (!restored) {
    restored = new Promise((resolve) => {
      const stop = onAuthStateChanged(firebaseAuth(), () => {
        stop()
        resolve()
      })
    })
  }
  return restored
}

/** The signed-in user, waiting for the session restore first. */
export const currentUser = async (): Promise<User | null> => {
  await authRestored()
  return firebaseAuth().currentUser
}
