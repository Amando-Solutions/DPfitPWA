<script setup lang="ts">
/**
 * 00 · Entry.
 *
 * There is no splash screen here any more. `spa-loading-template.html` paints
 * the branded boot frame before Nuxt is running and Nuxt tears it down once the
 * first real screen is ready, so drawing a second copy of it in Vue only made
 * the member sit through the same picture twice.
 *
 * That leaves `/` with nothing to render: it is a routing decision, taken in
 * middleware so it resolves during the initial navigation, before the app
 * mounts, and therefore before the boot frame is removed. The member goes
 * straight from the splash to their destination with no frame in between.
 */
import { FIRST_SETUP_STEP } from '~/middleware/auth.global'

definePageMeta({
  layout: false,
  middleware() {
    const store = useAppStore()
    switch (store.gate.value) {
      // Nobody signed in: the tour, which ends on the sign-in screen.
      case 'needs-auth':
        return navigateTo('/onboarding', { replace: true })
      // Signed in already, so the tour has nothing left to say — and being
      // walked back through three marketing slides on every launch is what a
      // half-finished sign-up felt like. Straight to the outstanding half.
      case 'needs-code':
      case 'unknown':
        return navigateTo('/access-code', { replace: true })
      case 'needs-setup':
        return navigateTo(FIRST_SETUP_STEP, { replace: true })
    }
    return navigateTo('/home', { replace: true })
  },
})
</script>

<template>
  <!-- Never painted: the middleware above always redirects. -->
  <div />
</template>
