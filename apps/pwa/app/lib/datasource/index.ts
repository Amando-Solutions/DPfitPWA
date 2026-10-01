import { FirestoreDataSource } from './firestore'
import type { DataSource } from './types'
import { initFirebase, isFirebaseConfigured, type FirebaseWebConfig } from '~/lib/firebase/app'

export * from './types'
export { FirestoreDataSource } from './firestore'

let instance: DataSource | null = null

export interface DataSourceOptions {
  firebase: Partial<FirebaseWebConfig>
}

/** Runtime content always comes from Firestore, including its offline cache. */
export const createDataSource = (options: DataSourceOptions): DataSource => {
  if (!isFirebaseConfigured(options.firebase)) {
    throw new Error('Firebase is not configured. The app cannot load your cohort.')
  }
  initFirebase(options.firebase as FirebaseWebConfig)
  return new FirestoreDataSource()
}

export const useDataSourceClient = (): DataSource => {
  if (instance) return instance
  const config = useRuntimeConfig()
  instance = createDataSource({
    firebase: (config.public.firebase ?? {}) as Partial<FirebaseWebConfig>,
  })
  return instance
}

export const resetDataSourceClient = () => { instance = null }
