/**
 * Keeps the trusted clock current.
 *
 * The store restores the last known network offset while it hydrates, so the
 * first paint already has a date. This plugin does the parts that can wait: it
 * asks the network for the real time, re-asks whenever the app comes back to
 * the foreground, and rolls the date over at midnight so a phone left open
 * overnight unlocks the next session without a reload.
 *
 * Nothing here is awaited by the boot path. A member on a plane keeps the
 * offset from last time, which is the point of storing an offset rather than a
 * timestamp.
 */
export default defineNuxtPlugin({
  name: 'app-clock',
  dependsOn: ['app-store'],

  setup(nuxtApp) {
    const store = useAppStore()

    let rollover: ReturnType<typeof setTimeout> | null = null

    /**
     * Wake once, at the next local midnight, rather than polling.
     *
     * Timers are clamped hard in a backgrounded tab, so the wake can arrive
     * late. That is fine: it re-reads the clock and schedules the following
     * midnight from wherever it actually landed, and the visibility handler
     * covers the case where the tab slept straight through the boundary.
     */
    const scheduleRollover = () => {
      if (rollover) clearTimeout(rollover)
      const wait = store.nextSessionAt.value.getTime() - store.now.value.getTime()
      rollover = setTimeout(() => {
        store.tick()
        scheduleRollover()
      }, Math.max(1000, wait + 1000))
    }

    const onVisibility = () => {
      if (document.hidden) return
      // Back from the background: the date may have moved on while we were away.
      store.tick()
      void store.refreshClock().then(scheduleRollover)
    }

    void store.refreshClock().then(scheduleRollover)
    document.addEventListener('visibilitychange', onVisibility)

    nuxtApp.hook('app:unmounted', () => {
      document.removeEventListener('visibilitychange', onVisibility)
      if (rollover) clearTimeout(rollover)
    })
  },
})
