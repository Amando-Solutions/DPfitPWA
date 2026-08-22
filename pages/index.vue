<script setup lang="ts">
// 00 · Splash — holds for a beat, then routes to wherever the member left off.
definePageMeta({ layout: false })

const router = useRouter()
const store = useAppStore()

/** Matches the `splash-fill` keyframes below — change the two together. */
const HOLD_MS = 1400

const destination = () => {
  if (!store.isAuthenticated.value) return '/onboarding'
  if (!store.isSetupComplete.value) return '/setup/about-you'
  return '/home'
}

/**
 * The bar is a CSS animation, not a `requestAnimationFrame` loop writing to a
 * reactive ref.
 *
 * The loop re-rendered the component ~84 times over the hold to animate one
 * width, running Vue's whole update path per frame on the slowest moment in the
 * app's life — first paint, while the store hydrates and the route resolves.
 * The compositor animates a `transform` off the main thread instead, so the bar
 * stays smooth even while boot work is happening. It also cannot outlive the
 * screen: the old loop kept scheduling frames (and would still fire the
 * `router.replace`) after an early navigation unmounted the page.
 */
let holdTimer: ReturnType<typeof setTimeout> | null = null

onMounted(() => {
  holdTimer = setTimeout(() => router.replace(destination()), HOLD_MS)
})

onBeforeUnmount(() => {
  if (holdTimer) clearTimeout(holdTimer)
  holdTimer = null
})
</script>

<template>
  <div class="splash">
    <!-- Corner art, in the design's paint order: both discs, then the rings
         over them. -->
    <div class="splash__glow splash__glow--rose" />
    <div class="splash__glow splash__glow--violet" />
    <div class="splash__ring splash__ring--top" />
    <div class="splash__ring splash__ring--bottom" />

    <div class="splash__center">
      <BrandWordmark size="lg" />
      <div class="splash__accent" />
      <p class="splash__tagline">Train with purpose · Transform with proof</p>
    </div>

    <div class="splash__loading">
      <div class="splash__loading-track">
        <div class="splash__loading-fill" />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.splash {
  // The corner art is authored at the design frame's 412 × 892, so every size
  // and offset below is that file's number. `--art` scales the whole set
  // together on the wider desktop surface — change it, not the geometry.
  --art: 1;

  position: relative;
  flex: 1;
  min-height: 0;
  background: var(--paper);
  overflow: hidden;
  display: flex;
  flex-direction: column;

  &__glow,
  &__ring {
    position: absolute;
    border-radius: 50%;
    pointer-events: none;
  }

  // Solid discs behind a heavy blur, not radial gradients: a gradient starts
  // fading at its own centre, which reads as haze rather than as light.
  &__glow--rose {
    width: calc(330px * var(--art));
    height: calc(330px * var(--art));
    top: calc(-180px * var(--art));
    right: calc(-178px * var(--art));
    background: var(--splash-glow-rose);
    filter: blur(calc(32px * var(--art)));
  }

  &__glow--violet {
    width: calc(360px * var(--art));
    height: calc(360px * var(--art));
    bottom: calc(-130px * var(--art));
    left: calc(-220px * var(--art));
    background: var(--splash-glow-violet);
    filter: blur(calc(38px * var(--art)));
  }

  // Hairline rings, each roughly concentric with the disc it sits over.
  &__ring {
    width: calc(250px * var(--art));
    height: calc(250px * var(--art));
    border: 1px solid var(--splash-ring);
  }

  &__ring--top {
    top: calc(-72px * var(--art));
    right: calc(-134px * var(--art));
  }

  &__ring--bottom {
    bottom: calc(-72px * var(--art));
    left: calc(-134px * var(--art));
  }

  &__center {
    position: relative;
    z-index: 1;
    margin: auto;
    padding: 40px 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 15px;
  }

  &__accent {
    width: 52px;
    height: 4px;
    border-radius: 999px;
    background: var(--rose-fill);
  }

  &__tagline {
    margin: 0;
    font-family: var(--font-data);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.15px;
    font-size: 9.5px;
    line-height: 14px;
    color: var(--ink);
  }

  &__loading {
    position: relative;
    z-index: 1;
    padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px));
    display: grid;
    place-items: center;
  }

  &__loading-track {
    width: 68px;
    height: 4px;
    border-radius: 999px;
    background: var(--ink);
    overflow: hidden;
  }

  &__loading-fill {
    height: 100%;
    background: var(--rose-fill);
    border-radius: 999px;
    // Scaled rather than sized: `transform` is composited, `width` relayouts
    // the track on every frame. `transform-origin` keeps it growing from the
    // left edge.
    transform-origin: left center;
    animation: splash-fill 1400ms linear forwards;
    will-change: transform;
  }
}

@keyframes splash-fill {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}

// The hold is a fixed timeout, so with motion reduced just show the bar full
// rather than leaving an empty track for the duration.
@media (prefers-reduced-motion: reduce) {
  .splash__loading-fill {
    animation: none;
    transform: scaleX(1);
  }
}

@media (min-width: 1024px) {
  .splash {
    --art: 1.55;

    // Past `--app-max-width` the surface stops short of the window, and art
    // anchored to it would be sliced off down a hard vertical line. The design
    // hangs this off the *screen* corners, so on desktop so does this: the area
    // beside the surface is painted the same colour, which leaves the glows
    // reading as one unbroken wash. (Nothing above the splash has a transform
    // or filter, so the viewport really is the containing block here.)
    &__glow,
    &__ring {
      position: fixed;
    }

    &__center {
      transform: scale(1.35);
    }
  }
}
</style>
