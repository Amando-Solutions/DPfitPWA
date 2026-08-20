<script setup lang="ts">
const props = defineProps<{ seconds: number }>()
const emit = defineEmits<{
  (e: 'skip'): void
  (e: 'adjust', delta: number): void
}>()

const label = computed(() => {
  const m = Math.floor(props.seconds / 60)
  const s = props.seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})
</script>

<template>
  <div class="rest-bar">
    <button class="rest-bar__adj" @click="emit('adjust', -15)">-15</button>
    <span class="rest-bar__time data">{{ label }}</span>
    <button class="rest-bar__adj" @click="emit('adjust', 15)">+15</button>
    <button class="rest-bar__skip" @click="emit('skip')">Skip</button>
  </div>
</template>

<style scoped lang="scss">
.rest-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--ink);
  color: var(--paper-raised);
  border-radius: var(--radius-lg);
  padding: 10px 14px;
  box-shadow: var(--shadow-hero);

  &__adj {
    padding: 6px 12px;
    border-radius: var(--radius-pill);
    background: rgba(255, 255, 255, 0.12);
    color: var(--paper-raised);
    font-weight: 700;
    font-size: 13px;
  }

  &__time {
    flex: 1;
    text-align: center;
    font-size: 22px;
    font-weight: 700;
    color: var(--orange);
    letter-spacing: 1px;
  }

  &__skip {
    padding: 8px 16px;
    border-radius: var(--radius-pill);
    background: var(--rose);
    color: var(--paper-raised);
    font-weight: 700;
    font-size: 13px;
  }
}
</style>
