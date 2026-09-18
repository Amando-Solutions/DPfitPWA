/**
 * Which device conventions the app should follow.
 *
 *  · `ios`     — iPhone and iPad. Chevron-and-label Back, centred titles, pushes
 *                that slide in from the right, and the edge swipe.
 *  · `android` — the arrow Back, left-aligned titles, Material's shared-axis
 *                motion, and the system back button closing sheets first.
 *  · `desktop` — everything else, which gets the plain web: no screen
 *                transitions and no gestures.
 *
 * Read from the user agent once per session. The layout still answers to the
 * viewport, so an iPad in landscape keeps the desktop side rail; this only
 * decides how navigation looks and moves inside whichever layout is showing.
 */
export type Platform = 'ios' | 'android' | 'desktop'

export const isIosDevice = (): boolean => {
  if (import.meta.server) return false
  const ua = navigator.userAgent
  // iPadOS 13+ reports itself as a Mac, and only the touch points give it away.
  return (
    /iPhone|iPad|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  )
}

const isAndroidDevice = (): boolean => {
  if (import.meta.server) return false
  return /Android/i.test(navigator.userAgent)
}

/** Launched from the home screen rather than opened in a browser tab. */
export const isStandalone = (): boolean => {
  if (import.meta.server) return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    // Safari's own flag, which iOS set for years before it understood the
    // display-mode query, and still sets today.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export const detectPlatform = (): Platform => {
  if (isIosDevice()) return 'ios'
  if (isAndroidDevice()) return 'android'
  return 'desktop'
}
