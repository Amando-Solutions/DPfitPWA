<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'raised' | 'flat' | 'ink' | 'outline'
    pad?: boolean
  }>(),
  { variant: 'raised', pad: true },
)
</script>

<template>
  <div class="card" :class="[`card--${variant}`, { 'card--pad': pad }]">
    <slot />
  </div>
</template>

<style scoped lang="scss">
.card {
  border-radius: var(--radius-card);
  position: relative;

  &--pad {
    padding: var(--space-16);
  }

  &--raised {
    background: var(--paper-raised);
    box-shadow: var(--shadow-card);
  }
  &--flat {
    background: var(--paper-raised);
  }
  &--ink {
    background: var(--ink);
    color: var(--paper-raised);
  }
  &--outline {
    background: transparent;
    box-shadow: inset 0 0 0 1.5px rgba(36, 27, 46, 0.1);
  }
}
</style>
