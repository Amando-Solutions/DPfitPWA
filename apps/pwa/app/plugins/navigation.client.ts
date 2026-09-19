import type { RouteLocationNormalized } from 'vue-router'
import {
  historyPosition,
  isAncestor,
  isTabRoot,
  sectionOf,
  takeNavIntent,
} from '~/lib/navigation'

/**
 * How moving between screens looks, decided once per navigation.
 *
 * The move itself is a View Transition: Nuxt's `experimental.viewTransition`,
 * switched off app-wide in `nuxt.config.ts` and switched on here per
 * navigation. Snapshots rather than Vue `<Transition>`s, for two reasons:
 *
 *  · The screens that most need it (the workout, the coach DM) render with
 *    `layout: false`, and NuxtLayout drops its `<Transition>` whenever the
 *    layout it is changing to is `false`. Pushing into a workout would never
 *    have animated.
 *  · The outgoing screen is a picture, so the incoming one resetting the
 *    layout's shared scroller can't yank it to the top mid-slide.
 *
 * This file only decides the direction, and writes it to `<html data-nav>` for
 * `assets/styles/navigation.css` to draw:
 *
 *  · forward: deeper, a push from a list to its detail.
 *  · back:    shallower. History back, a Back button, or a push to a screen
 *             above this one (Discard sending a workout back to Train).
 *  · tab:     sideways between the five tabs. Android fades through; iOS
 *             switches tabs instantly, so there it is `none`.
 *  · fade:    across the gate. Signing in, finishing setup, signing out.
 *  · none:    desktop, the first screen, and anything the browser or the iOS
 *             edge swipe has already animated.
 *
 * Browsers without View Transitions, and anyone who asks for reduced motion
 * (which Nuxt's plugin honours), swap screens instantly, as they always have.
 */
type NavMotion = 'forward' | 'back' | 'tab' | 'fade' | 'none'

/** Screens that draw the tab bar, or the side rail in its place. */
const hasAppNav = (route: RouteLocationNormalized) =>
  route.meta.layout === 'app' || isTabRoot(route.path)

export default defineNuxtPlugin(() => {
  const router = useRouter()
  const { platform, standalone } = usePlatform()
  const root = document.documentElement

  root.dataset.platform = platform.value

  /** The history entry on screen as of the last navigation that landed. */
  let position = historyPosition()

  const motionFor = (
    to: RouteLocationNormalized,
    from: RouteLocationNormalized,
  ): NavMotion => {
    const intent = takeNavIntent()
    if (platform.value === 'desktop' || !from.matched.length || intent === 'swipe') {
      return 'none'
    }

    // A popstate has already moved `history.state` by the time guards run. A
    // push or a replace hasn't happened yet, so it still reads as `position`.
    const now = historyPosition()
    const popped = now !== position

    // In a Safari tab, a history step the app didn't ask for is most likely
    // Safari's own edge swipe, which has animated it already and doesn't
    // reliably say so through `hasUAVisualTransition`. A second slide on top
    // of that looks broken.
    if (popped && !intent && platform.value === 'ios' && !standalone.value) return 'none'

    if (isTabRoot(to.path) && isTabRoot(from.path)) {
      return platform.value === 'ios' ? 'none' : 'tab'
    }
    if (sectionOf(to.path) !== sectionOf(from.path)) return 'fade'
    if (intent === 'back' || now < position) return 'back'
    if (now > position) return 'forward'
    return isTabRoot(to.path) || isAncestor(to.path, from.path) ? 'back' : 'forward'
  }

  router.beforeEach((to, from) => {
    const motion = motionFor(to, from)
    root.dataset.nav = motion
    // The tab bar holds still while the screen moves under it, but only when
    // it is on both screens. Going to or from a screen without one, it belongs
    // to the screen it is on and moves with it, as UIKit's does.
    root.dataset.navBar = hasAppNav(to) && hasAppNav(from) ? 'keep' : ''
    to.meta.viewTransition = motion !== 'none'
  })

  router.afterEach((_to, _from, failure) => {
    if (!failure) position = historyPosition()
  })
})
