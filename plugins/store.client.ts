/**
 * Loads persisted state before the app mounts, so route middleware and the
 * first paint both see the real member rather than an empty store.
 *
 * Named, because `clock.client.ts` has to run after it: the trusted clock is
 * restored as part of hydration.
 */
export default defineNuxtPlugin({
  name: 'app-store',

  async setup() {
    const store = useAppStore()
    await store.hydrate()
  },
})
