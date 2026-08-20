<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'dark' | 'danger'
    size?: 'md' | 'lg'
    block?: boolean
    to?: string
    icon?: string
    iconRight?: string
    disabled?: boolean
    glow?: boolean
  }>(),
  { variant: 'primary', size: 'lg', block: true, glow: false },
)

defineEmits<{ (e: 'click', ev: MouseEvent): void }>()

// Resolved in setup — `resolveComponent` can't run from the render function.
const NuxtLink = resolveComponent('NuxtLink')
</script>

<template>
  <component
    :is="to ? NuxtLink : 'button'"
    :to="to"
    class="btn"
    :class="[
      `btn--${variant}`,
      `btn--${size}`,
      { 'btn--block': block, 'btn--glow': glow, 'btn--disabled': disabled },
    ]"
    :disabled="disabled"
    @click="(e: MouseEvent) => $emit('click', e)"
  >
    <AppIcon v-if="icon" :name="icon" :size="18" :stroke="2.2" />
    <span class="btn__label"><slot /></span>
    <AppIcon v-if="iconRight" :name="iconRight" :size="18" :stroke="2.2" />
  </component>
</template>

<style scoped lang="scss">
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: var(--radius-pill);
  font-family: var(--font-body);
  font-weight: 700;
  transition:
    transform 0.12s ease,
    opacity 0.12s ease,
    background 0.12s ease;
  white-space: nowrap;

  &:active {
    transform: scale(0.98);
  }

  &--block {
    width: 100%;
  }

  &--md {
    height: 44px;
    padding: 0 18px;
    font-size: 14px;
  }
  &--lg {
    height: 54px;
    padding: 0 24px;
    font-size: 15px;
  }

  &--primary {
    background: var(--rose);
    color: var(--paper-raised);
  }
  &--danger {
    background: var(--rose);
    color: var(--paper-raised);
  }
  &--dark {
    background: var(--ink);
    color: var(--paper-raised);
  }
  &--secondary {
    background: var(--paper-raised);
    color: var(--ink);
    box-shadow: inset 0 0 0 1.5px rgba(36, 27, 46, 0.12);
  }
  &--ghost {
    background: transparent;
    color: var(--rose);
  }

  &--glow {
    box-shadow: var(--shadow-glow);
  }

  &--disabled {
    opacity: 0.45;
    pointer-events: none;
  }
}
</style>
