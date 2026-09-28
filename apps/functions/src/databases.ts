// =============================================================================
// The Admin SDK app and the project's two Firestore databases.
//
// Shared by every function here. `initializeApp` throws when it is called twice,
// and each module that needs a database used to be one more place that could.
// =============================================================================
import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

/**
 * The databases a function may read or write.
 *
 * One deployment serves both, because they share a project — and so share
 * Firebase Auth, the admin claim and the service account. Anybody allowed to
 * mint into one is already allowed to mint into the other, so letting the
 * caller name the database gives nothing away. The list exists so a typo is
 * refused rather than silently writing somewhere nobody reads.
 */
export const DATABASES = ['(default)', 'staging'] as const
export type DatabaseId = (typeof DATABASES)[number]

export const app = getApps()[0] ?? initializeApp()

export const database = (id: DatabaseId): Firestore =>
  id === '(default)' ? getFirestore(app) : getFirestore(app, id)
