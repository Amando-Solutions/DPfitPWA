<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    value: number
    max?: number
    height?: number
    /** Solid accent, or the flame gradient used for rank progress. */
    tone?: 'rose' | 'orange'
    flame?: boolean
  }>(),
  { max: 100, height: 6, tone: 'rose', flame: false },
)

const pct = computed(() =>
  Math.max(0, Math.min(100, (props.value / props.max) * 100)),
)

// Height and fill width are data, not design, so they arrive as custom
// properties and the Tailwind classes below consume them. That keeps every
// styling decision in a class while the numbers stay dynamic.
const vars = computed(() => ({
  '--bar-h': `${props.height}px`,
  '--bar-fill': `${pct.value}%`,
}))
</script>

<template>
  <div
    class="h-(--bar-h) w-full overflow-hidden rounded-pill bg-fill-muted"
    :style="vars"
    role="progressbar"
    :aria-valuenow="value"
    :aria-valuemax="max"
  >
    <div
      class="h-full w-(--bar-fill) rounded-pill transition-[width] duration-400 ease-out"
      :class="flame ? 'flame-gradient' : tone === 'orange' ? 'bg-orange' : 'bg-rose-fill'"
    />
  </div>
</template>
