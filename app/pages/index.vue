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
definePageMeta({
  layout: false,
  middleware() {
    const store = useAppStore()
    if (!store.isAuthenticated.value) return navigateTo('/onboarding', { replace: true })
    if (!store.isSetupComplete.value) return navigateTo('/setup/about-you', { replace: true })
    return navigateTo('/home', { replace: true })
  },
})
</script>

<template>
  <!-- Never painted: the middleware above always redirects. -->
  <div />
</template>
