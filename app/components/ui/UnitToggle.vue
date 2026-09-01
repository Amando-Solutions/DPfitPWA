<script setup lang="ts">
/*
  The small two-option switch that sits beside a measurement field: kg / lb,
  cm / ft-in.

  A radio group rather than two buttons, for the same reason `SegmentedTabs` is:
  it is one choice from a set, so it wants one tab stop and arrow keys, not two
  independent tab stops that happen to look related.

  It changes nothing but the display. Every measurement is stored metric, and
  the field either side of this converts on the way in and out — see
  `lib/domain/nutrition`.
*/
defineProps<{
  modelValue: string
  options: { id: string; label: string }[]
  /** Names the control for screen readers, e.g. "Weight unit". */
  label: string
}>()

defineEmits<{ (e: 'update:modelValue', v: string): void }>()
</script>

<template>
  <RadioGroup
    :model-value="modelValue"
    orientation="horizontal"
    :aria-label="label"
    class="flex shrink-0 gap-0.5 rounded-pill bg-fill-subtle p-0.75"
    @update:model-value="$emit('update:modelValue', $event as string)"
  >
    <RadioGroupItem
      v-for="option in options"
      :key="option.id"
      :value="option.id"
      variant="plain"
      class="min-h-6.5 rounded-pill px-2.5 py-1 text-[11px] text-muted transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-ring data-[state=checked]:bg-inverse data-[state=checked]:font-semibold data-[state=checked]:text-on-inverse"
    >
      {{ option.label }}
    </RadioGroupItem>
  </RadioGroup>
</template>
