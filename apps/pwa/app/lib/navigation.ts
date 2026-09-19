import { navItems } from '~/composables/useNavigation'
import { PUBLIC_ROUTES, SETUP_ROUTES } from '~/middleware/auth.global'

// --- History -----------------------------------------------------------------

/**
 * The in-app entry behind the current one, as Vue Router recorded it.
 *
 * Vue Router writes `back` into every entry's `history.state`, and the state
 * survives a reload, so this stays right after a refresh. It is `null` on the
 * first entry the app wrote, which is what a deep link, a notification tap or a
 * cold start of the installed app looks like. That is exactly when
 * `router.back()` would leave the app instead of going up a screen.
 */
export const historyBack = (): string | null => {
  const back = window.history.state?.back
  return typeof back === 'string' ? back : null
}

/** Vue Router numbers each entry it writes, so going back is a smaller number. */
export const historyPosition = (): number => {
  const position = window.history.state?.position
  return typeof position === 'number' ? position : 0
}

// --- Where a path sits -------------------------------------------------------

const pathOf = (fullPath: string) => fullPath.split(/[?#]/, 1)[0] || '/'

/** One of the five destinations in the tab bar. */
export const isTabRoot = (path: string) =>
  navItems.some((item) => item.to === pathOf(path))

/** Which side of the gate a path is on. See `middleware/auth.global.ts`. */
export const sectionOf = (path: string): 'door' | 'setup' | 'app' => {
  const p = pathOf(path)
  if (PUBLIC_ROUTES.includes(p)) return 'door'
  if (SETUP_ROUTES.includes(p)) return 'setup'
  return 'app'
}

/** `/train` is above `/train/d1/complete`; it is not above `/trainer`. */
export const isAncestor = (above: string, below: string) => {
  const a = pathOf(above)
  const b = pathOf(below)
  return a !== b && b.startsWith(a.endsWith('/') ? a : `${a}/`)
}

/**
 * What iOS writes beside the chevron: the name of the screen Back lands on.
 * Only the tabs have names short enough to be worth it; anything else is
 * "Back", which is what UIKit falls back to as well.
 */
export const backLabel = (fullPath: string | null): string =>
  navItems.find((item) => item.to === pathOf(fullPath ?? ''))?.label ?? 'Back'

// --- Intent ------------------------------------------------------------------

/**
 * Why the next navigation is happening, when the app knows better than history.
 *
 *  · `back`  — a Back button. With no history behind it that is a `replace` to
 *              the screen above, which history alone would read as a push.
 *  · `swipe` — the iOS edge swipe. It has already moved the screen under the
 *              member's finger, so the navigation must not animate it again.
 */
export type NavIntent = 'back' | 'swipe'

let pending: { intent: NavIntent; at: number } | null = null

export const setNavIntent = (intent: NavIntent) => {
  pending = { intent, at: Date.now() }
}

/**
 * Read once, by the navigation it was set for. Stale after a second, in case
 * that navigation never came: an intent left lying around would otherwise
 * decide how some unrelated navigation later on looks.
 */
export const takeNavIntent = (): NavIntent | null => {
  const taken = pending
  pending = null
  return taken && Date.now() - taken.at < 1000 ? taken.intent : null
}

// --- The Back on screen ------------------------------------------------------

/**
 * What the screen's Back button would do, so the edge swipe can do the same.
 *
 * The swipe is offered only where a Back button is, and only while it is
 * enabled. A screen frozen mid-save can't be swiped away any more than it can
 * be tapped away.
 */
export interface BackHandler {
  go: (intent: NavIntent) => void
  enabled: () => boolean
}

const handlers: BackHandler[] = []

export const registerBackHandler = (handler: BackHandler) => {
  handlers.push(handler)
  return () => {
    const index = handlers.indexOf(handler)
    if (index !== -1) handlers.splice(index, 1)
  }
}

/**
 * The newest Back on screen, if it can be used right now. Newest, because
 * during a screen change the incoming page can mount before the outgoing one
 * has let go of its button.
 */
export const activeBackHandler = (): BackHandler | undefined => {
  const handler = handlers.at(-1)
  return handler?.enabled() ? handler : undefined
}
