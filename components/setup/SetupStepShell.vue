<script setup lang="ts">
withDefaults(
  defineProps<{
    step: number
    total: number
    eyebrow: string
    title: string
    subtitle?: string
    cta?: string
    /** Continue stays disabled until the step's required fields are filled. */
    canContinue?: boolean
    busy?: boolean
  }>(),
  { canContinue: true, busy: false },
)

const emit = defineEmits<{ (e: 'continue'): void }>()
const router = useRouter()
</script>

<template>
  <div class="setup">
    <header class="setup__top">
      <button class="setup__back" aria-label="Back" @click="router.back()">
        <AppIcon name="arrowLeft" :size="20" :stroke="2.2" />
      </button>
      <span class="setup__step data">Step {{ step }} of {{ total }}</span>
    </header>

    <div class="setup__progress">
      <div
        v-for="n in total"
        :key="n"
        class="setup__seg"
        :class="{ 'setup__seg--done': n <= step }"
      />
    </div>

    <div class="setup__head">
      <EyebrowLabel>{{ eyebrow }}</EyebrowLabel>
      <h1 class="setup__title display-lg">{{ title }}</h1>
      <p v-if="subtitle" class="setup__sub muted">{{ subtitle }}</p>
    </div>

    <div class="setup__body">
      <slot />
    </div>

    <div class="setup__footer">
      <AppButton
        glow
        icon-right="arrowRight"
        :disabled="!canContinue || busy"
        @click="emit('continue')"
      >
        {{ busy ? 'Saving…' : (cta ?? 'Continue') }}
      </AppButton>
    </div>
  </div>
</template>

<style scoped lang="scss">
.setup {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 8px 24px 24px;

  &__top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  &__back {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: var(--paper-raised);
    box-shadow: var(--shadow-card);
    display: grid;
    place-items: center;
    color: var(--ink);
  }

  &__step {
    font-family: var(--font-eyebrow);
    text-transform: uppercase;
    letter-spacing: 1.5px;
    font-size: 10px;
    font-weight: 700;
    color: var(--violet-45);
  }

  &__progress {
    display: flex;
    gap: 6px;
    margin-bottom: 22px;
  }

  &__seg {
    flex: 1;
    height: 4px;
    border-radius: 999px;
    background: rgba(36, 27, 46, 0.12);
    transition: background 0.3s ease;

    &--done {
      background: var(--rose);
    }
  }

  &__head {
    margin-bottom: 22px;
  }

  &__title {
    margin: 10px 0 8px;
  }

  &__sub {
    margin: 0;
    font-size: 14px;
    line-height: 1.45;
  }

  &__body {
    flex: 1;
  }

  &__footer {
    padding-top: 16px;
  }
}

@media (min-width: 1024px) {
  .setup {
    padding: 32px 44px 36px;

    &__body {
      flex: 0 1 auto;
      margin-bottom: 12px;
    }

    &__sub {
      font-size: 15px;
    }
  }
}

</style>
