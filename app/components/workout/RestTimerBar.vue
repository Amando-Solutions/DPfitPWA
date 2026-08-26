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

const ADJ =
  'btn-raised rounded-pill bg-on-inverse/12 px-3 py-1.5 text-[13px] font-bold text-on-inverse [--btn-face:var(--face-on-inverse)]'
</script>

<template>
  <div
    class="flex items-center gap-2.5 rounded-lg bg-inverse px-3.5 py-2.5 text-on-inverse shadow-hero"
  >
    <button :class="ADJ" @click="emit('adjust', -15)">-15</button>

    <span
      class="data flex-1 text-center text-[22px] font-bold tracking-[1px] text-orange"
    >
      {{ label }}
    </span>

    <button :class="ADJ" @click="emit('adjust', 15)">+15</button>

    <button
      class="btn-raised rounded-pill bg-rose-fill px-4 py-2 text-[13px] font-bold text-on-rose [--btn-face:var(--rose-fill)]"
      @click="emit('skip')"
    >
      Skip
    </button>
  </div>
</template>
