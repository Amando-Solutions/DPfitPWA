/**
 * The flow gate.
 *
 *   no member          → the door: the tour once per device, then `/access-code`
 *                        to make an account or `/sign-in` to use one
 *   member, no setup   → the setup steps
 *   member, setup done → the app; the door screens bounce to Home
 *
 * "No member" covers three different situations, because an account exists a
 * moment before its code is redeemed: nobody signed in at all, somebody signed
 * in whose code was never redeemed, and somebody signed in whose member document
 * could not be read. The first may use either door. The other two are signed in
 * already, so a sign-in screen has nothing for them, and they belong on
 * `/access-code`, which redeems for the session or retries the read. Which door
 * is `store.doorRoute`, so this file and `pages/index.vue` cannot disagree.
 *
 * `/` is exempt: it has no screen of its own. The boot splash in
 * `spa-loading-template.html` covers the first paint, and `pages/index.vue`
 * hands the member on from there.
 *
 * Runs on every navigation. `plugins/store.client.ts` hydrates the store before
 * the app mounts, so these checks never see a half-loaded state.
 */

/** Reachable while signed out. */
export const PUBLIC_ROUTES = ['/onboarding', '/access-code', '/sign-in']

/**
 * Where setup begins. Declared before the list rather than read back out of it:
 * the door screens send a member here by name once they are in, and an indexed
 * read is `string | undefined`, which is not a route.
 */
export const FIRST_SETUP_STEP = '/setup/about-you'

/** Reachable once signed in but before setup is finished. */
export const SETUP_ROUTES = [
  FIRST_SETUP_STEP,
  '/setup/body-metrics',
  '/setup/activity-goal',
]

export default defineNuxtRouteMiddleware((to) => {
  // The entry route owns its own decision. See `pages/index.vue`.
   if (
    to.path === '/' ||
    to.path === '/sw.js' ||
    to.path === '/manifest.webmanifest' ||
    to.path.startsWith('/_nuxt/')
  ) {
    return
  }

  const store = useAppStore()
  const isPublic = PUBLIC_ROUTES.includes(to.path)
  const isSetup = SETUP_ROUTES.includes(to.path)

  // No member document — or no way to know there is one: only the door is
  // reachable. The tour only until it has been seen once: a device that has
  // been through it goes to its door instead, whether it got here from a
  // reload, a bookmark or Back.
  if (store.atTheDoor.value) {
    if (to.path === '/onboarding' && store.isOnboarded.value) {
      return navigateTo(store.doorRoute.value, { replace: true })
    }
    // Signed in already: only the access-code screen has a next step for them.
    if (store.gate.value !== 'needs-auth') {
      return to.path === '/access-code' ? undefined : navigateTo('/access-code', { replace: true })
    }
    return isPublic ? undefined : navigateTo(store.doorRoute.value)
  }

  // A member whose profile isn't finished: keep them in setup.
  if (store.gate.value === 'needs-setup') {
    return isSetup ? undefined : navigateTo(FIRST_SETUP_STEP)
  }

  // A paused member keeps the whole app: the pause stops their coaching, not
  // their access to what they have already logged.

  // Fully set up: the intro screens have nothing left to offer.
  if (isPublic || isSetup) return navigateTo('/home')
})
