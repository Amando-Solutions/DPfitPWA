<script setup lang="ts">
// Onboarding tour: 01 The Challenge, 02 How it Works, 03 You · The Cohort
definePageMeta({ layout: 'default' })

import { onboardingSlides } from '~/data/onboarding'

const router = useRouter()

const index = ref(0)
// `index` is only ever moved within bounds, but an arbitrary index is still
// `| undefined` to the compiler, so fall back to the first slide.
const current = computed(() => onboardingSlides[index.value] ?? onboardingSlides[0])
const isLast = computed(() => index.value === onboardingSlides.length - 1)

const next = () => {
  if (isLast.value) router.push('/access-code')
  else index.value++
}
const skip = () => router.push('/access-code')
</script>

<template>
  <div class="onb flex-1 flex flex-col pt-(--screen-pad-top) px-5 pb-4.5 [&_.fade-enter-active]:transition-opacity [&_.fade-enter-active]:duration-250 [&_.fade-enter-active]:ease-[ease] [&_.fade-leave-active]:transition-opacity [&_.fade-leave-active]:duration-250 [&_.fade-leave-active]:ease-[ease] [&_.fade-enter-from]:opacity-0 [&_.fade-leave-to]:opacity-0 lg:pt-7 lg:px-7 lg:pb-6">
    <header class="onb__top h-10.5 flex items-center justify-between shrink-0">
      <BrandWordmark size="sm" />
      <button class="onb__skip pt-2 pr-0 pb-2 pl-3 font-data text-[10px] tracking-[1.2px] text-muted" @click="skip">SKIP</button>
    </header>

    <div class="onb__body flex-1 min-h-0 flex flex-col pt-4">
      <div class="onb__art shrink-0 h-[296px] max-h-[42vh] rounded-[30px] overflow-hidden bg-(--onboard-art) shadow-(--shadow-art) [@media(max-height:_720px)]:h-[240px] lg:h-[320px] lg:max-h-none">
        <Transition name="fade" mode="out-in">
          <img
            :key="current.id"
            :src="current.illustration"
            :alt="current.title"
            class="onb__art-img w-full h-full object-cover block"
            width="396"
            height="366"
            decoding="async"
            fetchpriority="high"
          />
        </Transition>
      </div>

      <div class="onb__copy flex-1 min-h-0 flex flex-col justify-center py-0 px-0.5 lg:py-7 lg:px-0.5">
        <Transition name="fade" mode="out-in">
          <div :key="current.id">
            <p class="onb__eyebrow m-0 font-eyebrow font-bold text-[11.5px] tracking-[1.265px] uppercase text-rose">{{ current.eyebrow }}</p>
            <h1 class="onb__title mt-2.5 mx-0 mb-0 font-display font-black text-[44px] leading-[1.08] tracking-[-1.98px] text-(--onboard-title) [@media(max-height:_720px)]:text-[36px] [@media(max-height:_720px)]:tracking-[-1.4px]">{{ current.title }}</h1>
          </div>
        </Transition>
      </div>
    </div>

    <footer class="onb__footer shrink-0 pt-4">
      <div class="onb__dots h-5.5 flex items-start justify-center gap-1.75 pb-4.25">
        <span
          v-for="(slide, i) in onboardingSlides"
          :key="slide.id"
          class="onb__dot w-2.25 h-1.25 rounded-[99px] bg-(--onboard-dot) transition-[width,background] duration-250 ease-[ease] [&.onb__dot--active]:w-6 [&.onb__dot--active]:bg-rose-fill"
          :class="{ 'onb__dot--active': i === index }"
        />
      </div>

      <button class="onb__cta w-full h-14.5 rounded-pill bg-rose-fill text-on-rose font-body font-bold text-[17px] transition-[transform,opacity,background-color] duration-100 ease-out active:scale-[0.985] motion-reduce:transition-none motion-reduce:active:scale-100" @click="next">{{ current.cta }}</button>

      <div class="onb__skip-tour-slot h-8 pt-3.25 flex justify-center">
        <button v-if="!isLast" class="onb__skip-tour py-0.25 px-1.5 font-body font-bold text-[15px] text-rose" @click="skip">Skip tour</button>
      </div>
    </footer>
  </div>
</template>
