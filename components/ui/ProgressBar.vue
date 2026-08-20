<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    value: number
    max?: number
    height?: number
    color?: string
    track?: string
    flame?: boolean
  }>(),
  {
    max: 100,
    height: 6,
    color: 'var(--rose)',
    track: 'rgba(36,27,46,0.1)',
    flame: false,
  },
)

const pct = computed(() =>
  Math.max(0, Math.min(100, (props.value / props.max) * 100)),
)
</script>

<template>
  <div
    class="pbar"
    :style="{ height: `${height}px`, background: track }"
    role="progressbar"
    :aria-valuenow="value"
    :aria-valuemax="max"
  >
    <div
      class="pbar__fill"
      :class="{ 'pbar__fill--flame': flame }"
      :style="{ width: `${pct}%`, background: flame ? undefined : color }"
    />
  </div>
</template>

<style scoped lang="scss">
.pbar {
  width: 100%;
  border-radius: var(--radius-pill);
  overflow: hidden;

  &__fill {
    height: 100%;
    border-radius: var(--radius-pill);
    transition: width 0.4s ease;

    &--flame {
      background: var(--flame-gradient);
    }
  }
}
</style>
