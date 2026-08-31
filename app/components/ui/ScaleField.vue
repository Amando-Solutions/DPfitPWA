<script setup lang="ts">
// The rating row used by the weekly check-in.
//
// Ten steps by default, not five. A five-point scale collapses "fine" and
// "good" into the same tap, and the middle option collects everyone who hasn't
// thought about it; ten leaves room to answer honestly and gives a coach
// reading a run of check-ins something that actually moves week to week.
withDefaults(
  defineProps<{
    modelValue: number | null
    label: string
    steps?: number
    lowLabel?: string
    highLabel?: string
  }>(),
  { steps: 10 },
)

defineEmits<{ (e: 'update:modelValue', value: number): void }>()
</script>

<template>
  <div class="flex flex-col">
    <span class="pb-2 text-[13px] text-soft">{{ label }}</span>

    <!-- A rating is a single choice from the set, so it is a radio group: arrow
         keys walk the scale, and the whole row is one tab stop. Ten cells will
         not sit in one row on a phone, so they wrap to two. -->
    <RadioGroup
      :model-value="modelValue ?? undefined"
      orientation="horizontal"
      :aria-label="label"
      class="grid grid-cols-5 gap-1.75 sm:grid-cols-10"
      @update:model-value="$emit('update:modelValue', Number($event))"
    >
      <RadioGroupItem
        v-for="step in steps"
        :key="step"
        :value="step"
        variant="plain"
        class="min-w-0 rounded-md border-[1.5px] border-hairline bg-sunken px-0.5 py-3 text-center text-[13px] font-bold text-soft tabular-nums transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-ring data-[state=checked]:border-rose data-[state=checked]:bg-rose-soft data-[state=checked]:text-rose"
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
