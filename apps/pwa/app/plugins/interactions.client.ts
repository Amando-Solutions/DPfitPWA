/** Native browser menus and viewport gestures do not belong to the PWA UI. */
export default defineNuxtPlugin(() => {
  const preventDefault = (event: Event) => {
    if (event.cancelable) event.preventDefault()
  }

  // Safari can ignore viewport scaling limits. Cancel its gesture events as
  // well as restricting touch-action in CSS; single-finger scrolling stays native.
  document.addEventListener('gesturestart', preventDefault, { passive: false })
  document.addEventListener('gesturechange', preventDefault, { passive: false })

  // Do not stop propagation: chat's own reaction/reply menu still receives the
  // event. This also covers links, images, inputs and teleported dialogs.
  document.addEventListener('contextmenu', preventDefault, { capture: true })

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      document.removeEventListener('gesturestart', preventDefault)
      document.removeEventListener('gesturechange', preventDefault)
      document.removeEventListener('contextmenu', preventDefault, { capture: true })
    })
  }
})
