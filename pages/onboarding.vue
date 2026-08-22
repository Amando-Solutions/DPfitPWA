<script setup lang="ts">
// Onboarding tour — 01 The Challenge, 02 How it Works, 03 You · The Cohort
definePageMeta({ layout: 'default' })

import { onboardingSlides } from '~/data/onboarding'

const router = useRouter()

const index = ref(0)
const current = computed(() => onboardingSlides[index.value])
const isLast = computed(() => index.value === onboardingSlides.length - 1)

const next = () => {
  if (isLast.value) router.push('/access-code')
  else index.value++
}
const skip = () => router.push('/access-code')
</script>

<template>
  <div class="onb">
    <header class="onb__top">
      <BrandWordmark size="sm" />
      <button class="onb__skip" @click="skip">SKIP</button>
    </header>

    <div class="onb__body">
      <div class="onb__art">
        <Transition name="fade" mode="out-in">
          <img
            :key="current.id"
            :src="current.illustration"
            :alt="current.title"
            class="onb__art-img"
            width="396"
            height="366"
            decoding="async"
            fetchpriority="high"
          />
        </Transition>
      </div>

      <div class="onb__copy">
        <Transition name="fade" mode="out-in">
          <div :key="current.id">
            <p class="onb__eyebrow">{{ current.eyebrow }}</p>
            <h1 class="onb__title">{{ current.title }}</h1>
          </div>
        </Transition>
      </div>
    </div>

    <footer class="onb__footer">
      <div class="onb__dots">
        <span
          v-for="(slide, i) in onboardingSlides"
          :key="slide.id"
          class="onb__dot"
          :class="{ 'onb__dot--active': i === index }"
        />
      </div>

      <button class="onb__cta btn-raised btn-glow" @click="next">{{ current.cta }}</button>

      <div class="onb__skip-tour-slot">
        <button v-if="!isLast" class="onb__skip-tour" @click="skip">Skip tour</button>
      </div>
    </footer>
  </div>
</template>

<style scoped lang="scss">
.onb {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: var(--screen-pad-top) 20px 18px;

  &__top {
    height: 42px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }

  &__skip {
    padding: 8px 0 8px 12px;
    font-family: var(--font-data);
    font-size: 10px;
    letter-spacing: 1.2px;
    color: var(--text-muted);
  }

  // The art and headline share the space between the header and the footer,
  // exactly as the design's 602px band does.
  &__body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding-top: 16px;
  }

  &__art {
    flex-shrink: 0;
    height: 296px;
    max-height: 42vh;
    border-radius: 30px;
    overflow: hidden;
    background: var(--onboard-art);
    box-shadow: var(--shadow-art);
  }

  &__art-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  &__copy {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 0 2px;
  }

  &__eyebrow {
    margin: 0;
    font-family: var(--font-eyebrow);
    font-weight: 700;
    font-size: 11.5px;
    letter-spacing: 1.265px;
    text-transform: uppercase;
    color: var(--rose);
  }

  &__title {
    margin: 10px 0 0;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 44px;
    line-height: 1.08;
    letter-spacing: -1.98px;
    color: var(--onboard-title);
  }

  &__footer {
    flex-shrink: 0;
    padding-top: 16px;
  }

  &__dots {
    height: 22px;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    gap: 7px;
    padding-bottom: 17px;
  }

  &__dot {
    width: 9px;
    height: 5px;
    border-radius: 99px;
    background: var(--onboard-dot);
    transition:
      width 0.25s ease,
      background 0.25s ease;

    &--active {
      width: 24px;
      background: var(--rose-fill);
    }
  }

  &__cta {
    width: 100%;
    height: 58px;
    border-radius: var(--radius-pill);
    background: var(--rose-fill);
    /* `btn-raised` supplies the stroke, the rose cast and the inner edges;
       `btn-glow` adds the halo the splash used to get from `--drop-art`. */
    --btn-face: var(--rose-fill);
    color: var(--on-rose);
    font-family: var(--font-body);
    font-weight: 700;
    font-size: 17px;
  }

  // Reserve the row so the CTA doesn't jump on the last slide.
  &__skip-tour-slot {
    height: 32px;
    padding-top: 13px;
    display: flex;
    justify-content: center;
  }

  &__skip-tour {
    padding: 1px 6px;
    font-family: var(--font-body);
    font-weight: 700;
    font-size: 15px;
    color: var(--rose);
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

// Short screens: let the art give way before the headline does.
@media (max-height: 720px) {
  .onb__art {
    height: 240px;
  }
  .onb__title {
    font-size: 36px;
    letter-spacing: -1.4px;
  }
}

@media (min-width: 1024px) {
  .onb {
    padding: 28px 28px 24px;
  }

  .onb__art {
    height: 320px;
    max-height: none;
  }

  .onb__copy {
    padding: 28px 2px;
  }
}
</style>
