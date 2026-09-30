/** Inputs that take focus without raising the keyboard. */
const NO_KEYBOARD = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
])

/** Whether focus on this element keeps the soft keyboard (or iOS's picker) up. */
const holdsKeyboard = (el: Element | null) =>
  el instanceof HTMLTextAreaElement ||
  el instanceof HTMLSelectElement ||
  (el instanceof HTMLInputElement && !NO_KEYBOARD.has(el.type)) ||
  (el instanceof HTMLElement && el.isContentEditable)

/**
 * Puts the page back when the iOS keyboard goes away.
 *
 * iOS never resizes the page for the keyboard. It slides the whole document up
 * to keep the field in view, tab bar and all, and when the keyboard closes it
 * does not always slide it back: the window is left scrolled, and everything
 * pinned to the bottom of the screen hangs above a strip of empty page until
 * something else moves it.
 *
 * Nothing in this app scrolls the window (see `scroll-reset.client.ts`), so any
 * offset there once no field has the keyboard is that slide, left behind, and
 * is undone. Never while a field has it: that offset is what keeps the field
 * above the keyboard.
 */
export default defineNuxtPlugin(() => {
  const settle = () => {
    if (holdsKeyboard(document.activeElement)) return
    if (window.scrollX || window.scrollY) window.scrollTo(0, 0)
  }

  // A frame later, so focus has landed: tapping from one field straight into
  // another blurs the first before the second has it, and the keyboard stays.
  const onFocusOut = () => requestAnimationFrame(settle)

  // And again once the keyboard has finished closing, since iOS can reapply
  // its offset while it animates away. It reports that here and not as a
  // window resize.
  const viewport = window.visualViewport

  document.addEventListener('focusout', onFocusOut)
  viewport?.addEventListener('resize', settle)

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      document.removeEventListener('focusout', onFocusOut)
      viewport?.removeEventListener('resize', settle)
    })
  }
})
