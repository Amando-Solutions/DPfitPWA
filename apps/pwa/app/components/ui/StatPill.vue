<script setup lang="ts">
// Small rounded pill used for the streak / trophy counters and chip stats.
const props = withDefaults(
  defineProps<{
    icon?: string
    label?: string
    value?: string | number
    variant?: 'light' | 'secondary' | 'ink' | 'primary'
  }>(),
  { variant: 'light' },
)

const VARIANTS: Record<NonNullable<typeof props.variant>, string> = {
  light: 'bg-raised text-ink shadow-card',
  // Streaks and RP. The violet tint, with the icon-safe violet on it in light
  // mode, where the plain violet fails on its own chip.
  secondary: 'bg-secondary-soft text-secondary-ink',
  primary: 'bg-primary-soft text-primary',
  ink: 'bg-inverse text-on-inverse',
}
</script>

<template>
  <div
    class="inline-flex items-center gap-1.25 rounded-pill px-2.5 py-1.25 text-xs font-bold"
    :class="VARIANTS[variant]"
  >
    <AppIcon v-if="icon" :name="icon" :size="14" :stroke="2.2" />
    <span v-if="value !== undefined" class="data">{{ value }}</span>
    <span v-if="label" class="text-[11px]">{{ label }}</span>
  </div>
</template>
