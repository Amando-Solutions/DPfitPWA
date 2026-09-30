import { useDataSourceClient } from '~/lib/datasource'
import { isFirebaseConfigured, type FirebaseWebConfig } from '~/lib/firebase/app'
import {
  pushAvailability,
  readPushRecord,
  refreshPushDevice,
  registerPushDevice,
  releasePushDevice,
  type PushAvailability,
} from '~/lib/push'

/**
 * The inbox, pushed to this device: the Profile switch and what keeps it true.
 *
 * Per device, not per member. The subscription belongs to this browser, and
 * only one device holds the account at a time anyway, so "on" means "this
 * phone buzzes". Signing in somewhere else starts that device with it off.
 *
 * The plumbing is in `lib/push`. This adds the state a screen draws and the
 * one rule a screen can't be trusted to remember: the permission prompt is
 * asked for inside the tap, before anything is awaited.
 */

const readPermission = (): NotificationPermission =>
  import.meta.client && 'Notification' in window ? Notification.permission : 'default'

/** Window-level wiring belongs to the app, not to whichever component asked first. */
let wired = false

/**
 * Bumped by every ask and every cancel, so an answer that arrives after the
 * member has moved on is recorded but acted on only if it is still the latest.
 * Module-level because the switch and the prompt card are two callers of one
 * question.
 */
let asked = 0

export const usePushNotifications = () => {
  const config = useRuntimeConfig().public
  const firebase = (config.firebase ?? {}) as Partial<FirebaseWebConfig>
  // Push goes through FCM, so it needs the Firestore data source behind it.
  const vapidKey =
    isFirebaseConfigured(firebase)
      ? String(firebase.vapidKey ?? '').trim()
      : ''

  const data = useDataSourceClient()
  const store = useAppStore()

  const availability = useState<PushAvailability>('push-availability', () =>
    pushAvailability(vapidKey),
  )
  const permission = useState<NotificationPermission>('push-permission', readPermission)
  const enabled = useState<boolean>('push-enabled', () => readPushRecord() !== null)
  /**
   * The browser's permission prompt is up, and turning push on is waiting on
   * the answer.
   *
   * Kept apart from `busy` because it can last forever. Nothing obliges the
   * member to answer: Chrome folds a prompt they click away from into a chip in
   * the address bar and leaves the request open, so a lock held across it never
   * lifts. Nothing is being written yet, so nothing needs freezing. The switch
   * stays live, and tapping it off cancels the wait.
   */
  const asking = useState<boolean>('push-asking', () => false)
  /** The registration is being written or removed. Freezes the controls, as any write does. */
  const busy = useState<boolean>('push-busy', () => false)
  const error = useState<string>('push-error', () => '')

  if (!wired && import.meta.client) {
    wired = true
    // Coming back from the phone's settings is the one way permission changes
    // behind the app's back, and it always lands here.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) permission.value = readPermission()
    })
  }

  /** Whether the switch does anything if tapped. */
  const canToggle = computed(
    () => availability.value === 'available' && (enabled.value || permission.value !== 'denied'),
  )

  /**
   * Ask, and if the answer is yes, put this device on the list.
   *
   * Call it straight from a tap handler. Safari shows the prompt only from
   * inside the gesture that asked, and an `await` in front of
   * `requestPermission` is enough to lose it. A "no" or a dismissed prompt
   * leaves push off without an error: that is an answer, not a failure.
   *
   * Asking again while a prompt is open is allowed, and is how a member gets
   * back to a prompt they lost: Chrome brings the folded one back up. Only the
   * newest ask acts on the answer.
   */
  const enable = async () => {
    const uid = store.authUser.value?.uid
    if (busy.value || enabled.value || !uid || availability.value !== 'available') return
    const ask = ++asked
    asking.value = true
    error.value = ''

    let answer: NotificationPermission
    try {
      answer = await Notification.requestPermission()
    } catch (cause) {
      console.error('[push] the permission request failed', cause)
      if (ask === asked) asking.value = false
      return
    }
    permission.value = answer
    // Turned off, asked again, or signed out while the prompt was up. The
    // answer still stands; what it was answering doesn't.
    if (ask !== asked || store.authUser.value?.uid !== uid) return
    asking.value = false
    if (answer !== 'granted') return

    busy.value = true
    try {
      await registerPushDevice(data, uid, vapidKey)
      enabled.value = true
    } catch (cause) {
      console.error('[push] could not turn push on', cause)
      error.value = 'Couldn’t turn on notifications. Check your connection and try again.'
    } finally {
      busy.value = false
    }
  }

  /**
   * Turn push off, or stop waiting on a prompt that hasn't been answered.
   *
   * Cancelling is all it takes while nothing is registered. Otherwise it
   * always lands: see `releasePushDevice`, which cannot fail.
   */
  const disable = async () => {
    if (busy.value) return
    asked++
    asking.value = false
    error.value = ''
    if (!enabled.value) return
    busy.value = true
    try {
      await releasePushDevice(data)
    } finally {
      enabled.value = false
      busy.value = false
    }
  }

  /**
   * Bring the switch and the registration back in line with the device, as
   * the app opens or the member changes. Run by `plugins/push.client.ts`.
   */
  const sync = async () => {
    const uid = store.authUser.value?.uid
    permission.value = readPermission()
    if (uid && availability.value === 'available') {
      try {
        await refreshPushDevice(data, uid, vapidKey)
      } catch (cause) {
        // Offline, most likely. The registration that is there keeps working
        // until the token rotates, and the next open tries again.
        console.warn('[push] could not refresh this device', cause)
      }
    }
    enabled.value = readPushRecord() !== null
  }

  return { availability, permission, enabled, asking, busy, error, canToggle, enable, disable, sync }
}
