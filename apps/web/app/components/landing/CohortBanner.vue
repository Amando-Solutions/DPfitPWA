<script setup lang="ts">
import { REGISTER_ANCHOR, TRAINING_DAYS } from '~/data/landing'

/**
 * The wide photograph under the hero, with the upcoming cohort pinned to it
 * on a frosted card.
 */
const { challenge, weeks, startsLong, enrolmentLine } = useCohortLabels()
</script>

<template>
  <div class="lp-reveal mx-auto mt-8 max-w-348 px-6 md:mt-12">
    <div
      class="relative flex min-h-130 items-end justify-end overflow-hidden rounded-3xl bg-lp-ink px-[clamp(16px,5vw,80px)] pt-12 pb-4 sm:min-h-140 sm:items-center sm:rounded-[28px] sm:pb-12"
    >
      <!--
        Decorative: the card carries the meaning. The subject sits left of
        centre, so narrow panels crop toward her rather than the machine, and
        on phones the card drops to the bottom to keep her face clear.
      -->
      <img
        src="/landing/gallery-dumbbell-floor.jpg"
        alt=""
        width="2000"
        height="1328"
        class="absolute inset-0 size-full object-cover object-[28%_50%]"
      >

      <div
        class="relative flex w-[320px] max-w-full flex-col gap-4 rounded-[20px] bg-[rgba(29,22,40,0.6)] p-6 text-white backdrop-blur-lg sm:p-7"
      >
        <div class="flex flex-col gap-1.5">
          <span class="text-[12px] opacity-75">upcoming cohort</span>
          <span class="serif-accent text-[28px] leading-[1.1]">
            {{ challenge?.name ?? 'body recomp challenge' }}
          </span>
        </div>
        <span v-if="startsLong" class="text-[14px] leading-[1.6]">
          {{ startsLong }}<br>
          <template v-if="weeks">{{ weeks }} weeks · </template>{{ TRAINING_DAYS }} gym days a week
        </span>
        <span v-else class="text-[14px] leading-[1.6]">Dates to be announced</span>
        <span v-if="enrolmentLine" class="-mt-1 text-[13px] leading-normal opacity-80">{{ enrolmentLine }}</span>
        <a :href="REGISTER_ANCHOR" class="lp-ul mt-1 self-start text-[14px] font-semibold text-white">
          book a slot ↗
        </a>
      </div>
    </div>
  </div>
</template>
