<script setup lang="ts">
// The 1 to 5 rating row used by the weekly check-in.
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

    <!-- A rating is a single choice from five, so it is a radio group: arrow
         keys walk the scale, and the whole row is one tab stop. -->
    <RadioGroup
      :model-value="modelValue ?? undefined"
      orientation="horizontal"
      :aria-label="label"
      class="flex gap-1.75"
      @update:model-value="$emit('update:modelValue', Number($event))"
    >
      <RadioGroupItem
        v-for="step in steps"
        :key="step"
        :value="step"
        variant="plain"
        class="min-w-0 flex-1 rounded-[14px] border-[1.5px] border-hairline bg-sunken px-0.5 py-[13.5px] text-center font-data text-[13px] font-bold text-soft transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-ring data-[state=checked]:border-rose data-[state=checked]:bg-rose-soft data-[state=checked]:text-rose"
      >
        {{ step }}
      </RadioGroupItem>
    </RadioGroup>

    <div
      v-if="lowLabel || highLabel"
      class="flex items-center justify-between pt-1.5 font-data text-[8.5px] uppercase tracking-[0.425px] text-muted"
    >
      <span>{{ lowLabel }}</span>
      <span>{{ highLabel }}</span>
    </div>
  </div>
</template>
