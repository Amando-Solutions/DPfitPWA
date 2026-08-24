<script setup lang="ts">
// The nudge on Home. Opt-out rather than sticky: "Not now" puts it away for a
// fortnight, and the More hub keeps a permanent row for anyone who changes
// their mind before then.
const install = useInstallApp()

const busy = ref(false)

const run = async () => {
  busy.value = true
  try {
    await install.install()
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section v-if="install.showCard.value" class="install">
    <div class="install__top">
      <span class="install__icon">
        <AppIcon name="download" :size="17" />
      </span>
      <div class="install__text">
        <h2 class="install__title">Keep the challenge one tap away</h2>
        <p class="install__body">
          Install DP Fitness to your home screen. It opens full screen and your
          sessions load without a connection.
        </p>
      </div>
    </div>

    <div class="install__actions">
      <AppButton
        size="md"
        :block="false"
        :disabled="busy"
        class="install__cta"
        @click="run"
      >
        {{ install.ctaLabel.value }}
      </AppButton>
      <button type="button" class="install__dismiss" @click="install.snooze()">
        Not now
      </button>
    </div>
  </section>
</template>

<style scoped lang="scss">
.install {
  padding: 16px;
  border-radius: var(--radius-card);
  background: var(--paper-raised);

  &__top {
    display: flex;
    gap: 12px;
  }

  &__icon {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-pill);
    background: var(--rose-soft);
    color: var(--rose);
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }

  &__text {
    flex: 1;
    min-width: 0;
  }

  &__title {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 16px;
    letter-spacing: -0.24px;
    color: var(--ink);
  }

  &__body {
    margin: 4px 0 0;
    font-size: 13px;
    line-height: 1.45;
    color: var(--violet-45);
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 13px;
  }

  &__cta {
    flex: 1;
    min-width: 0;
  }

  &__dismiss {
    flex-shrink: 0;
    padding: 0 12px;
    height: 44px;
    font-size: 13px;
    font-weight: 600;
    color: var(--violet-45);
  }
}
</style>
