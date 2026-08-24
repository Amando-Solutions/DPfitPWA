/**
 * Opens every screen at the top.
 *
 * Nothing in this app scrolls the window. `html`, `body` and `#__nuxt` are
 * pinned to `height: 100%` and each screen scrolls inside its own `.scroll-y`
 * element. Vue Router's scroll handling only ever moves the window, so it has
 * no effect here, and the layouts' scrollers outlive the page rendered inside
 * them: without this, walking a setup flow or tapping through the tab bar would
 * drop the member into the next screen at the previous screen's offset.
 *
 * A scroller that manages its own resting position (the chat log, which sits at
 * the newest message) opts out with `data-scroll-keep`.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const router = useRouter()

  nuxtApp.hook('page:finish', () => {
    // An in-page target is an explicit request for a position that is not the
    // top, so leave it alone.
    if (router.currentRoute.value.hash) return

    for (const el of document.querySelectorAll<HTMLElement>('.scroll-y')) {
      if (el.closest('[data-scroll-keep]')) continue
      el.scrollTop = 0
    }
  })
})
