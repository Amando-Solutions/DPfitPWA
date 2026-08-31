<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'dark' | 'danger'
    size?: 'md' | 'lg'
    block?: boolean
    to?: string
    icon?: string
    iconRight?: string
    disabled?: boolean
    /**
     * `button` by default, which is *not* what a bare `<button>` inside a
     * `<form>` does — that defaults to `submit`. Every button in this app is a
     * click handler unless it says otherwise, and inheriting the HTML default
     * meant any of them dropped into a form quietly became a second way to
     * submit it, firing both the form's handler and its own `@click`. Set it
     * to `submit` on the one control per form that means it: that is what
     * makes Enter work in a text field, which needs a submit button to exist.
     */
    type?: 'button' | 'submit' | 'reset'
  }>(),
  { variant: 'primary', size: 'lg', block: true, type: 'button' },
)

defineEmits<{ (e: 'click', ev: MouseEvent): void }>()

// Resolved in setup, because `resolveComponent` can't run from the render function.
const NuxtLink = resolveComponent('NuxtLink')

/*
  Flat fills.

  These used to carry `btn-raised` — a derived stroke, top glint, bottom shade
  and an in-hue cast — and the pink ones added `btn-glow` on top of that, a
  rose halo bleeding a good 26px past the button. At the size a CTA is drawn
  that halo reads as the button being lit from behind, and on a screen with two
  of them the page glows in two places before it says anything. The fill and the
  label are enough to say "this is the action"; the press state does the rest.

  `btn-raised` is still the right treatment for the small controls that need to
  read as physically on top of something — a segmented thumb, a chip over a
  photograph — and those set it themselves.
*/
const VARIANTS: Record<NonNullable<typeof props.variant>, string> = {
  primary: 'bg-rose-fill text-on-rose',
  // Same treatment as primary; the difference is intent, not colour.
  danger: 'bg-rose-fill text-on-rose',
  dark: 'bg-inverse text-on-inverse',
  secondary: 'bg-raised text-ink shadow-[inset_0_0_0_1px_var(--hairline)]',
  ghost: 'bg-transparent text-rose',
}

const SIZES: Record<NonNullable<typeof props.size>, string> = {
  md: 'h-11 px-[18px] text-sm',
  lg: 'h-13.5 px-6 text-[15px]',
}

const classes = computed(() => [
  VARIANTS[props.variant],
  SIZES[props.size],
  props.block && 'w-full',
  props.disabled && 'opacity-45 pointer-events-none',
])
</script>

<template>
  <component
    :is="to ? NuxtLink : 'button'"
    :to="to"
    :type="to ? undefined : type"
    class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-pill font-body font-bold transition-[transform,opacity,background-color] duration-100 ease-out active:scale-[0.985] motion-reduce:transition-none motion-reduce:active:scale-100"
    :class="classes"
    :disabled="disabled"
    @click="(e: MouseEvent) => $emit('click', e)"
  >
    <AppIcon v-if="icon" :name="icon" :size="18" :stroke="2.2" />
    <span><slot /></span>
    <AppIcon v-if="iconRight" :name="iconRight" :size="18" :stroke="2.2" />
  </component>
</template>
