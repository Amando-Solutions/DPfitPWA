<script setup lang="ts">
/**
 * The pill the page asks you to press.
 *
 * Every variant shares the design's one hover: the pill lifts 2px and fills
 * with the deep plum, whatever it started as. `ink` is the main ask on the
 * paper page, `outline` its quiet companion, and `paper` / `outline-light` the
 * same pair drawn on the plum footer.
 *
 * Renders as an `<a>` when given an `href` and a `<button>` otherwise, so a
 * link is a link and a submit is a submit.
 */
const props = withDefaults(
  defineProps<{
    href?: string
    variant?: 'ink' | 'outline' | 'paper' | 'outline-light'
    type?: 'button' | 'submit'
    /** Header-bar size. */
    compact?: boolean
    /** Full width, 58px tall: the submit button inside the booking card. */
    block?: boolean
    /** Ignored on the `<a>` form, which has nothing to disable. */
    disabled?: boolean
  }>(),
  { variant: 'ink', type: 'button', compact: false, block: false, disabled: false },
)

const VARIANTS = {
  ink: 'bg-lp-ink text-lp-paper',
  outline: 'border border-lp-ink text-lp-ink',
  paper: 'bg-lp-paper text-lp-ink',
  'outline-light': 'border border-[rgba(247,244,252,0.35)] text-lp-paper',
} as const

const classes = computed(() => [
  'inline-flex items-center justify-center gap-1.5 rounded-full font-landing font-semibold',
  'transition-[transform,background-color,color] duration-[400ms,300ms,300ms] ease-[cubic-bezier(0.2,0.7,0.2,1)]',
  'hover:-translate-y-0.5 hover:bg-lp-ink-hover hover:text-lp-paper',
  'focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-lp-accent',
  props.compact ? 'px-5 py-3 text-[14px] whitespace-nowrap'
    : props.block ? 'mt-2 h-[58px] w-full px-6 text-center text-[15px]'
    : 'px-6 py-[15px] text-[15px] whitespace-nowrap',
  VARIANTS[props.variant],
  // Dimmed rather than restyled, so a button waiting on the network is
  // recognisably the same button and nothing reflows around it.
  'disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 disabled:hover:bg-lp-ink',
])
</script>

<template>
  <a v-if="href" :href="href" :class="classes">
    <slot />
  </a>
  <button v-else :type="type" :disabled="disabled" :class="classes">
    <slot />
  </button>
</template>
