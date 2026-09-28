// =============================================================================
// Push, as the browser sees it: whether this device can have it, the FCM token
// that addresses it, and the record of having turned it on.
//
// No Vue in here. `usePushNotifications` is the reactive face of this for the
// Profile switch; the store calls `releasePushDevice` on sign-out without
// going through a component.
//
// What a push says is decided server-side (`apps/functions/src/push.ts`), and
// how it's drawn by the worker (`public/push-sw.js`). This file only gets a
// device on and off the list.
// =============================================================================
import type { DataSource } from '~/lib/datasource'
import { firebaseApp } from '~/lib/firebase/app'
import { detectPlatform, isIosDevice, isStandalone } from '~/lib/platform'
import { storage } from '~/lib/storage'

/**
 * Whether push can be offered on this device.
 *  · `available`     — the switch works.
 *  · `needs-install` — iOS in a browser tab. WebKit offers push only to an app
 *                      added to the Home Screen, from iOS 16.4.
 *  · `unsupported`   — no Push API, or the deploy has no Web Push key.
 */
export type PushAvailability = 'available' | 'needs-install' | 'unsupported'

export const pushAvailability = (vapidKey: string): PushAvailability => {
  if (import.meta.server || !vapidKey) return 'unsupported'
  if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) {
    return 'available'
  }
  return isIosDevice() && !isStandalone() ? 'needs-install' : 'unsupported'
}

// --- The record --------------------------------------------------------------

/**
 * Account-scoped, not a device key, so sign-out takes it with the rest. A
 * member who signs in after somebody else on the same phone starts with push
 * off, even though the browser's permission is still granted.
 */
const RECORD_KEY = 'push-device'

export interface PushRecord {
  /** This browser's id for itself, and its document id under `pushDevices`. */
  id: string
  /** Whose registration it is. */
  uid: string
  token: string
  /** When the registration was last written, epoch ms. */
  syncedAt: number
}

export const readPushRecord = (): PushRecord | null =>
  storage.read<PushRecord | null>(RECORD_KEY, null)

/**
 * How often an open app rewrites its registration. FCM rotates tokens, and
 * `updatedAt` is the only way anybody can tell a live device from a forgotten
 * one. `getToken` answers from its own cache in between, so opening the app
 * costs nothing most days.
 */
const REFRESH_MS = 7 * 24 * 60 * 60 * 1000

/** What sign-out is prepared to wait for each step of the release. */
const RELEASE_TIMEOUT_MS = 4000

// --- The token ---------------------------------------------------------------

/**
 * The FCM token for this browser, through the worker `@vite-pwa/nuxt`
 * registered.
 *
 * Firebase would otherwise register its own `firebase-messaging-sw.js`, and a
 * second worker on the same scope would replace the one serving the app. So
 * it's handed ours, which carries the push handler through `importScripts`.
 * There is no worker under `nuxt dev`; push needs a build.
 */
const pushToken = async (vapidKey: string): Promise<string> => {
  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration) throw new Error('No service worker is registered, so there is nothing to push to.')
  // Loaded on demand, so the messaging SDK costs nothing until push is used.
  const { getMessaging, getToken, isSupported } = await import('firebase/messaging')
  if (!(await isSupported())) throw new Error('This browser cannot receive Firebase messages.')
  return getToken(getMessaging(firebaseApp()), { vapidKey, serviceWorkerRegistration: registration })
}

const within = <T>(work: Promise<T>): Promise<T> =>
  Promise.race([
    work,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Timed out')), RELEASE_TIMEOUT_MS),
    ),
  ])

// --- On and off --------------------------------------------------------------

/**
 * Put this device on the list for `uid`.
 *
 * Only once permission is granted: asking is the caller's job, because it has
 * to happen inside the tap. Reuses the device's id when it has one for this
 * member, so turning push off and on again replaces rather than adds.
 */
export const registerPushDevice = async (
  data: DataSource,
  uid: string,
  vapidKey: string,
): Promise<void> => {
  const token = await pushToken(vapidKey)
  const previous = readPushRecord()
  const id = previous?.uid === uid ? previous.id : crypto.randomUUID()
  await data.registerPushDevice({ id, token, platform: detectPlatform() })
  storage.write<PushRecord>(RECORD_KEY, { id, uid, token, syncedAt: Date.now() })
}

/**
 * Keep an existing registration true, as the app opens.
 *
 * Permission can be withdrawn in the phone's settings without the app being
 * told, so this is where a device that can no longer show anything comes off
 * the list. Otherwise the token is re-read and the document rewritten when the
 * token has changed or the last write is old.
 */
export const refreshPushDevice = async (
  data: DataSource,
  uid: string,
  vapidKey: string,
): Promise<void> => {
  const record = readPushRecord()
  if (!record) return
  // Somebody else's, left by a sign-out that didn't finish. Theirs to clean
  // up; the functions skip it anyway, since its sign-in is no longer theirs.
  if (record.uid !== uid) {
    storage.remove(RECORD_KEY)
    return
  }
  if (Notification.permission !== 'granted') {
    await releasePushDevice(data)
    return
  }
  const token = await pushToken(vapidKey)
  if (token === record.token && Date.now() - record.syncedAt < REFRESH_MS) return
  await data.registerPushDevice({ id: record.id, token, platform: detectPlatform() })
  storage.write<PushRecord>(RECORD_KEY, { ...record, token, syncedAt: Date.now() })
}

/**
 * Take this device off the list, as far as it can be without a network.
 *
 * Two steps that fail independently, so neither waits on the other:
 *
 *  · the document goes, so nothing is sent to try;
 *  · the browser's push subscription is ended, on the device. That needs no
 *    network, and it is what makes an offline sign-out safe: the browser won't
 *    wake the worker again, and FCM's next send to the old token comes back
 *    "not registered", which makes the functions delete the document
 *    themselves.
 *
 * Not Firebase's `deleteToken`. On a page that hasn't called `getToken` since
 * it loaded (a sign-out after a reload, say), it registers Firebase's own
 * `firebase-messaging-sw.js` first, which this app doesn't serve. Ending the
 * subscription gets the same result, and the SDK notices the next time
 * `getToken` runs and fetches a fresh token.
 *
 * Never throws, and waits a few seconds at most: sign-out calls it, and a
 * sign-out that hung on a dead connection would be worse than a stray
 * document.
 */
export const releasePushDevice = async (data: DataSource): Promise<void> => {
  const record = readPushRecord()
  if (!record) return
  storage.remove(RECORD_KEY)

  await Promise.allSettled([
    within(data.unregisterPushDevice(record.id)),
    within(
      (async () => {
        const registration = await navigator.serviceWorker?.getRegistration()
        const subscription = await registration?.pushManager.getSubscription()
        await subscription?.unsubscribe()
      })(),
    ),
  ])
}
