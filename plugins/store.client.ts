/**
 * Loads persisted state before the app mounts, so route middleware and the
 * first paint both see the real member rather than an empty store.
 */
export default defineNuxtPlugin(async () => {
  const store = useAppStore()
  await store.hydrate()
})
