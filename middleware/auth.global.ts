/**
 * The flow gate.
 *
 *   no member          → the intro / access-code flow
 *   member, no setup   → the setup steps
 *   member, setup done → the app; the intro screens bounce to Home
 *
 * `/` is exempt: it is the splash, and it routes onward itself once its
 * animation finishes.
 *
 * Runs on every navigation. `plugins/store.client.ts` hydrates the store before
 * the app mounts, so these checks never see a half-loaded state.
 */

/** Reachable while signed out. */
const PUBLIC_ROUTES = ['/onboarding', '/access-code']

/** Reachable once signed in but before setup is finished. */
const SETUP_ROUTES = [
  '/setup/about-you',
  '/setup/body-metrics',
  '/setup/activity-goal',
  '/setup/safety-call',
]

export const FIRST_SETUP_STEP = SETUP_ROUTES[0]

export default defineNuxtRouteMiddleware((to) => {
  // The splash owns its own routing decision.
  if (to.path === '/') return

  const store = useAppStore()
  const isPublic = PUBLIC_ROUTES.includes(to.path)
  const isSetup = SETUP_ROUTES.includes(to.path)

  // Signed out: only the intro flow is reachable.
  if (!store.isAuthenticated.value) {
    return isPublic ? undefined : navigateTo('/access-code')
  }

  // Signed in but the profile isn't finished: keep them in setup.
  if (!store.isSetupComplete.value) {
    return isSetup ? undefined : navigateTo(FIRST_SETUP_STEP)
  }

  // Fully set up: the intro screens have nothing left to offer.
  if (isPublic || isSetup) return navigateTo('/home')
})
