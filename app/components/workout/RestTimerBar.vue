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

// The ±15 controls are secondary to the count they adjust, so they stay
// neutral. Skip keeps the accent: it is the one that ends the rest.
const ADJ =
  'rounded-pill bg-on-inverse/12 px-3 py-1.5 text-[13px] text-on-inverse transition-opacity duration-100 active:opacity-70'
</script>

<template>
  <div
    class="flex items-center gap-2.5 rounded-2xl bg-inverse px-3.5 py-2.5 text-on-inverse shadow-card"
  >
    <button :class="ADJ" aria-label="Rest 15 seconds less" @click="emit('adjust', -15)">
      -15
    </button>

    <!-- A second clock, so it takes the same treatment as the one in the header:
         monospace and tabular, in ink rather than a second accent colour. -->
    <span class="flex-1 text-center font-data text-[22px] font-bold tracking-[1px] tabular-nums">
      {{ label }}
    </span>

    <button :class="ADJ" aria-label="Rest 15 seconds more" @click="emit('adjust', 15)">
      +15
    </button>

    <button
      class="rounded-pill bg-rose-fill px-4 py-2 text-[13px] font-bold text-on-rose transition-opacity duration-100 active:opacity-70"
      @click="emit('skip')"
    >
      Skip
    </button>
  </div>
</template>
