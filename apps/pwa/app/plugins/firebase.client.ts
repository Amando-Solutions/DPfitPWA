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

    // The data-source factory reports incomplete Firebase configuration.
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
