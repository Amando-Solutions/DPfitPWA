/**
 * Goes looking for a new service worker.
 *
 * `registerType: 'autoUpdate'` means a worker the browser *finds* is installed,
 * activated and the page reloaded underneath it without anyone tapping
 * anything. What the module never does is go looking. Its only update check is
 * the `navigator.serviceWorker.register()` call it makes as the page boots, and
 * `client.periodicSyncForUpdates` — the module's own interval — defaults to 0.
 * One check, at page load, and that is the whole of it.
 *
 * For a browser tab that gets closed and reopened, that is enough: reopening is
 * a page load. For an installed PWA it is not. iOS and Android freeze the
 * document when the app goes to the background and thaw the same one when it
 * comes back, so relaunching from the home screen resumes a page that is
 * already running — no load, no `register()`, no check. The member keeps the
 * worker they installed the day they added the app, and that worker keeps
 * answering every navigation from the precache of the build that was live that
 * day. A deploy could not reach them, and clearing site data was the only cure
 * because unregistering the worker was the only thing that actually happened.
 *
 * So: check when the app comes back to the foreground, which is the moment a
 * frozen document rejoins the world and the one a relaunch always produces.
 * `update()` re-fetches `/sw.js` past the HTTP cache — that is what the default
 * `updateViaCache: 'imports'` buys — and hands it to the browser's byte
 * comparison, making this the same check a cold load would have made. If the
 * bytes differ the module's own listener takes it from there: install,
 * `skipWaiting`, activate, reload.
 *
 * The reload lands a second or two after the app is reopened, which is the
 * cheapest moment to interrupt anyone. The interval below is a backstop for the
 * session that never backgrounds at all — a phone propped up on a bench between
 * sets — and is deliberately slow, because a reload during a session the member
 * is actually in costs them whatever they were part-way through typing.
 */

/** Never check twice inside this window; a resume can fire in bursts. */
const MIN_GAP_MS = 60 * 1000

/** Backstop for a session left in the foreground. */
const INTERVAL_MS = 60 * 60 * 1000

export default defineNuxtPlugin({
  name: 'sw-update',

  setup() {
    if (!('serviceWorker' in navigator)) return

    let registration: ServiceWorkerRegistration | null = null

    // Seeded to now, not 0, because booting *is* a check: `register()` runs the
    // update algorithm every time it is called with a scope that already has a
    // registration, and the module calls it as this page loads. Starting the
    // clock here keeps a resume moments after boot from asking again for
    // nothing.
    let lastCheck = Date.now()

    const check = () => {
      // Offline, an install already in flight, or asked again too soon. The
      // `installing` guard matters most: a check that lands mid-install
      // restarts it, and on a slow connection that can keep the worker from
      // ever finishing.
      if (!registration || registration.installing) return
      if (navigator.onLine === false) return

      const now = Date.now()
      if (now - lastCheck < MIN_GAP_MS) return
      lastCheck = now

      // Rejects whenever the network does, and on a 404 while a deploy is
      // mid-flight. Neither is worth surfacing: the next resume tries again.
      void registration.update().catch(() => {})
    }

    const onVisibility = () => {
      if (document.hidden) return
      check()
    }

    // Restored from the back/forward cache, which is the other way a document
    // resumes without loading.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) check()
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('online', check)
    // Belt and braces for iOS, which has been unreliable about firing
    // `visibilitychange` on a standalone app returning from the switcher — and
    // iOS is where a frozen document survives longest. Costs nothing: `focus`
    // is noisy but every extra call is thrown away by the throttle.
    window.addEventListener('focus', check)

    const timer = setInterval(check, INTERVAL_MS)

    // `ready` settles once this page has an active worker, so the first visit —
    // where the worker is still installing and there is by definition nothing
    // newer to find — resolves only after it takes over. Resumes that fire
    // before then are dropped by the null guard, which is correct: they would
    // have found nothing.
    void navigator.serviceWorker.ready.then((r) => {
      registration = r
    })

    // Same reasoning as the clock plugin: a real teardown takes the page with
    // it. This is for HMR, which would otherwise leave a listener set and an
    // interval behind on every edit.
    import.meta.hot?.dispose(() => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('online', check)
      window.removeEventListener('focus', check)
      clearInterval(timer)
    })
  },
})
