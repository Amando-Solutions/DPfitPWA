<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    value: number // 0..100
    size?: number
    stroke?: number
    tone?: 'rose' | 'orange'
  }>(),
  { size: 92, stroke: 8, tone: 'rose' },
)

const radius = computed(() => (props.size - props.stroke) / 2)
const circumference = computed(() => 2 * Math.PI * radius.value)
const offset = computed(
  () => circumference.value * (1 - Math.max(0, Math.min(100, props.value)) / 100),
)

// Geometry is data; the box it sits in is sized from it via a custom property
// so the styling itself stays in classes.
const vars = computed(() => ({ '--ring-size': `${props.size}px` }))
</script>

<template>
  <div class="relative size-(--ring-size)" :style="vars">
    <svg :width="size" :height="size" class="-rotate-90">
      <circle
        :cx="size / 2"
        :cy="size / 2"
        :r="radius"
        :stroke-width="stroke"
        fill="none"
        class="stroke-fill-muted"
      />
      <circle
        :cx="size / 2"
        :cy="size / 2"
        :r="radius"
        :stroke-width="stroke"
        fill="none"
        stroke-linecap="round"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="offset"
        class="transition-[stroke-dashoffset] duration-500 ease-out"
        :class="tone === 'orange' ? 'stroke-orange' : 'stroke-rose'"
      />
    </svg>
    <div class="absolute inset-0 grid place-items-center text-center">
      <slot />
    </div>
  </div>
</template>
