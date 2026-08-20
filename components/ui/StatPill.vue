<script setup lang="ts">
// Small rounded pill used for the streak / trophy counters and chip stats.
withDefaults(
  defineProps<{
    icon?: string
    label?: string
    value?: string | number
    variant?: 'light' | 'flame' | 'ink' | 'rose'
  }>(),
  { variant: 'light' },
)
</script>

<template>
  <div class="stat-pill" :class="`stat-pill--${variant}`">
    <AppIcon v-if="icon" :name="icon" :size="14" :stroke="2.2" />
    <span v-if="value !== undefined" class="stat-pill__value data">{{ value }}</span>
    <span v-if="label" class="stat-pill__label">{{ label }}</span>
  </div>
</template>

<style scoped lang="scss">
.stat-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: 700;

  &--light {
    background: var(--paper-raised);
    color: var(--ink);
    box-shadow: var(--shadow-card);
  }
  &--flame {
    background: var(--orange-16);
    color: var(--flame-ember);
  }
  &--rose {
    background: var(--rose-25);
    color: var(--rose);
  }
  &--ink {
    background: var(--ink);
    color: var(--paper-raised);
  }

  &__label {
    font-size: 11px;
  }
}
</style>
