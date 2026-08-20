<script setup lang="ts">
defineProps<{
  modelValue: string
  tabs: { id: string; label: string }[]
}>()

defineEmits<{ (e: 'update:modelValue', v: string): void }>()
</script>

<template>
  <div class="segtabs">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      class="segtabs__tab"
      :class="{ 'segtabs__tab--active': modelValue === tab.id }"
      @click="$emit('update:modelValue', tab.id)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

<style scoped lang="scss">
.segtabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: rgba(36, 27, 46, 0.06);
  border-radius: var(--radius-pill);

  &__tab {
    flex: 1;
    height: 38px;
    border-radius: var(--radius-pill);
    font-family: var(--font-eyebrow);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-size: 11px;
    font-weight: 700;
    color: var(--violet-45);
    transition: all 0.15s ease;

    &--active {
      background: var(--ink);
      color: var(--paper-raised);
    }
  }
}
</style>
