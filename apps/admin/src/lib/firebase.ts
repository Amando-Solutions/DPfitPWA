import { getApp, getApps, initializeApp } from "firebase/app"
import { getAuth } from "firebase/auth"
import { getFirestore } from "firebase/firestore"
import { getFunctions } from "firebase/functions"
import { getStorage } from "firebase/storage"

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const isFirebaseConfigured = Object.values(firebaseConfig).every(Boolean)

export const firebaseApp = isFirebaseConfigured
  ? getApps().length > 0
    ? getApp()
    : initializeApp(firebaseConfig)
  : null

export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null

export const firebaseDatabaseId =
  import.meta.env.VITE_FIREBASE_DATABASE_ID?.trim() || "(default)"

export const firebaseDb = firebaseApp
  ? firebaseDatabaseId === "(default)"
    ? getFirestore(firebaseApp)
    : getFirestore(firebaseApp, firebaseDatabaseId)
  : null

export const firebaseFunctionsRegion =
  import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION?.trim() || "africa-south1"

export const firebaseFunctions = firebaseApp
  ? getFunctions(firebaseApp, firebaseFunctionsRegion)
  : null

export const firebaseStorage = firebaseApp ? getStorage(firebaseApp) : null
