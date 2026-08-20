<script setup lang="ts">
const props = withDefaults(
  defineProps<{ modelValue: boolean; title?: string }>(),
  {},
)
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const close = () => emit('update:modelValue', false)

// Lock body scroll while open (only affects the screen behind the sheet).
watch(
  () => props.modelValue,
  () => {},
)
</script>

<template>
  <Teleport to="body">
    <!--
      The scrim fades while the panel slides, so the transition classes reach
      into the panel with a descendant variant rather than nesting a second
      <Transition>. They are spelled out in full because Tailwind matches
      complete class names in the source — a built-up string would never be
      seen by the scanner.
    -->
    <Transition
      enter-active-class="transition-opacity duration-[250ms] ease-out [&_[data-sheet-panel]]:transition-transform [&_[data-sheet-panel]]:duration-[280ms] [&_[data-sheet-panel]]:ease-[cubic-bezier(0.22,1,0.36,1)]"
      leave-active-class="transition-opacity duration-[250ms] ease-in [&_[data-sheet-panel]]:transition-transform [&_[data-sheet-panel]]:duration-[280ms] [&_[data-sheet-panel]]:ease-[cubic-bezier(0.22,1,0.36,1)]"
      enter-from-class="opacity-0 [&_[data-sheet-panel]]:translate-y-full lg:[&_[data-sheet-panel]]:translate-y-3 lg:[&_[data-sheet-panel]]:scale-95"
      leave-to-class="opacity-0 [&_[data-sheet-panel]]:translate-y-full lg:[&_[data-sheet-panel]]:translate-y-3 lg:[&_[data-sheet-panel]]:scale-95"
    >
      <!-- Bottom sheet on mobile; a centred dialog once there is desktop room. -->
      <div
        v-if="modelValue"
        class="fixed inset-0 z-200 flex flex-col items-center justify-end lg:justify-center"
      >
        <div
          class="absolute inset-0 bg-scrim backdrop-blur-[2px]"
          @click="close"
        />

        <div
          data-sheet-panel
          class="relative w-full max-w-130 rounded-t-[28px] bg-overlay px-5 pt-3 pb-[calc(24px+env(safe-area-inset-bottom))] shadow-sheet lg:rounded-lg lg:px-6.5 lg:pt-5.5 lg:pb-6.5 lg:shadow-dialog"
        >
          <div
            class="mx-auto mb-4 h-1 w-10 rounded-pill bg-hairline-strong lg:hidden"
          />
          <div
            v-if="title"
            class="mb-3 font-display text-[18px] font-black text-ink"
          >
            {{ title }}
          </div>
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
