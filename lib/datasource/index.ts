import { HttpDataSource } from './http'
import { LocalDataSource } from './local'
import type { DataSource } from './types'

export * from './types'
export { LocalDataSource } from './local'
export { HttpDataSource } from './http'

let instance: DataSource | null = null

/**
 * Picks the implementation from env and memoises it for the page lifetime.
 *
 *   NUXT_PUBLIC_USE_MOCK_DATA=true            → LocalDataSource (localStorage)
 *   NUXT_PUBLIC_USE_MOCK_DATA=false + apiBase → HttpDataSource
 *
 * Live mode without an API base falls back to local so a half-configured
 * environment still runs. See README.
 */
export const createDataSource = (options: {
  useMockData: boolean
  apiBase: string
}): DataSource => {
  const canGoLive = !options.useMockData && options.apiBase.length > 0
  return canGoLive ? new HttpDataSource(options.apiBase) : new LocalDataSource()
}

export const useDataSourceClient = (): DataSource => {
  if (instance) return instance
  const config = useRuntimeConfig()
  instance = createDataSource({
    useMockData: config.public.useMockData !== false,
    apiBase: String(config.public.apiBase ?? '').trim(),
  })
  return instance
}

/** Test seam: drops the memoised instance. */
export const resetDataSourceClient = () => {
  instance = null
}
