import { FirestoreDataSource } from './firestore'
import { HttpDataSource } from './http'
import { LocalDataSource } from './local'
import type { DataSource } from './types'
import { initFirebase, isFirebaseConfigured, type FirebaseWebConfig } from '~/lib/firebase/app'

export * from './types'
export { LocalDataSource } from './local'
export { HttpDataSource } from './http'
export { FirestoreDataSource } from './firestore'

let instance: DataSource | null = null

export interface DataSourceOptions {
  useMockData: boolean
  apiBase: string
  firebase: Partial<FirebaseWebConfig>
}

/**
 * Picks the implementation and memoises it for the page lifetime.
 *
 *   NUXT_PUBLIC_USE_MOCK_DATA=true   → LocalDataSource (localStorage)
 *   false + Firebase configured      → FirestoreDataSource
 *   false + NUXT_PUBLIC_API_BASE     → HttpDataSource
 *   false + neither                  → LocalDataSource, loudly
 *
 * Firestore wins over the REST implementation when both are configured: the
 * client SDK is the one that gets offline persistence and live snapshots, and
 * `HttpDataSource` exists for a backend that has not been built.
 *
 * The last branch is the one worth being noisy about. Having Firebase config
 * loaded looks exactly like being connected to it, the screens read identically
 * either way, and a session's worth of training can go into localStorage before
 * anyone notices the database was never involved.
 */
export const createDataSource = (options: DataSourceOptions): DataSource => {
  if (options.useMockData) return new LocalDataSource()

  if (isFirebaseConfigured(options.firebase)) {
    // Idempotent, and normally already done by `plugins/firebase.client.ts`.
    // Repeated here because the data source can be constructed by anything
    // that imports it, in any order, including before plugins have run.
    initFirebase(options.firebase as FirebaseWebConfig)
    return new FirestoreDataSource()
  }

  if (options.apiBase) return new HttpDataSource(options.apiBase)

  console.warn(
    '[datasource] NUXT_PUBLIC_USE_MOCK_DATA is false but neither Firebase nor ' +
      'NUXT_PUBLIC_API_BASE is configured, so this session is running on ' +
      'localStorage. Nothing is being read from or written to a backend.',
  )
  return new LocalDataSource()
}

export const useDataSourceClient = (): DataSource => {
  if (instance) return instance
  const config = useRuntimeConfig()
  instance = createDataSource({
    useMockData: config.public.useMockData !== false,
    apiBase: String(config.public.apiBase ?? '').trim(),
    firebase: (config.public.firebase ?? {}) as Partial<FirebaseWebConfig>,
  })
  return instance
}

/** Test seam: drops the memoised instance. */
export const resetDataSourceClient = () => {
  instance = null
}
