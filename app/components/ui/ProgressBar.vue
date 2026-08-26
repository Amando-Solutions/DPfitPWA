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

// Height is data, not design, so it arrives as a custom property and the
// Tailwind class below consumes it. The fill width is Reka's job.
const vars = computed(() => ({ '--bar-h': `${props.height}px` }))

const fill = computed(() =>
  props.flame ? 'flame-gradient' : props.tone === 'orange' ? 'bg-orange' : 'bg-rose-fill',
)
</script>

<template>
  <!-- shadcn's Progress (Reka's ProgressRoot) publishes the full
       `aria-valuemin`/`valuemax`/`valuenow` set plus a `data-state`; the
       hand-rolled bar declared a role and a value but never a minimum, which
       leaves the percentage ambiguous to a screen reader. -->
  <Progress
    :model-value="value"
    :max="max"
    :style="vars"
    class="h-(--bar-h)"
    :indicator-class="fill"
  />
</template>
