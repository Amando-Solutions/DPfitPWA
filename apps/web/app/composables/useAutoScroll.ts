/** How long it holds still after a hand last moved it. */
const RESUME_MS = 2000
/** How long it waits at either end before heading back. */
const TURN_MS = 1500

/**
 * Drift a horizontal scroller sideways on its own, while it stays an ordinary
 * scroller underneath: swipe, trackpad, shift-wheel and arrow keys all move it
 * by hand, and so does dragging with a mouse, which has no other way to.
 *
 * It runs to the end, waits, and runs back, rather than looping: a seamless
 * loop needs the items drawn twice, and anyone scrolling by hand would meet
 * every one of them again.
 *
 * It holds still while `paused`, while a mouse is over it or the keyboard is
 * on it, while a finger or the mouse is down on it and for a moment after any
 * hand moves it, and always under reduced motion. It runs only while on screen.
 * A mouse drag puts `is-dragging` on the scroller for the cursor and to stop
 * text being selected.
 */
export const useAutoScroll = (
  scroller: Ref<HTMLElement | null>,
  { paused, speed }: { paused: Ref<boolean>; /** px per second */ speed: number },
) => {
  let frame = 0
  let last = 0
  // Its own float position: browsers may round `scrollLeft` to whole pixels,
  // and at well under a pixel a frame reading it back would never move.
  let pos = 0
  let direction = 1
  let held = false
  let dragging = false
  let hovered = false
  let restUntil = 0
  let dragFrom = { x: 0, scrollLeft: 0 }

  const cleanup: (() => void)[] = []
  const on = <K extends keyof HTMLElementEventMap>(
    el: HTMLElement,
    type: K,
    fn: (e: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ) => {
    el.addEventListener(type, fn, options)
    cleanup.push(() => el.removeEventListener(type, fn, options))
  }

  const rest = (ms = RESUME_MS) => {
    restUntil = performance.now() + ms
  }

  const release = () => {
    held = false
    dragging = false
    scroller.value?.classList.remove('is-dragging')
    rest()
  }

  onMounted(() => {
    const el = scroller.value
    if (!el) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      // Capped so a frame after a stall does not leap.
      const dt = last ? Math.min(now - last, 100) : 0
      last = now

      // Anything but this loop moved it: a swipe and its momentum, the wheel,
      // the keyboard, a drag.
      if (Math.abs(el.scrollLeft - pos) > 1) {
        pos = el.scrollLeft
        rest()
      }
      if (
        paused.value
        || held
        || hovered
        || now < restUntil
        || reducedMotion.matches
        // Not plain focus: a click focuses it too, and would pin it still.
        || el.matches(':focus-visible')
      ) return

      const end = el.scrollWidth - el.clientWidth
      if (end <= 0) return
      pos += direction * speed * (dt / 1000)
      if (direction > 0 ? pos >= end : pos <= 0) {
        pos = direction > 0 ? end : 0
        direction = -direction
        rest(TURN_MS)
      }
      el.scrollLeft = pos
    }

    const visibility = new IntersectionObserver(([entry]) => {
      cancelAnimationFrame(frame)
      if (!entry?.isIntersecting) return
      last = 0
      frame = requestAnimationFrame(tick)
    })
    visibility.observe(el)
    cleanup.push(() => {
      visibility.disconnect()
      cancelAnimationFrame(frame)
    })

    on(el, 'pointerenter', (e) => {
      if (e.pointerType === 'mouse') hovered = true
    })
    on(el, 'pointerleave', (e) => {
      if (e.pointerType === 'mouse') hovered = false
    })

    // A finger is tracked by touch events, which keep coming while the browser
    // scrolls; its pointer is cancelled the moment the pan starts.
    on(el, 'touchstart', () => (held = true), { passive: true })
    on(el, 'touchend', release)
    on(el, 'touchcancel', release)

    on(el, 'pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      held = true
      dragging = true
      el.classList.add('is-dragging')
      dragFrom = { x: e.clientX, scrollLeft: el.scrollLeft }
      el.setPointerCapture(e.pointerId)
    })
    on(el, 'pointermove', (e) => {
      if (dragging) el.scrollLeft = dragFrom.scrollLeft - (e.clientX - dragFrom.x)
    })
    on(el, 'pointerup', (e) => {
      if (e.pointerType === 'mouse') release()
    })
    on(el, 'pointercancel', (e) => {
      if (e.pointerType === 'mouse') release()
    })
    // The browser's own image drag would steal the gesture.
    on(el, 'dragstart', (e) => e.preventDefault())
  })

  onBeforeUnmount(() => {
    for (const off of cleanup) off()
  })
}
