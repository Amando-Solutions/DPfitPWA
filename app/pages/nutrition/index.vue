<script setup lang="ts">
// 18 · Fuel · Daily Targets, computed from the member's own numbers.
definePageMeta({ layout: 'app' })

import { targetsBreakdown } from '~/lib/domain/nutrition'

const store = useAppStore()
const targets = computed(() => store.targets.value)
const breakdown = computed(() => targetsBreakdown(targets.value))
const healthConditions = computed(() => store.profile.value?.healthConditions?.trim() ?? '')

/*
  Three faces did the work of two on this screen.

  Every label here was Space Mono, uppercase — "YOUR TARGETS", "DAILY CALORIES",
  "✂ YOUR NUMBERS" — and so was the whole receipt underneath. The receipt was
  the only part with a case for it, and the case was column alignment, which
  `tabular-nums` gives the body face for free. So the monospace is gone and the
  labels are sentence case in the body font, matching Home.

  The display face is reserved for exactly one thing per screen. Here that is
  the page title "Daily fuel" and the numbers it exists to show; section
  headings below it are bold body text, however much they look like titles.
*/
const CARD_LABEL = 'text-[13px] text-muted'
const MACRO = 'flex flex-col rounded-card border p-[17px]'
const MACRO_VALUE =
  'font-display text-[24px] leading-[1.2] font-black tracking-[-0.6px] tabular-nums'
const MACRO_LABEL = 'mt-1 text-[12px] text-soft'
const SECTION_HEADING = 'm-0 text-[16px] font-bold text-ink'
const NOTE_CARD =
  'rounded-card border border-hairline bg-raised p-[18px] shadow-card'
</script>

<template>
  <div class="fuel pt-(--screen-pad-top) px-5 pb-0 lg:grid lg:grid-cols-2 lg:[grid-template-areas:'header_header'_'macros_numbers'_'macros_plate'_'macros_allergy'] lg:content-start lg:items-start lg:gap-x-6 lg:gap-y-3.5 lg:pt-0 lg:px-0 lg:pb-2">
    <ScreenIntro
      eyebrow="Your targets"
      title="Daily fuel"
      subtitle="Calculated from your profile. No logging, no counting. Just hit these."
      class="fuel__header lg:[grid-area:header]"
    />

    <!-- Calories + macros -->
    <div class="macros grid grid-cols-[1fr_1fr] gap-2.75 mt-7 lg:[grid-area:macros] lg:mt-2.5">
      <div class="col-span-2 flex flex-col rounded-card bg-inverse p-5">
        <span :class="CARD_LABEL" class="text-on-inverse-muted">Daily calories</span>
        <span class="mt-1.5 font-display text-[44px] leading-none font-black tracking-[-1.32px] text-on-inverse tabular-nums lg:text-[56px]">
          {{ targets.kcalTarget }}
        </span>
        <span class="mt-1.5 text-[12px] text-on-inverse-muted">
          kcal · {{ targets.approach.toLowerCase() }}
        </span>
      </div>

      <div :class="MACRO" class="border-rose-ring bg-rose-soft">
        <span :class="MACRO_VALUE" class="text-rose">{{ targets.proteinG }}g</span>
        <span :class="MACRO_LABEL">Protein</span>
      </div>

      <div :class="MACRO" class="border-orange-ring bg-orange-soft">
        <span :class="MACRO_VALUE" class="text-macro-fat">{{ targets.fatG }}g</span>
        <span :class="MACRO_LABEL">Fat</span>
      </div>

      <div
        :class="MACRO"
        class="col-span-2 flex-row items-baseline gap-2 border-(--macro-carbs-ring) bg-(--macro-carbs-soft)"
      >
        <span :class="MACRO_VALUE" class="text-macro-carbs">{{ targets.carbsG }}g</span>
        <span :class="MACRO_LABEL" class="mt-0">Carbs</span>
      </div>
    </div>

    <!-- Your numbers -->
    <section class="numbers mt-2.75 p-4.5 rounded-card border border-dashed border-hairline-strong lg:[grid-area:numbers] lg:mt-2.5">
      <h2 :class="CARD_LABEL" class="m-0">Your numbers</h2>
      <div class="flex flex-col gap-2.25 pt-3">
        <div
          v-for="row in breakdown"
          :key="row.label"
          class="flex items-center justify-between gap-3 text-[13px] text-soft"
        >
          <span>{{ row.label }}</span>
          <span class="text-ink tabular-nums">{{ row.value }}</span>
        </div>
        <div
          class="mt-px flex items-center justify-between gap-3 border-t border-dashed border-hairline-strong pt-2.5 text-[13px]"
        >
          <span class="font-semibold text-ink">Daily target</span>
          <span class="font-semibold text-rose tabular-nums">{{ targets.kcalTarget }} kcal</span>
        </div>
      </div>
    </section>

    <!-- Plate structure -->
    <section :class="NOTE_CARD" class="mt-3 lg:mt-0 lg:[grid-area:plate]">
      <h2 :class="SECTION_HEADING">Suggested plate structure</h2>
      <p class="mt-1.75 mb-0 text-[13.5px] leading-[1.55] text-soft">
        {{ targets.plateStructure }}
      </p>
    </section>

    <!-- Health conditions -->
    <section :class="NOTE_CARD" class="mt-3 lg:mt-0 lg:[grid-area:allergy]">
      <h2 :class="SECTION_HEADING">Health conditions note</h2>
      <p class="mt-1.75 mb-0 text-[13.5px] leading-[1.55] text-soft">
        {{
          healthConditions
            ? `You told us: ${healthConditions}. Swaps that work around it show up here.`
            : 'Nothing is on file. Tell us in Profile & Settings and swaps show up here.'
        }}
      </p>
    </section>
  </div>
</template>
