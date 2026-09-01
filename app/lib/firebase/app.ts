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
}

let app: FirebaseApp | null = null

const storageBucketUrl = process.env.NODE_ENV === 'production'
  ? 'gs://recomp-48b7b.firebasestorage.app'
  : 'gs://recomp-48b7b-staging.firebasestorage.app'

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
  const dbEnvironment = process.env.NODE_ENV === "production" ? "(default)" : "staging";
  app = getApps().length ? getApp() : initializeApp(config, dbEnvironment)
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
export const firebaseDb = (): Firestore => getFirestore(require_())
export const firebaseStorage = (): FirebaseStorage => getStorage(require_(), storageBucketUrl)

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
