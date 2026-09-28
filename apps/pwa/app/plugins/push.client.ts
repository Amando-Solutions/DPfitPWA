/**
 * Push, app-wide.
 *
 * Two jobs that can't wait for somebody to open the Profile screen:
 *
 *  · keeping this device's registration true as the app opens, and when the
 *    member on it changes. A token FCM has rotated, or a permission withdrawn
 *    in the phone's settings, is only noticed here. See `refreshPushDevice`.
 *
 *  · following a tapped notification when the app is already open. The worker
 *    posts the path rather than reloading the window onto it, so the router
 *    moves and nothing half-typed is lost. See `public/push-sw.js`.
 *
 * After `app-store`, because both answers depend on who is signed in.
 */
export default defineNuxtPlugin({
  name: 'push',
  dependsOn: ['app-store'],

  setup() {
    const push = usePushNotifications()
    const store = useAppStore()
    const router = useRouter()

    watch(
      () => store.member.value?.id ?? null,
      () => void push.sync(),
      { immediate: true },
    )

    if (!('serviceWorker' in navigator)) return

    const onMessage = (event: MessageEvent) => {
      const { type, path } = (event.data ?? {}) as { type?: unknown; path?: unknown }
      if (type !== 'push:open' || typeof path !== 'string') return
      // A path in this app, never somewhere else by way of `//host`.
      if (!path.startsWith('/') || path.startsWith('//')) return
      void router.push(path)
    }

    navigator.serviceWorker.addEventListener('message', onMessage)

    import.meta.hot?.dispose(() => {
      navigator.serviceWorker.removeEventListener('message', onMessage)
    })
  },
})
