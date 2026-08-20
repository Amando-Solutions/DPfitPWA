<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    variant?: 'raised' | 'flat' | 'ink' | 'outline'
    pad?: boolean
  }>(),
  { variant: 'raised', pad: true },
)

const VARIANTS: Record<NonNullable<typeof props.variant>, string> = {
  raised: 'bg-raised shadow-card',
  flat: 'bg-raised',
  // Deliberately the opposite of the page — see `--surface-inverse`, which
  // lifts rather than sinks once the page itself is dark.
  ink: 'bg-inverse text-on-inverse',
  outline: 'bg-transparent shadow-[inset_0_0_0_1.5px_var(--hairline)]',
}
</script>

<template>
  <div
    class="relative rounded-card"
    :class="[VARIANTS[variant], pad && 'p-4']"
  >
    <slot />
  </div>
</template>
