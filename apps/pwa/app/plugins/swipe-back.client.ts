import {
  activeBackHandler,
  historyBack,
  historyPosition,
  type BackHandler,
} from '~/lib/navigation'

/**
 * iOS's edge swipe for going back, in the installed app.
 *
 * Safari gives a browser tab this gesture for free, with the real previous page
 * under the finger, so a tab is left alone. A web app launched from the home
 * screen gets no gesture at all, which is the quickest way to tell an iPhone
 * app is a website. This puts it back. From the left edge the screen follows
 * the finger, the screen it came from slides out from under it, and letting go
 * past about a third of the way (or flicking) goes back. Anywhere short of that
 * it springs back.
 *
 * What is underneath is a copy of that screen's DOM, taken as the member left
 * it, scroll offsets and typed values included, so under the finger is what
 * they last saw rather than a blank. It is inert and hidden from assistive
 * technology, and the real screen replaces it the moment the navigation lands.
 * Where there is no copy (the app was reloaded since, or Back goes up rather
 * than back) the page colour shows through instead.
 *
 * Offered only where the screen shows an enabled Back button (see
 * `registerBackHandler`). The swipe never goes anywhere the button wouldn't,
 * and a screen frozen mid-save can't be swiped away.
 */

/** How far in from the left edge a swipe may start, in px. Inside the 20px page gutter, so a chat bubble's own drag is never under it. */
const EDGE = 20
/** Travel before the gesture declares itself, in px. */
const SLOP = 10
/** Let go past this fraction of the width and it goes back… */
const COMMIT_RATIO = 0.35
/** …or flick faster than this, in px/ms. */
const COMMIT_VELOCITY = 0.35
/** The screen underneath starts this far left, as UIKit's does. */
const PARALLAX = 0.3
/** How dark the screen underneath starts. */
const SHADE = 0.12
/** Screens kept to swipe back to. Each is a detached DOM tree. */
const MAX_COPIES = 6
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)'

interface Copy {
  path: string
  node: HTMLElement
  offsets: number[]
}

interface Drag {
  handler: BackHandler
  surface: HTMLElement
  width: number
  startX: number
  startY: number
  lastX: number
  lastAt: number
  velocity: number
  claimed: boolean
  layer: HTMLElement | null
  shade: HTMLElement | null
  /** The copy on show, and the history position it belongs to. */
  copy: { at: number; value: Copy } | null
}

const scrollersIn = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>('.scroll-y')]

/**
 * `cloneNode` copies attributes, not state, so a field someone has typed into
 * comes out empty. Carry the live values across, and stop any media in the copy
 * from loading on its own account.
 */
const copyOf = (surface: HTMLElement): HTMLElement => {
  const node = surface.cloneNode(true) as HTMLElement
  // It sits beside the live surface while it is on show, and anything looking
  // the surface up by class must not find this one first.
  node.classList.remove('app-shell__surface')

  type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  const fields = 'input, textarea, select'
  const live = surface.querySelectorAll<Field>(fields)
  node.querySelectorAll<Field>(fields).forEach((field, i) => {
    const source = live[i]
    // A file input refuses any value but empty, and throws trying.
    if (!source || field.type === 'file') return
    field.value = source.value
    if (field instanceof HTMLInputElement && source instanceof HTMLInputElement) {
      field.checked = source.checked
    }
  })

  node.querySelectorAll('video, audio').forEach((media) => {
    media.removeAttribute('autoplay')
    media.setAttribute('preload', 'none')
  })

  return node
}

