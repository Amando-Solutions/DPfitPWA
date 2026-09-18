import { isIosDevice, isStandalone } from '~/lib/platform'
import { storage } from '~/lib/storage'

/**
 * Adding the app to the home screen.
 *
 * Two very different routes hide behind one button. Chromium hands the page a
 * deferred `beforeinstallprompt` event, so installing is a single tap; WebKit
 * never fires it, so on iOS the only route is the Share sheet and the most the
 * app can do is show the member where it is. `method` is what tells those
 * apart, and every surface reads it rather than sniffing the browser itself.
 *
 * The capture is set up by `@vite-pwa/nuxt` (`client.installPrompt` in
 * `nuxt.config.ts`), which is also what suppresses Chrome's own mini-infobar.
 * Suppressing that is only defensible because something else offers the
 * install in its place, and this is that something.
 */

/** Key inside the app's storage namespace, so sign-out clears it with the rest. */
export const INSTALL_SNOOZE_KEY = 'install-snoozed-at'

/** How long "Not now" keeps the home card away. The More hub keeps its row. */
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000

/**
 * How this device can install.
 *  · `prompt` — Chromium has offered the deferred event; one tap does it.
 *  · `ios`    — WebKit, where the Share sheet is the only route.
 *  · `manual` — the browser can install, but the deferred event is spent, so
 *               its own menu is all that is left.
 */
export type InstallMethod = 'prompt' | 'ios' | 'manual'

/** Window-level wiring belongs to the app, not to whichever component asked first. */
let wired = false

export const useInstallApp = () => {
  const { $pwa } = useNuxtApp()

  const installed = useState<boolean>('install-installed', isStandalone)
  const promptOffered = useState<boolean>('install-prompt-offered', () => false)
  const snoozedAt = useState<number>('install-snoozed-at', () =>
    storage.read<number>(INSTALL_SNOOZE_KEY, 0),
  )
  const guideOpen = useState<boolean>('install-guide-open', () => false)
  const ios = useState<boolean>('install-ios', isIosDevice)

  if (!wired && !import.meta.server) {
    wired = true

    /* Detached on purpose. Whether this browser can install at all is a fact
       about the session, but the first caller here is a component, so a plain
       `watch` would be collected by that component's scope and stop latching
       the moment it unmounted. */
    effectScope(true).run(() => {
      watch(
        () => $pwa?.showInstallPrompt === true,
        (offered) => {
          if (offered) promptOffered.value = true
        },
        { immediate: true },
      )
    })

    // Also fires for installs done from the browser's own menu, which is the
    // one case the button below never hears about.
    window.addEventListener('appinstalled', () => {
      installed.value = true
    })
  }

  /* Not the module's word on iOS. It counts any iOS browser without "Safari" in
     its user agent as installed, and the in-app browsers of Instagram, Facebook
     and the like leave it out — so those read as the home-screen app, and the
     ask to open in Safari and add it never showed. `navigator.standalone`,
     read into `installed` above, is only true for the real thing. */
  const isInstalled = computed(
    () => installed.value || (!ios.value && $pwa?.isPWAInstalled === true),
  )

  const method = computed<InstallMethod | null>(() => {
    if (isInstalled.value) return null
    if ($pwa?.showInstallPrompt) return 'prompt'
    if (ios.value) return 'ios'
    /* Only offer the menu route to a browser that has proved it can install.
       Desktop Firefox cannot, and pointing it at a menu item that is not there
       is worse than saying nothing. */
    return promptOffered.value ? 'manual' : null
  })

  const canInstall = computed(() => method.value !== null)

  /**
   * Running as the iOS home-screen app.
   *
   * The one installed context that is cut off from the browser twice over: it
   * keeps its own storage, so a sign-in in Safari is not a sign-in here, and
   * links tapped in other apps open in Safari rather than coming back here —
   * sign-in links included.
   */
  const onIosHomeScreen = computed(() => ios.value && installed.value)

  /** One tap where the browser allows it, directions where it does not. */
  const ctaLabel = computed(() =>
    method.value === 'prompt' ? 'Install app' : 'How to install',
  )

  const snoozed = computed(() => Date.now() - snoozedAt.value < SNOOZE_MS)

  /** The home card is opt-out; the More row stays put while installing is possible. */
  const showCard = computed(() => canInstall.value && !snoozed.value)

  const openGuide = () => {
    guideOpen.value = true
  }

  /**
   * Dismissing the native dialog spends the deferred event, so `method` falls
   * through to `manual` afterwards and the same button starts explaining the
   * browser menu instead of trying to prompt again.
   */
  const install = async (): Promise<'accepted' | 'dismissed' | 'guide'> => {
    if (method.value !== 'prompt' || !$pwa) {
      openGuide()
      return 'guide'
    }
    const choice = await $pwa.install()
    if (choice?.outcome === 'accepted') {
      installed.value = true
      return 'accepted'
    }
    return 'dismissed'
  }

  const snooze = () => {
    snoozedAt.value = Date.now()
    storage.write(INSTALL_SNOOZE_KEY, snoozedAt.value)
  }

  return {
    method,
    ctaLabel,
    canInstall,
    isInstalled,
    onIosHomeScreen,
    showCard,
    guideOpen,
    install,
    openGuide,
    snooze,
  }
}
