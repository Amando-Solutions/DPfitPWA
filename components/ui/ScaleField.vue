<script setup lang="ts">
// The 1–5 rating row used by the weekly check-in.
withDefaults(
  defineProps<{
    modelValue: number | null
    label: string
    steps?: number
    lowLabel?: string
    highLabel?: string
  }>(),
  { steps: 5 },
)

defineEmits<{ (e: 'update:modelValue', value: number): void }>()
</script>

<template>
  <div class="flex flex-col">
    <span
      class="pb-1.5 font-data text-[9px] uppercase tracking-[0.81px] text-soft"
    >
      {{ label }}
    </span>

    <div class="flex gap-1.75" role="radiogroup" :aria-label="label">
      <button
        v-for="step in steps"
        :key="step"
        type="button"
        role="radio"
        :aria-checked="modelValue === step"
        class="min-w-0 flex-1 rounded-[14px] border-[1.5px] px-0.5 py-[13.5px] text-center font-data text-[13px] font-bold transition-colors duration-150"
        :class="
          modelValue === step
            ? 'border-rose bg-rose-soft text-rose'
            : 'border-hairline bg-sunken text-soft'
        "
        @click="$emit('update:modelValue', step)"
      >
        {{ step }}
      </button>
    </div>

    <div
      v-if="lowLabel || highLabel"
      class="flex items-center justify-between pt-1.5 font-data text-[8.5px] uppercase tracking-[0.425px] text-muted"
    >
      <span>{{ lowLabel }}</span>
      <span>{{ highLabel }}</span>
    </div>
  </div>
</template>
