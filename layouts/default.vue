<script setup lang="ts">
// Full-bleed layout for flows without navigation (onboarding, auth, setup).
// On desktop the flow is centred in a narrow column so the copy and inputs keep
// a comfortable measure instead of stretching across the whole surface.
withDefaults(defineProps<{ bg?: string }>(), { bg: '' })
</script>

<template>
  <div class="layout-default" :style="bg ? { background: bg } : undefined">
    <div class="layout-default__body scroll-y">
      <div class="layout-default__flow">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.layout-default {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--paper);

  &__body {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  &__flow {
    flex: 1;
    display: flex;
    flex-direction: column;
    width: 100%;
  }
}

@media (min-width: 1024px) {
  .layout-default {
    &__body {
      align-items: center;
      padding: 40px 24px;
    }

    &__flow {
      // `margin: auto` (rather than justify-content) centres the card without
      // clipping its top once the content outgrows the viewport.
      flex: 0 1 auto;
      margin: auto;
      max-width: var(--flow-max);
      background: var(--paper-raised);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-raised);
      overflow: hidden;
    }
  }
}
</style>
