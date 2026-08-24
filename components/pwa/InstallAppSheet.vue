<script setup lang="ts">
// The fallback route: what to tap when the browser will not hand the page a
// prompt. iOS never does, and Chromium stops after the native dialog has been
// dismissed once, so both cases end up here.
const install = useInstallApp()

const IOS_STEPS = [
  { icon: 'share', text: 'Tap the Share button in Safari’s toolbar.' },
  { icon: 'plus', text: 'Scroll the sheet and pick “Add to Home Screen”.' },
  { icon: 'check', text: 'Tap “Add”. DP Fitness lands on your home screen.' },
]

const MENU_STEPS = [
  { icon: 'more', text: 'Open your browser’s menu.' },
  { icon: 'download', text: 'Pick “Install app”, or “Add to Home screen”.' },
  { icon: 'check', text: 'Confirm, and it installs like any other app.' },
]

const steps = computed(() =>
  install.method.value === 'ios' ? IOS_STEPS : MENU_STEPS,
)
</script>

<template>
  <BottomSheet v-model="install.guideOpen.value" title="Install DP Fitness">
    <p class="install-guide__lead">
      Three taps and the challenge sits on your home screen: full screen, no
      address bar, and your sessions open offline.
    </p>

    <ol class="install-guide__steps">
      <li v-for="(step, i) in steps" :key="i" class="install-guide__step">
        <span class="install-guide__icon">
          <AppIcon :name="step.icon" :size="16" />
        </span>
        <span class="install-guide__text">{{ step.text }}</span>
      </li>
    </ol>

    <p v-if="install.method.value === 'ios'" class="install-guide__note">
      No Share button? You are in another app&rsquo;s built-in browser. Open DP
      Fitness in Safari first.
    </p>

    <AppButton variant="secondary" @click="install.guideOpen.value = false">
      Got it
    </AppButton>
  </BottomSheet>
</template>

<style scoped lang="scss">
.install-guide {
  &__lead {
    margin: 0 0 16px;
    font-size: 13.5px;
    line-height: 1.5;
    color: var(--violet-45);
  }

  &__steps {
    // The numbering is carried by the icon chips, not by markers.
    list-style: none;
    margin: 0 0 16px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  &__step {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  &__icon {
    width: 32px;
    height: 32px;
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
    font-size: 13.5px;
    line-height: 1.45;
    color: var(--ink);
  }

  &__note {
    margin: 0 0 16px;
    padding: 10px 12px;
    border-radius: var(--radius-md);
    background: var(--fill-subtle);
    font-size: 12px;
    line-height: 1.45;
    color: var(--violet-45);
  }
}
</style>
