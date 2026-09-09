<script setup lang="ts">
import { VisuallyHidden } from 'reka-ui'

/*
  A bottom sheet on a phone, a centred dialog once there is desktop room.

  The panel itself is shadcn's Sheet (Reka UI's Dialog underneath), which is
  what supplies the behaviour this component used to be missing: focus is
  trapped inside the panel and restored to whatever opened it, Escape and a
  click on the scrim both dismiss, the title is wired into `aria-labelledby`,
  and the body actually stops scrolling behind the sheet — the `watch` that
  used to claim to do that had an empty callback.

  The v-model API is unchanged, so every screen that opens a sheet keeps
  working as it did.
*/
const props = defineProps<{
  modelValue: boolean
  title?: string
  /** Optional supporting line, announced with the title by a screen reader. */
  description?: string
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

/* Reka always generates a description id and points `aria-describedby` at it,
   which dangles on the sheets whose body is a form or a list rather than
   prose. Passing the attribute through as `undefined` clears it; omitting the
   key entirely leaves Reka's own wiring in place for the sheets that do render
   a <SheetDescription>. */
const contentAttrs = computed(() =>
  props.description ? {} : { 'aria-describedby': undefined },
)

/* ---------------------------------------------------------------------------
   Swipe down to dismiss.

   The grab handle has always been drawn; this is what makes it true. A sheet
   that shows a handle and then refuses to be pulled down is worse than one
   with no handle at all, because the affordance has already made the promise.

   Three things it is careful about:

   · It only applies to the sheet, not to the desktop dialog. Past `lg` this
     panel is centred with a Tailwind `-translate-x-1/2 -translate-y-1/2`, so
     an inline transform would knock it off centre, and dragging a centred
     dialog downwards means nothing anyway.

   · It waits for the gesture to declare itself. Nothing moves until the
     pointer has travelled further down than sideways and past a few pixels, so
     a tap on an option in the sheet is still a tap, and a horizontal swipe is
     left to whatever is under it.

   · It hands the panel to `sheet-out` mid-drag rather than snapping it back
     first. That animation is `to { translateY(100%) }` with no `from`, so it
     starts from wherever the drag left the panel — which is why the release
     just sets `open = false` and leaves the inline transform where it is.
--------------------------------------------------------------------------- */

/** Past this the sheet is a centred dialog; see `sheetVariants`. */
const DESKTOP = '(min-width: 1024px)'
/** Movement before the drag takes over, in px. */
const SLOP = 6
/** Release past this fraction of the panel's height and it closes. */
const CLOSE_RATIO = 0.28
/** …or past this speed, in px/ms, however far it got. A flick should close. */
const CLOSE_VELOCITY = 0.5

let panel: HTMLElement | null = null
let startY = 0
let startX = 0
let lastY = 0
let lastAt = 0
let velocity = 0
let dragging = false
let claimed = false

const reset = () => {
  panel = null
  dragging = false
  claimed = false
  velocity = 0
}

const onPointerDown = (event: PointerEvent) => {
  if (event.button !== 0 || window.matchMedia(DESKTOP).matches) return

  // A caret being placed in a field, or a native control being operated, is
  // not the start of a swipe.
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, select, [contenteditable]')) return

  panel = event.currentTarget as HTMLElement
  dragging = true
  claimed = false
  startY = lastY = event.clientY
  startX = event.clientX
  lastAt = event.timeStamp
  velocity = 0
}

const onPointerMove = (event: PointerEvent) => {
  if (!dragging || !panel) return

  const dy = event.clientY - startY
  const dx = event.clientX - startX

  if (!claimed) {
    // Sideways, or upwards: not ours. Let go rather than sit on the gesture.
    if (Math.abs(dx) > Math.abs(dy) || dy < SLOP) {
      if (Math.abs(dx) > SLOP || dy < -SLOP) reset()
      return
    }
    claimed = true
    panel.style.transition = 'none'
    // From here the panel follows the finger, so the tap that would otherwise
    // land on whatever is under it must not fire.
    panel.setPointerCapture(event.pointerId)
  }

  const elapsed = event.timeStamp - lastAt
  if (elapsed > 0) velocity = (event.clientY - lastY) / elapsed
  lastY = event.clientY
  lastAt = event.timeStamp

  // Downwards only. Pulling up past the top does nothing, so the sheet reads
  // as resting against the edge of the screen rather than floating.
  panel.style.transform = `translateY(${Math.max(0, dy)}px)`
}

const onPointerUp = (event: PointerEvent) => {
  if (!dragging || !panel) return
  const node = panel
  const travelled = Math.max(0, event.clientY - startY)
  const wasClaimed = claimed
  reset()
  if (!wasClaimed) return

  const far = travelled > node.offsetHeight * CLOSE_RATIO
  const fast = velocity > CLOSE_VELOCITY && travelled > SLOP * 2
  if (far || fast) {
    // Leave the transform alone: `sheet-out` picks the panel up from here.
    open.value = false
    return
  }

  node.style.transition = 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)'
  node.style.transform = ''
  node.addEventListener(
    'transitionend',
    () => {
      node.style.transition = ''
    },
    { once: true },
  )
}

const onPointerCancel = () => {
  if (panel && claimed) {
    panel.style.transition = ''
    panel.style.transform = ''
  }
  reset()
}
</script>

<template>
  <Sheet v-model:open="open">
    <!--
      Every sheet in the app is opened from application state rather than from a
      trigger element, so there is no <SheetTrigger> here. Reka still returns
      focus to whatever held it when the sheet opened.
    -->
    <SheetContent
      side="adaptive"
      v-bind="contentAttrs"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
    >
      <!-- The grab handle is mobile-only: on desktop this is a dialog. -->
      <div
        class="mx-auto mb-4 h-1 w-10 rounded-pill bg-hairline-strong lg:hidden"
        aria-hidden="true"
      />

      <SheetTitle v-if="title" :class="description ? 'mb-1' : 'mb-3'">
        {{ title }}
      </SheetTitle>
      <!-- A dialog must always be labelled, so an untitled sheet still gets a
           title in the accessibility tree, just not on screen. -->
      <VisuallyHidden v-else as-child>
        <SheetTitle>Dialog</SheetTitle>
      </VisuallyHidden>

      <SheetDescription v-if="description" class="mb-3">
        {{ description }}
      </SheetDescription>

      <slot />
    </SheetContent>
  </Sheet>
</template>
