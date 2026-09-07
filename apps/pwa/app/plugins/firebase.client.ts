/**
 * Stands the Firebase app up before anything asks for it.
 *
 * The handles are also reachable directly through `lib/firebase/app`, which is
 * how `FirestoreDataSource` gets them — it is constructed outside the plugin
 * system and cannot use an injection. This plugin exists so components and
 * composables can take the normal `useNuxtApp()` route, and so initialisation
 * happens once, up front, rather than on whichever read happens to run first.
 *
 * Runs before `app-store`: hydration asks who is signed in, and that question
 * has no correct answer until the SDK exists. See `authRestored`.
 */
import {
  firebaseAuth,
  firebaseDb,
  firebaseStorage,
  initFirebase,
  isFirebaseConfigured,
  type FirebaseWebConfig,
} from '~/lib/firebase/app'

export default defineNuxtPlugin({
  name: 'firebase',
  enforce: 'pre',

  setup() {
    const config = useRuntimeConfig().public.firebase as FirebaseWebConfig

    // Mock mode ships with no credentials, and that is a valid way to run the
    // app, so an absent project is not an error here. `createDataSource` is
    // where the mismatch between "no config" and "asked for live data" is
    // reported.
    if (!isFirebaseConfigured(config)) return

    initFirebase(config)

    return {
      provide: {
        firebaseAuth: firebaseAuth(),
        firestore: firebaseDb(),
        firebaseStorage: firebaseStorage(),
      },
    }
  },
})
