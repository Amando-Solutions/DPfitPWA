<script setup lang="ts">
// Minus / value / plus control from the check-in form.
const props = withDefaults(
  defineProps<{
    modelValue: number
    label: string
    min?: number
    max?: number
    step?: number
    suffix?: string
  }>(),
  { min: 0, max: 99, step: 1 },
)

const emit = defineEmits<{ (e: 'update:modelValue', value: number): void }>()

const clamp = (value: number) => Math.min(props.max, Math.max(props.min, value))
const nudge = (delta: number) => emit('update:modelValue', clamp(props.modelValue + delta))

const onInput = (event: Event) => {
  const value = Number((event.target as HTMLInputElement).value)
  emit('update:modelValue', Number.isFinite(value) ? clamp(value) : props.min)
}

const BTN =
  'grid h-full w-10 shrink-0 place-items-center text-ink transition-opacity disabled:cursor-default disabled:opacity-30'
</script>

<template>
  <div class="flex min-w-0 flex-col">
    <span
      class="pb-1.5 font-data text-[9px] uppercase tracking-[0.81px] text-soft"
    >
      {{ label }}
    </span>

    <div
      class="flex h-11.25 items-center justify-center rounded-[14px] border border-hairline bg-sunken px-1.25"
    >
      <button
        type="button"
        :class="BTN"
        :disabled="modelValue <= min"
        :aria-label="`Decrease ${label}`"
        @click="nudge(-step)"
      >
        <AppIcon name="minus" :size="14" :stroke="2.4" />
      </button>

      <input
        class="h-full w-full min-w-0 flex-1 appearance-none border-none bg-transparent text-center font-body text-[17px] text-ink outline-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none"
        type="number"
        inputmode="numeric"
        :value="modelValue"
        :min="min"
        :max="max"
        :step="step"
        :aria-label="label"
        @change="onInput"
      />

      <span v-if="suffix" class="mr-0.5 text-[13px] text-muted">{{ suffix }}</span>

      <button
        type="button"
        :class="BTN"
        :disabled="modelValue >= max"
        :aria-label="`Increase ${label}`"
        @click="nudge(step)"
      >
        <AppIcon name="plus" :size="14" :stroke="2.4" />
      </button>
    </div>
  </div>
</template>
