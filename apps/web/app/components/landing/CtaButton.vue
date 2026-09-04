<script setup lang="ts">
/**
 * The pill the page asks you to press, in the three treatments the design uses.
 *
 * Every variant is flat -- no cast shadow, no glow -- so the buttons sit on the
 * page rather than hover over it. `rose` is the primary ask; `ink` is the same
 * shape in near-black, used where the page is already light and a rose button
 * would be the third rose thing in view; `outline` is the quiet companion that
 * only ever appears on the dark panels.
 *
 * Renders as an `<a>` when given an `href` and a `<button>` otherwise, so a
 * link is a link and a submit is a submit.
 */
const props = withDefaults(
  defineProps<{
    href?: string
    variant?: 'rose' | 'ink' | 'outline'
    type?: 'button' | 'submit'
    /** Sized down for the header bar, where the pill sits in a 72px row. */
    compact?: boolean
  }>(),
  { variant: 'rose', type: 'button', compact: false },
)

const VARIANTS = {
  rose: 'bg-[var(--rose-fill)] text-white hover:brightness-110',
  ink: 'bg-[var(--text)] text-paper hover:brightness-125',
  outline:
    'border border-white/25 text-paper hover:border-white/45 hover:bg-white/5',
} as const

const classes = computed(() => [
  'inline-flex items-center justify-center rounded-pill font-body font-semibold whitespace-nowrap',
  'transition duration-150 ease-out',
  'focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--rose-fill)]',
  props.compact ? 'px-[22px] py-[11px] text-[13.5px]' : 'px-[34px] py-[17px] text-[15.5px]',
  VARIANTS[props.variant],
])
</script>

<template>
  <a v-if="href" :href="href" :class="classes">
    <slot />
  </a>
  <button v-else :type="type" :class="classes">
    <slot />
  </button>
</template>
