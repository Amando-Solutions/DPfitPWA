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
    <Transition name="sheet">
      <div v-if="modelValue" class="sheet-root">
        <div class="sheet-root__scrim" @click="close" />
        <div class="sheet-root__panel">
          <div class="sheet-root__grab" />
          <div v-if="title" class="sheet-root__title">{{ title }}</div>
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
// Bottom sheet on mobile; a centred dialog once there is desktop room for one.
.sheet-root {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;

  &__scrim {
    position: absolute;
    inset: 0;
    background: rgba(20, 16, 26, 0.5);
    backdrop-filter: blur(2px);
  }

  &__panel {
    position: relative;
    width: 100%;
    max-width: 520px;
    background: var(--paper-raised);
    border-radius: 28px 28px 0 0;
    padding: 12px 20px calc(24px + env(safe-area-inset-bottom));
    box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.3);
  }

  &__grab {
    width: 40px;
    height: 4px;
    border-radius: 999px;
    background: rgba(36, 27, 46, 0.18);
    margin: 0 auto 16px;
  }

  &__title {
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 18px;
    margin-bottom: 12px;
  }

  @media (min-width: 1024px) {
    justify-content: center;

    &__panel {
      border-radius: var(--radius-lg);
      padding: 22px 26px 26px;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.32);
    }

    &__grab {
      display: none;
    }
  }
}

.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 0.25s ease;
  .sheet-root__panel {
    transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
  }
}
.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
  .sheet-root__panel {
    transform: translateY(100%);
  }
}
</style>
