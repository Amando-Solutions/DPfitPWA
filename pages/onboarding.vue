<script setup lang="ts">
// Onboarding tour: 01 The Challenge, 02 How it Works, 03 You · The Cohort
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
  <div class="onb [flex:1] [display:flex] [flex-direction:column] [padding:var(--screen-pad-top)_20px_18px] [&_.fade-enter-active]:[transition:opacity_0.25s_ease] [&_.fade-leave-active]:[transition:opacity_0.25s_ease] [&_.fade-enter-from]:[opacity:0] [&_.fade-leave-to]:[opacity:0] lg:[padding:28px_28px_24px]">
    <header class="onb__top [height:42px] [display:flex] [align-items:center] [justify-content:space-between] [flex-shrink:0]">
      <BrandWordmark size="sm" />
      <button class="onb__skip [padding:8px_0_8px_12px] [font-family:var(--font-data)] [font-size:10px] [letter-spacing:1.2px] [color:var(--text-muted)]" @click="skip">SKIP</button>
    </header>

    <div class="onb__body [flex:1] [min-height:0] [display:flex] [flex-direction:column] [padding-top:16px]">
      <div class="onb__art [flex-shrink:0] [height:296px] [max-height:42vh] [border-radius:30px] [overflow:hidden] [background:var(--onboard-art)] [box-shadow:var(--shadow-art)] [@media(max-height:_720px)]:[height:240px] lg:[height:320px] lg:[max-height:none]">
        <Transition name="fade" mode="out-in">
          <img
            :key="current.id"
            :src="current.illustration"
            :alt="current.title"
            class="onb__art-img [width:100%] [height:100%] [object-fit:cover] [display:block]"
            width="396"
            height="366"
            decoding="async"
            fetchpriority="high"
          />
        </Transition>
      </div>

      <div class="onb__copy [flex:1] [min-height:0] [display:flex] [flex-direction:column] [justify-content:center] [padding:0_2px] lg:[padding:28px_2px]">
        <Transition name="fade" mode="out-in">
          <div :key="current.id">
            <p class="onb__eyebrow [margin:0] [font-family:var(--font-eyebrow)] [font-weight:700] [font-size:11.5px] [letter-spacing:1.265px] [text-transform:uppercase] [color:var(--rose)]">{{ current.eyebrow }}</p>
            <h1 class="onb__title [margin:10px_0_0] [font-family:var(--font-display)] [font-weight:900] [font-size:44px] [line-height:1.08] [letter-spacing:-1.98px] [color:var(--onboard-title)] [@media(max-height:_720px)]:[font-size:36px] [@media(max-height:_720px)]:[letter-spacing:-1.4px]">{{ current.title }}</h1>
          </div>
        </Transition>
      </div>
    </div>

    <footer class="onb__footer [flex-shrink:0] [padding-top:16px]">
      <div class="onb__dots [height:22px] [display:flex] [align-items:flex-start] [justify-content:center] [gap:7px] [padding-bottom:17px]">
        <span
          v-for="(slide, i) in onboardingSlides"
          :key="slide.id"
          class="onb__dot [width:9px] [height:5px] [border-radius:99px] [background:var(--onboard-dot)] [transition:width_0.25s_ease,_background_0.25s_ease] [&.onb__dot--active]:[width:24px] [&.onb__dot--active]:[background:var(--rose-fill)]"
          :class="{ 'onb__dot--active': i === index }"
        />
      </div>

      <button class="onb__cta btn-raised btn-glow [width:100%] [height:58px] [border-radius:var(--radius-pill)] [background:var(--rose-fill)] [--btn-face:var(--rose-fill)] [color:var(--on-rose)] [font-family:var(--font-body)] [font-weight:700] [font-size:17px]" @click="next">{{ current.cta }}</button>

      <div class="onb__skip-tour-slot [height:32px] [padding-top:13px] [display:flex] [justify-content:center]">
        <button v-if="!isLast" class="onb__skip-tour [padding:1px_6px] [font-family:var(--font-body)] [font-weight:700] [font-size:15px] [color:var(--rose)]" @click="skip">Skip tour</button>
      </div>
    </footer>
  </div>
</template>
