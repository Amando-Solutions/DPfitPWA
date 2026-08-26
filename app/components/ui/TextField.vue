<script setup lang="ts">
withDefaults(
  defineProps<{
    // `null` is a real value here: the profile stores "not answered yet" as
    // null for age, height and weight, and those fields bind straight to this.
    modelValue?: string | number | null
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
  <!-- min-w-0: grid/flex items default to min-width:auto, and a number input's
       intrinsic width is wide enough to burst a two-column row. -->
  <label class="block min-w-0">
    <!-- Form labels across the design are Space Mono, not the Chivo Mono eyebrow. -->
    <span
      v-if="label"
      class="mb-1.5 block font-data text-[9.5px] uppercase tracking-[0.9px] text-soft"
    >
      {{ label }}
    </span>

    <div
      class="flex h-13.5 min-w-0 items-center gap-2.5 rounded-2xl border bg-sunken px-4.25 transition-colors duration-150"
      :class="
        error
          ? 'border-rose'
          : 'border-hairline focus-within:border-rose'
      "
    >
      <AppIcon v-if="icon" :name="icon" :size="18" class="text-muted" />
      <input
        class="w-full min-w-0 flex-1 appearance-none border-none bg-transparent text-[15px] text-ink outline-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none"
        :class="mono && 'font-data tracking-[1px]'"
        :type="type"
        :value="modelValue ?? ''"
        :placeholder="placeholder"
        @input="
          $emit('update:modelValue', ($event.target as HTMLInputElement).value)
        "
        @blur="$emit('blur', $event as FocusEvent)"
      />
      <span v-if="suffix" class="text-[13px] font-semibold text-muted">
        {{ suffix }}
      </span>
    </div>

    <span v-if="error" class="mt-1.5 block text-xs font-semibold text-rose">
      {{ error }}
    </span>
  </label>
</template>
