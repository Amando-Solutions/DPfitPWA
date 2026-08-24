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
    glow?: boolean
  }>(),
  { variant: 'primary', size: 'lg', block: true, glow: false },
)

defineEmits<{ (e: 'click', ev: MouseEvent): void }>()

// Resolved in setup, because `resolveComponent` can't run from the render function.
const NuxtLink = resolveComponent('NuxtLink')

/* Every filled variant gets the raised treatment from `btn-raised`, which
   needs one thing: `--btn-face`, the button's opaque fill. It derives the
   darkened stroke, the in-hue cast shadow, the top highlight and the bottom
   shade from that, so each variant is lit in its own colour rather than in a
   shared grey. Ghost is the exception, since there is no face to raise. */
const VARIANTS: Record<NonNullable<typeof props.variant>, string> = {
  primary: 'btn-raised bg-rose-fill text-on-rose [--btn-face:var(--rose-fill)]',
  // Same treatment as primary; the difference is intent, not colour.
  danger: 'btn-raised bg-rose-fill text-on-rose [--btn-face:var(--rose-fill)]',
  dark: 'btn-raised bg-inverse text-on-inverse [--btn-face:var(--surface-inverse)]',
  secondary:
    'btn-raised bg-raised text-ink [--btn-face:var(--surface-raised)]',
  ghost:
    'bg-transparent text-rose transition-[transform,opacity] duration-100 ease-out active:scale-[0.98]',
}

const SIZES: Record<NonNullable<typeof props.size>, string> = {
  md: 'h-11 px-[18px] text-sm',
  lg: 'h-13.5 px-6 text-[15px]',
}

const classes = computed(() => [
  VARIANTS[props.variant],
  SIZES[props.size],
  props.block && 'w-full',
  // The halo rides inside the raised shadow stack rather than replacing it.
  props.glow && 'btn-glow',
  props.disabled && 'opacity-45 pointer-events-none',
])
</script>

<template>
  <component
    :is="to ? NuxtLink : 'button'"
    :to="to"
    class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-pill font-body font-bold"
    :class="classes"
    :disabled="disabled"
    @click="(e: MouseEvent) => $emit('click', e)"
  >
    <AppIcon v-if="icon" :name="icon" :size="18" :stroke="2.2" />
    <span><slot /></span>
    <AppIcon v-if="iconRight" :name="iconRight" :size="18" :stroke="2.2" />
  </component>
</template>
