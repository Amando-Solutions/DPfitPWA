<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    value: number // 0..100
    size?: number
    stroke?: number
    color?: string
    track?: string
  }>(),
  {
    size: 92,
    stroke: 8,
    color: 'var(--rose)',
    track: 'rgba(36,27,46,0.1)',
  },
)

const radius = computed(() => (props.size - props.stroke) / 2)
const circumference = computed(() => 2 * Math.PI * radius.value)
const offset = computed(
  () => circumference.value * (1 - Math.max(0, Math.min(100, props.value)) / 100),
)
</script>

<template>
  <div class="ring" :style="{ width: `${size}px`, height: `${size}px` }">
    <svg :width="size" :height="size" class="ring__svg">
      <circle
        :cx="size / 2"
        :cy="size / 2"
        :r="radius"
        :stroke="track"
        :stroke-width="stroke"
        fill="none"
      />
      <circle
        :cx="size / 2"
        :cy="size / 2"
        :r="radius"
        :stroke="color"
        :stroke-width="stroke"
        fill="none"
        stroke-linecap="round"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="offset"
        class="ring__value"
      />
    </svg>
    <div class="ring__center">
      <slot />
    </div>
  </div>
</template>

<style scoped lang="scss">
.ring {
  position: relative;

  &__svg {
    transform: rotate(-90deg);
  }
  &__value {
    transition: stroke-dashoffset 0.5s ease;
  }
  &__center {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    text-align: center;
  }
}
</style>
