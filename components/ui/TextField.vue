<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue?: string | number
    label?: string
    placeholder?: string
    type?: string
    suffix?: string
    icon?: string
    error?: string
    mono?: boolean
  }>(),
  { type: 'text', mono: false },
)

defineEmits<{
  (e: 'update:modelValue', v: string): void
  // `blur` doesn't bubble, so it has to be re-emitted from the input itself for
  // save-on-blur forms to work.
  (e: 'blur', ev: FocusEvent): void
}>()
</script>

<template>
  <label class="field" :class="{ 'field--error': error }">
    <span v-if="label" class="field__label">{{ label }}</span>
    <div class="field__control">
      <AppIcon v-if="icon" :name="icon" :size="18" class="field__icon" />
      <input
        class="field__input"
        :class="{ 'field__input--mono': mono }"
        :type="type"
        :value="modelValue"
        :placeholder="placeholder"
        @input="
          $emit('update:modelValue', ($event.target as HTMLInputElement).value)
        "
        @blur="$emit('blur', $event as FocusEvent)"
      />
      <span v-if="suffix" class="field__suffix">{{ suffix }}</span>
    </div>
    <span v-if="error" class="field__error">{{ error }}</span>
  </label>
</template>

<style scoped lang="scss">
.field {
  display: block;
  // Grid/flex items default to min-width:auto, and a number input's intrinsic
  // width is wide enough to burst a two-column row. This keeps it in its track.
  min-width: 0;

  // Form labels across the design are Space Mono, not the Chivo Mono eyebrow.
  &__label {
    display: block;
    font-family: var(--font-data);
    text-transform: uppercase;
    letter-spacing: 0.9px;
    font-size: 9.5px;
    color: var(--violet-28);
    margin-bottom: 6px;
  }

  &__control {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    height: 54px;
    padding: 0 17px;
    background: var(--paper);
    border: 1px solid rgba(36, 27, 46, 0.11);
    border-radius: var(--space-16);
    transition: border-color 0.15s ease;

    &:focus-within {
      border-color: var(--rose);
    }
  }

  &__icon {
    color: var(--violet-45);
  }

  &__input {
    flex: 1;
    width: 100%;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    font-size: 15px;
    color: var(--ink);

    // The native number spinner overlaps the suffix and eats the field width.
    appearance: textfield;
    &::-webkit-outer-spin-button,
    &::-webkit-inner-spin-button {
      appearance: none;
      margin: 0;
    }

    &::placeholder {
      color: #757575;
    }

    &--mono {
      font-family: var(--font-data);
      letter-spacing: 1px;
    }
  }

  &__suffix {
    font-size: 13px;
    color: var(--violet-45);
    font-weight: 600;
  }

  &__error {
    display: block;
    margin-top: 6px;
    font-size: 12px;
    color: var(--rose);
    font-weight: 600;
  }

  &--error .field__control {
    border-color: var(--rose);
  }
}
</style>
