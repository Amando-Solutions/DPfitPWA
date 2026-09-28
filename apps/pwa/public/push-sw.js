/**
 * Push, inside the app's service worker.
 *
 * `@vite-pwa/nuxt` generates `sw.js` with Workbox and pulls this in through
 * `workbox.importScripts` (see `nuxt.config.ts`), so it runs in the same worker
 * that serves the precache. Plain JS and dependency-free on purpose: the worker
 * isn't bundled, and nothing here needs the Firebase SDK. FCM hands the worker
 * `{ data, from, fcmMessageId }`, and `data` is the payload
 * `apps/functions/src/push.ts` writes: tag, title, body, url, renotify.
 * Change one, change both.
 */

/**
 * Whether the browser forgives a push that shows nothing.
 *
 * Chromium does while a window of the site is in front, so a mention that
 * arrives while the member is reading the chat stays quiet: the bell in the app
 * has it already. WebKit doesn't forgive it. Safari (and every iOS home-screen
 * app) revokes a subscription that receives pushes without showing them, so
 * there every push is shown, open app or not. Firefox's rules aren't
 * documented, so it's treated like WebKit.
 */
const MAY_STAY_QUIET = /Chrome\/|Chromium\//.test(self.navigator.userAgent)

const ICON = '/brand/icon-192.png'

const readPayload = (event) => {
  try {
    return event.data?.json()?.data ?? {}
  } catch {
    return {}
  }
}

const inFront = async () => {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  return windows.some((w) => w.visibilityState === 'visible' && w.focused)
}

self.addEventListener('push', (event) => {
  const data = readPayload(event)

  event.waitUntil(
    (async () => {
      if (MAY_STAY_QUIET && (await inFront())) return

      // A payload that didn't parse still has to show something, or WebKit
      // counts it against the subscription.
      await self.registration.showNotification(data.title || 'DP Fitness', {
        body: data.body || 'You have a new notification.',
        icon: ICON,
        tag: data.tag || undefined,
        renotify: Boolean(data.tag && data.renotify),
        data: { url: data.url || '/notifications' },
      })
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/notifications', self.location.origin)
  // Only ever a path in this app.
  const path = target.origin === self.location.origin ? target.pathname + target.search : '/'

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin)

      // An open app is told where to go rather than reloaded onto it, so the
      // router moves and nothing the member was part-way through is lost.
      // `plugins/push.client.ts` listens for this.
      if (open) {
        open.postMessage({ type: 'push:open', path })
        // Refused when the browser decides the click has gone stale. The
        // message has been sent either way, so the app lands in the right
        // place the next time it is looked at.
        await open.focus().catch(() => {})
        return
      }
      await self.clients.openWindow(path)
    })(),
  )
})
