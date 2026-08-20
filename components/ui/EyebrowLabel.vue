<script setup lang="ts">
withDefaults(defineProps<{ color?: string }>(), { color: 'var(--rose)' })
</script>

<template>
  <span class="eyebrow-label" :style="{ color }">
    <slot />
  </span>
</template>

<style scoped lang="scss">
.eyebrow-label {
  font-family: var(--font-eyebrow);
  text-transform: uppercase;
  letter-spacing: 1px;
  font-size: 10.5px;
  font-weight: 700;
  display: inline-block;
}
</style>
