<script setup lang="ts">
// 00 · Splash — holds for a beat, then routes to wherever the member left off.
definePageMeta({ layout: false })

const router = useRouter()
const store = useAppStore()
const progress = ref(0)

const destination = () => {
  if (!store.isAuthenticated.value) return '/onboarding'
  if (!store.isSetupComplete.value) return '/setup/about-you'
  return '/home'
}

onMounted(() => {
  const start = Date.now()
  const duration = 1400
  const tick = () => {
    const t = Math.min(1, (Date.now() - start) / duration)
    progress.value = t * 100
    if (t < 1) requestAnimationFrame(tick)
    else router.replace(destination())
  }
  requestAnimationFrame(tick)
})
</script>

<template>
  <div class="splash">
    <div class="splash__glow splash__glow--rose" />
    <div class="splash__glow splash__glow--violet" />

    <div class="splash__center">
      <BrandWordmark size="lg" />
      <div class="splash__accent" />
      <p class="splash__tagline">Train with purpose · Transform with proof</p>
    </div>

    <div class="splash__loading">
      <div class="splash__loading-track">
        <div class="splash__loading-fill" :style="{ width: `${progress}%` }" />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.splash {
  position: relative;
  flex: 1;
  min-height: 0;
  background: var(--paper);
  overflow: hidden;
  display: flex;
  flex-direction: column;

  &__glow {
    position: absolute;
    border-radius: 50%;
    filter: blur(10px);

    &--rose {
      width: 300px;
      height: 300px;
      top: -120px;
      right: -90px;
      background: radial-gradient(circle, rgba(200, 30, 92, 0.55), transparent 68%);
    }
    &--violet {
      width: 360px;
      height: 360px;
      bottom: -120px;
      left: -140px;
      background: radial-gradient(circle, rgba(74, 63, 82, 0.5), transparent 70%);
    }
  }

  &__center {
    position: relative;
    margin: auto;
    padding: 40px 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
  }

  &__accent {
    width: 52px;
    height: 4px;
    border-radius: 999px;
    background: var(--rose);
  }

  &__tagline {
    margin: 0;
    font-family: var(--font-eyebrow);
    text-transform: uppercase;
    letter-spacing: 1.5px;
    font-size: 10.5px;
    color: var(--violet-45);
  }

  &__loading {
    position: relative;
    padding-bottom: 40px;
    display: grid;
    place-items: center;
  }

  &__loading-track {
    width: 68px;
    height: 4px;
    border-radius: 999px;
    background: rgba(36, 27, 46, 0.12);
    overflow: hidden;
  }

  &__loading-fill {
    height: 100%;
    background: var(--rose);
    border-radius: 999px;
    transition: width 0.1s linear;
  }
}

@media (min-width: 1024px) {
  .splash {
    &__center {
      transform: scale(1.35);
    }

    &__glow--rose {
      width: 520px;
      height: 520px;
      top: -180px;
      right: -160px;
    }

    &__glow--violet {
      width: 620px;
      height: 620px;
      bottom: -220px;
      left: -220px;
    }
  }
}
</style>
