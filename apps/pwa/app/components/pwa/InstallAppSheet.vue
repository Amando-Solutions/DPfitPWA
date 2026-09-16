<script setup lang="ts">
// The fallback route: what to tap when the browser will not hand the page a
// prompt. iOS never does, and Chromium stops after the native dialog has been
// dismissed once, so both cases end up here.
const install = useInstallApp()
</script>

<template>
  <BottomSheet v-model="install.guideOpen.value" title="Install DP Fitness">
    <p class="install-guide__lead [margin:0_0_16px] [font-size:13.5px] [line-height:1.5] [color:var(--violet-45)]">
      Three taps and the challenge sits on your home screen: full screen, no
      address bar, and your sessions open offline.
      <!-- Only iOS walls the installed app off from the browser's storage, and
           this sheet only mounts behind a sign-in, so that sign-in is what
           doesn't come along. Said before the taps, not discovered after. -->
      <template v-if="install.method.value === 'ios'">
        You&rsquo;ll sign in once more when you open it.
      </template>
    </p>

    <InstallAppSteps :method="install.method.value" class="[margin:0_0_16px]" />

    <AppButton variant="secondary" @click="install.guideOpen.value = false">
      Got it
    </AppButton>
  </BottomSheet>
</template>
