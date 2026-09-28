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

export const usePushNotifications = () => {
  const config = useRuntimeConfig().public
  const firebase = (config.firebase ?? {}) as Partial<FirebaseWebConfig>
  // Push goes through FCM, so it needs the Firestore data source behind it.
  // Mock mode and the REST implementation have nothing to send from.
  const vapidKey =
    config.useMockData === false && isFirebaseConfigured(firebase)
      ? String(firebase.vapidKey ?? '').trim()
      : ''

  const data = useDataSourceClient()
  const store = useAppStore()

  const availability = useState<PushAvailability>('push-availability', () =>
    pushAvailability(vapidKey),
  )
  const permission = useState<NotificationPermission>('push-permission', readPermission)
  const enabled = useState<boolean>('push-enabled', () => readPushRecord() !== null)
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
   * Call it straight from the switch's handler. Safari shows the prompt only
   * from inside the gesture that asked, and an `await` in front of
   * `requestPermission` is enough to lose it. A "no" or a dismissed prompt
   * leaves the switch off without an error: that is an answer, not a failure.
   */
  const enable = async () => {
    const uid = store.authUser.value?.uid
    if (busy.value || !uid || availability.value !== 'available') return
    busy.value = true
    error.value = ''
    try {
      permission.value = await Notification.requestPermission()
      if (permission.value !== 'granted') return
      await registerPushDevice(data, uid, vapidKey)
      enabled.value = true
    } catch (cause) {
      console.error('[push] could not turn push on', cause)
      error.value = 'Couldn’t turn on notifications. Check your connection and try again.'
    } finally {
      busy.value = false
    }
  }

  /** Always lands: see `releasePushDevice`, which cannot fail. */
  const disable = async () => {
    if (busy.value) return
    busy.value = true
    error.value = ''
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

  return { availability, permission, enabled, busy, error, canToggle, enable, disable, sync }
}
