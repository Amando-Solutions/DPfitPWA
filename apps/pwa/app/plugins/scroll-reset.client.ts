import { historyPosition } from '~/lib/navigation'

/**
 * Opens every screen at the top, and returns a screen to where it was left when
 * history goes back to it.
 *
 * Nothing in this app scrolls the window. `html`, `body` and `#__nuxt` are
 * pinned to `height: 100%` and each screen scrolls inside its own `.scroll-y`
 * element. Vue Router's scroll handling only ever moves the window, so it has
 * no effect here, and the layouts' scrollers outlive the page rendered inside
 * them: without this, walking a setup flow or tapping through the tab bar would
 * drop the member into the next screen at the previous screen's offset.
 *
 * Going back is the exception. A browser restores a page's scroll when you go
 * back to it, and a native app never threw the previous screen away in the
 * first place, so coming back from a detail to find the list at its top reads
 * as the app having forgotten. Each history entry's offsets are noted as it is
 * left, and handed back when history returns to that same entry.
 *
 * A scroller that manages its own resting position (the chat log, which sits at
 * the newest message) opts out with `data-scroll-keep`.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const router = useRouter()

  /** Offsets by history entry, noted as each entry is left. */
  const left = new Map<number, { path: string; offsets: number[] }>()
  let position = historyPosition()
  let returning = false

  // Not the copy of a screen the iOS back swipe lays underneath, either: it is
  // still in the document when the real screen lands, and counting its
  // scrollers would put every offset on the wrong one.
  const scrollers = () =>
    [...document.querySelectorAll<HTMLElement>('.scroll-y')].filter(
      (el) => !el.closest('[data-scroll-keep], [data-nav-underlay]'),
    )

  // Guards run while the old screen is still mounted, so this is the last
  // moment its offsets can be read.
  router.beforeEach((_to, from) => {
    left.set(position, {
      path: from.fullPath,
      offsets: scrollers().map((el) => el.scrollTop),
    })
  })

  router.afterEach((_to, _from, failure) => {
    if (failure) return
    const now = historyPosition()
    returning = now < position
    position = now
  })

  nuxtApp.hook('page:finish', () => {
    const route = router.currentRoute.value
    // An in-page target is an explicit request for a position that is not the
    // top, so leave it alone.
    if (route.hash) return

    const current = scrollers()
    const saved = returning ? left.get(position) : undefined
    // Only onto the same screen, drawn the same way. A different count of
    // scrollers means a different layout, and the offsets mean nothing there.
    const offsets =
      saved?.path === route.fullPath && saved.offsets.length === current.length
        ? saved.offsets
        : null

    current.forEach((el, i) => {
      el.scrollTop = offsets?.[i] ?? 0
    })
  })
})
