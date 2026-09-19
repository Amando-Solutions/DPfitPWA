<script setup lang="ts">
/**
 * A block standing where something still being read will land.
 *
 * The app's content no longer blocks the sign-in: a member is routed the
 * moment their membership is known, and their logs, program and cohort arrive
 * behind the screen they were routed to. This is what sits in the gap. See
 * `identify` in `useAppStore`.
 *
 * Sized in the same units as the thing it replaces, so nothing moves when the
 * real content arrives — a skeleton that shifts the layout on its way out has
 * cost more than it saved. `w`/`h` are numbers because every call site is
 * matching a type size or a card height already written in pixels; `w` also
 * takes a string for the common case of a proportion (`'60%'`).
 *
 * `aria-hidden`, and never announced: the screen that owns the skeleton says
 * what is happening once, in one live region, rather than having a dozen
 * placeholders each claim to be loading.
 */
const props = withDefaults(
  defineProps<{
    /** Width. A number is pixels; a string is passed through (`'60%'`, `'8ch'`). */
    w?: number | string
    /** Height in pixels. Defaults to a line of body text. */
    h?: number
    /** Pill for text and chips, card for anything with a card's corner. */
    shape?: 'pill' | 'card' | 'circle'
  }>(),
  { w: '100%', h: 14, shape: 'pill' },
)

const size = computed(() => ({
  width: typeof props.w === 'number' ? `${props.w}px` : props.w,
  height: `${props.h}px`,
}))

const radius = computed(() =>
  props.shape === 'card' ? 'rounded-card' : props.shape === 'circle' ? 'rounded-full' : 'rounded-pill',
)
</script>

<template>
  <!-- `--hairline-strong` rather than a grey of its own: the placeholder has to
       read as absence on both themes, and the token that already draws the
       app's dividers is the one that does that by construction. -->
  <span
    aria-hidden="true"
    :style="size"
    :class="radius"
    class="block shrink-0 bg-hairline-strong animate-skeleton"
  />
</template>
