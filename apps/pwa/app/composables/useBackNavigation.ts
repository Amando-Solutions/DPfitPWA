import {
  backLabel,
  historyBack,
  sectionOf,
  setNavIntent,
  type NavIntent,
} from '~/lib/navigation'

/**
 * Back, the way a native app means it.
 *
 * One button covers two different moves, and which one is right depends on how
 * the member got here:
 *
 *  · Through the app. History has the screen they came from, so Back is
 *    `router.back()`. The browser's back button, Android's system back and the
 *    iOS swipe all agree with it, because they walk the same history.
 *  · Straight in: a deep link, a notification, or a reload of the installed
 *    app that dropped its history. Nothing in the app is behind them, and
 *    `router.back()` would leave it or do nothing at all. Back replaces this
 *    screen with the one above it instead, so the member lands somewhere they
 *    can carry on from.
 *
 * An entry on the far side of the gate doesn't count as somewhere to go back
 * to. The sign-in screen behind the first setup step would only bounce the
 * member straight back to it.
 */
export const useBackNavigation = (
  /**
   * Where Back goes with no history behind it. Omitted: the nearest route
   * above this path, else Home. `false`: nowhere, so there is no Back.
   */
  fallback: MaybeRefOrGetter<string | false | undefined> = undefined,
) => {
  const router = useRouter()
  const route = useRoute()

  /** The in-app entry behind this one, when Back can sensibly return to it. */
  const previous = computed(() => {
    // `history.state` isn't reactive. The route is, and changes with it.
    void route.fullPath
    const back = historyBack()
    return back && sectionOf(back) === sectionOf(route.path) ? back : null
  })

  /**
   * `/train/d1/exercise/x` has no `/train/d1/exercise`, so this walks up until
   * a path names a real route. The top of the tree is Home, not `/`, which only
   * exists to redirect.
   */
  const parentOf = (path: string): string => {
    const parts = path.split('/').filter(Boolean)
    while (parts.length > 1) {
      parts.pop()
      const candidate = `/${parts.join('/')}`
      if (router.resolve(candidate).matched.length) return candidate
    }
    return '/home'
  }

  /** The screen above this one, for when there is no history to walk. */
  const above = computed(() => {
    const explicit = toValue(fallback)
    if (explicit !== undefined) return explicit || null
    return parentOf(route.path)
  })

  const destination = computed(() => previous.value ?? above.value)

  const canGoBack = computed(() => destination.value !== null)

  /** "Train", "Chat", or "Back". See `backLabel`. */
  const label = computed(() => backLabel(destination.value))

  const goBack = (intent: NavIntent = 'back') => {
    if (previous.value) {
      setNavIntent(intent)
      router.back()
      return
    }
    if (!above.value) return
    setNavIntent(intent)
    void router.replace(above.value)
  }

  return { canGoBack, label, goBack }
}
