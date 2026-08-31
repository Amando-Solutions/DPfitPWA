/**
 * The flow gate.
 *
 *   no member          → the intro / access-code flow
 *   member, no setup   → the setup steps
 *   member, setup done → the app; the intro screens bounce to Home
 *
 * "No member" now covers two different situations, because sign-in and cohort
 * membership came apart when auth became an email link: nobody signed in at
 * all, and somebody signed in who has not redeemed a code yet. Both belong on
 * `/access-code`, which shows whichever half is outstanding, so the routing
 * decision stays one branch. See `store.gate`.
 *
 * `/` is exempt: it has no screen of its own. The boot splash in
 * `spa-loading-template.html` covers the first paint, and `pages/index.vue`
 * hands the member on from there.
 *
 * Runs on every navigation. `plugins/store.client.ts` hydrates the store before
 * the app mounts, so these checks never see a half-loaded state.
 */

/** Reachable while signed out. */
const PUBLIC_ROUTES = ['/onboarding', '/access-code']

/**
 * Where setup begins. Declared before the list rather than read back out of it:
 * `/access-code` sends a member here by name once they redeem, and an indexed
 * read is `string | undefined`, which is not a route.
 */
export const FIRST_SETUP_STEP = '/setup/about-you'

/** Reachable once signed in but before setup is finished. */
const SETUP_ROUTES = [
  FIRST_SETUP_STEP,
  '/setup/body-metrics',
  '/setup/activity-goal',
  '/setup/safety-call',
]

export default defineNuxtRouteMiddleware((to) => {
  // The entry route owns its own decision. See `pages/index.vue`.
  if (to.path === '/') return

  const store = useAppStore()
  const isPublic = PUBLIC_ROUTES.includes(to.path)
  const isSetup = SETUP_ROUTES.includes(to.path)

  // No member document: only the intro flow is reachable, signed in or not.
  if (store.gate.value === 'needs-code') {
    return isPublic ? undefined : navigateTo('/access-code')
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