export default defineNuxtPlugin((nuxtApp) => {
  const { platform, standalone } = usePlatform()
  if (platform.value !== 'ios' || !standalone.value) return

  const router = useRouter()
  const surfaceEl = () => document.querySelector<HTMLElement>('.app-shell__surface')

  // --- The screens behind this one ------------------------------------------

  const copies = new Map<number, Copy>()
  let position = historyPosition()

  router.beforeEach((_to, from) => {
    // A pop has already moved history, and the screen it leaves is in front
    // of where it is going. Only a push leaves one behind to swipe back to.
    if (historyPosition() !== position) return
    const surface = surfaceEl()
    if (!surface) return
    copies.delete(position)
    copies.set(position, {
      path: from.fullPath,
      node: copyOf(surface),
      offsets: scrollersIn(surface).map((el) => el.scrollTop),
    })
    while (copies.size > MAX_COPIES) copies.delete(copies.keys().next().value!)
  })

  router.afterEach((_to, _from, failure) => {
    if (!failure) position = historyPosition()
  })

  // --- The gesture -----------------------------------------------------------

  let drag: Drag | null = null
  /** Settling after a release. The next swipe waits for it. */
  let settling = false

  const listen = (on: boolean) => {
    if (on) {
      // Not passive: once the swipe is claimed it has to stop the screen
      // scrolling underneath it. Attached only for the length of a touch that
      // starts at the edge, so the rest of the app keeps passive scrolling.
      document.addEventListener('touchmove', onTouchMove, { passive: false })
      document.addEventListener('touchend', onTouchEnd)
      document.addEventListener('touchcancel', onTouchCancel)
    } else {
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
      document.removeEventListener('touchcancel', onTouchCancel)
    }
  }

  const onTouchStart = (event: TouchEvent) => {
    if (drag || settling || event.touches.length !== 1) return
    const touch = event.touches[0]!
    if (touch.clientX > EDGE) return

    const handler = activeBackHandler()
    if (!handler) return
    // A sheet or dialog is on top. The screen behind it isn't what's being
    // swiped, and the sheet has a gesture of its own.
    if (document.querySelector('[role="dialog"][data-state="open"]')) return
    const surface = surfaceEl()
    if (!surface) return

    drag = {
      handler,
      surface,
      width: surface.offsetWidth,
      startX: touch.clientX,
      startY: touch.clientY,
      lastX: touch.clientX,
      lastAt: event.timeStamp,
      velocity: 0,
      claimed: false,
      layer: null,
      shade: null,
      copy: null,
    }
    listen(true)
  }

  /** The screen underneath, placed exactly where the surface is. */
  const lay = (d: Drag) => {
    const rect = d.surface.getBoundingClientRect()
    const layer = document.createElement('div')
    layer.inert = true
    layer.setAttribute('aria-hidden', 'true')
    // `scroll-reset` skips the scrollers in here: they belong to a picture.
    layer.dataset.navUnderlay = ''
    Object.assign(layer.style, {
      position: 'fixed',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      overflow: 'hidden',
      pointerEvents: 'none',
      background: 'var(--paper)',
      willChange: 'transform',
    })

    // Only the copy of the entry history will actually return to.
    const back = historyBack()
    const behind = position - 1
    const copy = copies.get(behind)
    if (back && copy?.path === back) {
      layer.append(copy.node)
      d.copy = { at: behind, value: copy }
    }

    const shade = document.createElement('div')
    Object.assign(shade.style, { position: 'absolute', inset: '0', background: '#000' })
    layer.append(shade)

    // Before the surface in the DOM, so the surface paints over it.
    d.surface.before(layer)
    // Offsets only take once the copy is in the document and has a layout.
    if (d.copy) {
      const { node, offsets } = d.copy.value
      scrollersIn(node).forEach((el, i) => {
        el.scrollTop = offsets[i] ?? 0
      })
    }

    d.layer = layer
    d.shade = shade
  }

  const claim = (d: Drag) => {
    d.claimed = true
    // A focused field would hold its keyboard up over a screen that's leaving.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    lay(d)
    Object.assign(d.surface.style, {
      transition: 'none',
      willChange: 'transform',
      boxShadow: '-1px 0 24px rgb(0 0 0 / 0.14)',
    })
  }

  const follow = (d: Drag, dx: number) => {
    const progress = Math.min(1, dx / d.width)
    d.surface.style.transform = `translate3d(${dx}px, 0, 0)`
    d.layer!.style.transform = `translate3d(${-PARALLAX * 100 * (1 - progress)}%, 0, 0)`
    d.shade!.style.opacity = String(SHADE * (1 - progress))
  }

  const onTouchMove = (event: TouchEvent) => {
    const d = drag
    const touch = event.touches[0]
    if (!d || !touch) return
    const dx = touch.clientX - d.startX
    const dy = touch.clientY - d.startY

    if (!d.claimed) {
      // Vertical first: it's a scroll, and none of this gesture's business.
      if (Math.abs(dy) > SLOP && Math.abs(dy) > Math.abs(dx)) {
        listen(false)
        drag = null
        return
      }
      if (dx < SLOP || dx < Math.abs(dy)) return
      claim(d)
    }

    event.preventDefault()
    const elapsed = event.timeStamp - d.lastAt
    if (elapsed > 0) d.velocity = (touch.clientX - d.lastX) / elapsed
    d.lastX = touch.clientX
    d.lastAt = event.timeStamp
    follow(d, Math.max(0, dx))
  }

  /** Puts the surface back as it was, and the copy back on the shelf. */
  const clearUp = (d: Drag) => {
    Object.assign(d.surface.style, {
      transition: '',
      transform: '',
      willChange: '',
      boxShadow: '',
    })
    d.copy?.value.node.remove()
    d.layer?.remove()
    settling = false
  }

  /** Past the threshold: finish the move, then let the real screen take over. */
  const land = (d: Drag) => {
    // The screen being returned to is about to be live; its copy is stale.
    if (d.copy) copies.delete(d.copy.at)

    let done = false
    const finish = () => {
      if (done) return
      done = true
      unhook()
      window.clearTimeout(fallback)
      // A frame for the real screen to paint, then drop the copy over it.
      requestAnimationFrame(() => clearUp(d))
    }
    // After `scroll-reset`, which has put the returning screen at the offsets
    // the copy was showing.
    const unhook = nuxtApp.hook('page:finish', finish)
    // A navigation a guard refused never finishes a page. Put the screen back.
    const fallback = window.setTimeout(finish, 1500)

    d.handler.go('swipe')
  }

  const release = (d: Drag, commit: boolean) => {
    settling = true
    const progress = Math.min(1, Math.max(0, (d.lastX - d.startX) / d.width))
    const remaining = commit ? 1 - progress : progress
    const duration = Math.round(Math.min(360, Math.max(160, remaining * 420)))
    const move = `transform ${duration}ms ${EASE}`

    d.surface.style.transition = move
    d.layer!.style.transition = move
    d.shade!.style.transition = `opacity ${duration}ms ${EASE}`

    d.surface.style.transform = commit ? `translate3d(${d.width}px, 0, 0)` : ''
    d.layer!.style.transform = commit ? 'none' : `translate3d(${-PARALLAX * 100}%, 0, 0)`
    d.shade!.style.opacity = commit ? '0' : String(SHADE)

    // Timed rather than waiting on `transitionend`, which doesn't fire for a
    // transition that had no distance left to cover.
    window.setTimeout(() => (commit ? land(d) : clearUp(d)), duration + 20)
  }

  const onTouchEnd = () => {
    const d = drag
    listen(false)
    drag = null
    if (!d?.claimed) return

    const dx = d.lastX - d.startX
    // A flick decides on its own, either way. Otherwise it is how far it got.
    const far =
      d.velocity > COMMIT_VELOCITY
        ? dx > SLOP * 2
        : d.velocity > -COMMIT_VELOCITY && dx > d.width * COMMIT_RATIO
    // A save that started mid-swipe freezes Back, and the swipe with it.
    release(d, far && d.handler.enabled())
  }

  const onTouchCancel = () => {
    const d = drag
    listen(false)
    drag = null
    if (d?.claimed) release(d, false)
  }

  document.addEventListener('touchstart', onTouchStart, { passive: true, capture: true })
})
