<script setup lang="ts">
// The rating row used by the weekly check-in. Five steps, so the whole scale
// sits in one row on a phone.
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
    <span class="pb-2 text-[13px] text-soft">{{ label }}</span>

    <!-- A rating is a single choice from the set, so it is a radio group: arrow
         keys walk the scale, and the whole row is one tab stop. -->
    <RadioGroup
      :model-value="modelValue ?? undefined"
      orientation="horizontal"
      :aria-label="label"
      class="grid grid-cols-5 gap-1.75"
      @update:model-value="$emit('update:modelValue', Number($event))"
    >
      <RadioGroupItem
        v-for="step in steps"
        :key="step"
        :value="step"
        variant="plain"
        class="min-w-0 rounded-md border-[1.5px] border-hairline bg-sunken px-0.5 py-3 text-center text-[13px] font-bold text-soft tabular-nums transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring data-[state=checked]:border-primary data-[state=checked]:bg-primary-soft data-[state=checked]:text-primary"
      >
        {{ step }}
      </RadioGroupItem>
    </RadioGroup>

    <div
      v-if="lowLabel || highLabel"
      class="flex items-center justify-between pt-2 text-[11.5px] text-muted"
    >
      <span>{{ lowLabel }}</span>
      <span>{{ highLabel }}</span>
    </div>
  </div>
</template>
