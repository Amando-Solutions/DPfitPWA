<script setup lang="ts">
import { APP_NAME, APP_SCREENS, EQUIPMENT, includedItems } from '~/data/landing'

const { weeks } = useCohortLabels()
const items = computed(() => includedItems(weeks.value ?? 6))

/*
  Below `sm` the three screens don't fit side by side, so they fan out from one
  baseline: the middle sits in front, and the outer two tuck behind it and tip
  outwards from their outer bottom corner, so only their tops spread. The ring
  in the card's colour keeps the middle frame from merging into the dark
  screens behind it. The fan leads with the workout, so `order` swaps it into
  the middle and the fuel screen out to the left; wider screens keep the data
  order with the fuel screen raised in the middle.
*/
const FAN = [
  // train
  'max-sm:relative max-sm:z-10 max-sm:order-2 max-sm:ring-3 max-sm:ring-lp-lilac-50 max-sm:shadow-xl',
  // fuel
  'sm:-mt-5 max-sm:order-1 max-sm:-mr-[21%] max-sm:origin-bottom-left max-sm:-rotate-9',
  // guides
  'max-sm:order-3 max-sm:-ml-[21%] max-sm:origin-bottom-right max-sm:rotate-9',
]
</script>

<template>
  <section id="included" class="mx-auto max-w-300 px-6 pt-20 pb-10 md:pt-30">
    <div class="lp-reveal mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 md:mb-12">
      <h2 class="lp-h2 leading-[1.02]">
        everything included, <span class="serif-accent">in one app</span>
      </h2>
      <span class="rounded-full border border-lp-field-edge px-3.5 py-2 text-[13px] font-semibold lowercase">
        {{ EQUIPMENT }}
      </span>
    </div>

    <div class="grid grid-cols-1 items-start gap-x-16 gap-y-10 md:gap-y-12 lg:grid-cols-2">
      <div
        class="lp-reveal flex flex-col items-center gap-7 rounded-4xl bg-lp-lilac-50 px-6 pt-10 pb-8"
      >
        <div class="flex w-full flex-wrap justify-center gap-3.5 pt-4 max-sm:flex-nowrap max-sm:items-end max-sm:gap-0">
          <!--
            Each screenshot runs the full length of the screen, taller than the
            frame, so it is pinned to the top where the screen's header is.
          -->
          <div
            v-for="(screen, i) in APP_SCREENS"
            :key="screen.src"
            class="lp-lift h-85 w-40 shrink-0 rounded-4xl bg-lp-ink p-1.75 max-sm:aspect-160/340 max-sm:h-auto max-sm:w-[38%] max-sm:rounded-[22px] max-sm:p-1.25"
            :class="FAN[i]"
          >
            <img
              :src="screen.src"
              :alt="screen.alt"
              width="440"
              height="1068"
              loading="lazy"
              decoding="async"
              class="size-full rounded-[26px] object-cover object-top max-sm:rounded-[17px]"
            >
          </div>
        </div>
        <p class="m-0 max-w-105 text-center text-[20px] leading-[1.3] font-medium tracking-[-0.02em] text-balance text-lp-soft sm:text-[22px]">
          The whole challenge runs in the
          <span class="serif-accent text-[1.2em] whitespace-nowrap text-lp-ink">{{ APP_NAME }}.</span>
        </p>
      </div>

      <ol class="lp-reveal m-0 flex list-none flex-col border-t border-lp-rule p-0">
        <li
          v-for="(item, i) in items"
          :key="item.title"
          class="grid grid-cols-[32px_minmax(0,1fr)] gap-3 border-b border-lp-rule py-5 sm:grid-cols-[44px_minmax(0,1fr)]"
        >
          <span class="pt-0.75 text-[13px] font-semibold text-lp-accent">
            {{ String(i + 1).padStart(2, '0') }}
          </span>
          <div>
            <h3 class="m-0 mb-1.5 text-[17px] leading-snug font-semibold">{{ item.title }}</h3>
            <p class="m-0 text-[14px] leading-[1.6] text-lp-soft">{{ item.description }}</p>
          </div>
        </li>
      </ol>
    </div>
  </section>
</template>
