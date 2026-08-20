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
  <div class="scale">
    <span class="scale__label">{{ label }}</span>
    <div class="scale__row" role="radiogroup" :aria-label="label">
      <button
        v-for="step in steps"
        :key="step"
        type="button"
        role="radio"
        :aria-checked="modelValue === step"
        class="scale__cell"
        :class="{ 'scale__cell--on': modelValue === step }"
        @click="$emit('update:modelValue', step)"
      >
        {{ step }}
      </button>
    </div>
    <div v-if="lowLabel || highLabel" class="scale__ends">
      <span>{{ lowLabel }}</span>
      <span>{{ highLabel }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.scale {
  display: flex;
  flex-direction: column;

  &__label {
    font-family: var(--font-data);
    text-transform: uppercase;
    letter-spacing: 0.81px;
    font-size: 9px;
    color: var(--violet-28);
    padding-bottom: 6px;
  }

  &__row {
    display: flex;
    gap: 7px;
  }

  &__cell {
    flex: 1;
    min-width: 0;
    padding: 13.5px 1.5px;
    border-radius: 14px;
    background: var(--paper);
    border: 1.5px solid rgba(36, 27, 46, 0.11);
    font-family: var(--font-data);
    font-weight: 700;
    font-size: 13px;
    text-align: center;
    color: var(--violet-28);
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      color 0.15s ease;

    &--on {
      background: rgba(200, 30, 92, 0.12);
      border-color: var(--rose);
      color: var(--rose);
    }
  }

  &__ends {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 6px;
    font-family: var(--font-data);
    font-size: 8.5px;
    letter-spacing: 0.425px;
    text-transform: uppercase;
    color: #736781;
  }
}
</style>
