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
</script>

<template>
  <div class="stepper">
    <span class="stepper__label">{{ label }}</span>
    <div class="stepper__control">
      <button
        type="button"
        class="stepper__btn"
        :disabled="modelValue <= min"
        :aria-label="`Decrease ${label}`"
        @click="nudge(-step)"
      >
        <AppIcon name="minus" :size="14" :stroke="2.4" />
      </button>
      <input
        class="stepper__value"
        type="number"
        inputmode="numeric"
        :value="modelValue"
        :min="min"
        :max="max"
        :step="step"
        :aria-label="label"
        @change="onInput"
      />
      <span v-if="suffix" class="stepper__suffix">{{ suffix }}</span>
      <button
        type="button"
        class="stepper__btn"
        :disabled="modelValue >= max"
        :aria-label="`Increase ${label}`"
        @click="nudge(step)"
      >
        <AppIcon name="plus" :size="14" :stroke="2.4" />
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.stepper {
  display: flex;
  flex-direction: column;
  min-width: 0;

  &__label {
    font-family: var(--font-data);
    text-transform: uppercase;
    letter-spacing: 0.81px;
    font-size: 9px;
    color: var(--violet-28);
    padding-bottom: 6px;
  }

  &__control {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 45px;
    padding: 0 5px;
    background: var(--paper);
    border: 1px solid rgba(36, 27, 46, 0.11);
    border-radius: 14px;
  }

  &__btn {
    width: 40px;
    height: 100%;
    display: grid;
    place-items: center;
    color: var(--ink);
    flex-shrink: 0;

    &:disabled {
      opacity: 0.3;
      cursor: default;
    }
  }

  &__value {
    flex: 1;
    min-width: 0;
    height: 100%;
    text-align: center;
    font-family: var(--font-body);
    font-size: 17px;
    color: var(--ink);
    background: none;
    border: none;
    outline: none;

    &::-webkit-outer-spin-button,
    &::-webkit-inner-spin-button {
      appearance: none;
      margin: 0;
    }
    appearance: textfield;
  }

  &__suffix {
    font-size: 13px;
    color: var(--violet-45);
    margin-right: 2px;
  }
}
</style>
