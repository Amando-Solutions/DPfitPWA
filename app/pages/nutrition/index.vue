<script setup lang="ts">
// 18 · Fuel · Daily Targets, computed from the member's own numbers.
definePageMeta({ layout: 'app' })

import { targetsBreakdown } from '~/lib/domain/nutrition'

const store = useAppStore()
const targets = computed(() => store.targets.value)
const breakdown = computed(() => targetsBreakdown(targets.value))
const allergies = computed(() => store.profile.value?.allergies?.trim() ?? '')
</script>

<template>
  <div class="fuel [padding:var(--screen-pad-top)_20px_0] lg:[display:grid] lg:[grid-template-columns:minmax(0,_1fr)_minmax(0,_1fr)] lg:[grid-template-areas:'header_header'_'macros_numbers'_'macros_plate'_'macros_allergy'] lg:[align-content:start] lg:[align-items:start] lg:[column-gap:24px] lg:[row-gap:14px] lg:[padding:0_0_8px]">
    <ScreenIntro
      eyebrow="Your targets"
      title="Daily fuel"
      subtitle="Calculated from your profile. No logging, no counting. Just hit these."
      class="fuel__header lg:[grid-area:header]"
    />

    <!-- Calories + macros -->
    <div class="macros [display:grid] [grid-template-columns:1fr_1fr] [gap:11px] [margin-top:28px] lg:[grid-area:macros] lg:[margin-top:10px]">
      <div class="macros__cal [grid-column:span_2] [display:flex] [flex-direction:column] [padding:20px] [border-radius:var(--radius-card)] [background:var(--surface-inverse)] [filter:var(--drop-lg)]">
        <span class="macros__cal-label [font-family:var(--font-eyebrow)] [text-transform:uppercase] [letter-spacing:0.95px] [font-size:9.5px] [font-weight:700] [color:var(--on-inverse-muted)]">Daily calories</span>
        <span class="macros__cal-value [margin-top:6px] [font-family:var(--font-display)] [font-weight:900] [font-size:44px] [line-height:1] [letter-spacing:-1.32px] [color:var(--on-inverse)] lg:[font-size:56px]">{{ targets.kcalTarget }}</span>
        <span class="macros__cal-meta data [margin-top:6px] [font-size:11px] [color:var(--on-inverse-muted)]">kcal · {{ targets.approach.toLowerCase() }}</span>
      </div>

      <div class="macro macro--protein [display:flex] [flex-direction:column] [padding:17px] [border-radius:var(--radius-card)] [border:1px_solid_transparent] [background:var(--rose-soft)] [border-color:var(--rose-ring)] [&_.macro__value]:[color:var(--rose)]">
        <span class="macro__value [font-family:var(--font-display)] [font-weight:900] [font-size:24px] [line-height:1.2] [letter-spacing:-0.6px]">{{ targets.proteinG }}g</span>
        <span class="macro__label data [margin-top:4px] [text-transform:uppercase] [letter-spacing:0.76px] [font-size:9.5px] [color:var(--violet-28)]">Protein</span>
      </div>

      <div class="macro macro--fat [display:flex] [flex-direction:column] [padding:17px] [border-radius:var(--radius-card)] [border:1px_solid_transparent] [background:var(--orange-16)] [border-color:var(--orange-ring)] [&_.macro__value]:[color:var(--macro-fat)]">
        <span class="macro__value [font-family:var(--font-display)] [font-weight:900] [font-size:24px] [line-height:1.2] [letter-spacing:-0.6px]">{{ targets.fatG }}g</span>
        <span class="macro__label data [margin-top:4px] [text-transform:uppercase] [letter-spacing:0.76px] [font-size:9.5px] [color:var(--violet-28)]">Fat</span>
      </div>

      <div class="macro macro--carbs [display:flex] [flex-direction:column] [padding:17px] [border-radius:var(--radius-card)] [border:1px_solid_transparent] [grid-column:span_2] [flex-direction:row] [align-items:baseline] [gap:8px] [background:var(--macro-carbs-soft)] [border-color:var(--macro-carbs-ring)] [&_.macro__value]:[color:var(--macro-carbs)] [&_.macro__label]:[margin-top:0]">
        <span class="macro__value [font-family:var(--font-display)] [font-weight:900] [font-size:24px] [line-height:1.2] [letter-spacing:-0.6px]">{{ targets.carbsG }}g</span>
        <span class="macro__label data [margin-top:4px] [text-transform:uppercase] [letter-spacing:0.76px] [font-size:9.5px] [color:var(--violet-28)]">Carbs</span>
      </div>
    </div>

    <!-- Your numbers -->
    <section class="numbers [margin-top:11px] [padding:18px] [border-radius:var(--radius-card)] [border:1px_dashed_var(--hairline-strong)] lg:[grid-area:numbers] lg:[margin-top:10px]">
      <h2 class="numbers__title data [margin:0] [text-transform:uppercase] [letter-spacing:1.2px] [font-size:10px] [font-weight:700] [color:var(--violet-28)]">✂ your numbers</h2>
      <div class="numbers__rows [display:flex] [flex-direction:column] [gap:9px] [padding-top:12px]">
        <div v-for="row in breakdown" :key="row.label" class="numbers__row [display:flex] [align-items:center] [justify-content:space-between] [gap:12px] [font-size:12px] [color:var(--violet-28)]">
          <span class="data">{{ row.label }}</span>
          <span class="numbers__value data [color:var(--ink)]">{{ row.value }}</span>
        </div>
        <div class="numbers__row numbers__row--total [display:flex] [align-items:center] [justify-content:space-between] [gap:12px] [font-size:12px] [color:var(--violet-28)] [margin-top:1px] [padding-top:10px] [border-top:1px_dashed_var(--hairline-strong)]">
          <span class="numbers__total-label [font-family:var(--font-eyebrow)] [font-weight:700] [font-size:12px] [color:var(--ink)]">Daily target</span>
          <span class="numbers__total-value data [font-weight:700] [color:var(--rose)]">{{ targets.kcalTarget }} kcal</span>
        </div>
      </div>
    </section>

    <!-- Plate structure -->
    <section class="note note--plate [margin-top:12px] [padding:18px] [border-radius:var(--radius-card)] [background:var(--paper-raised)] [border:1px_solid_var(--hairline)] [filter:var(--drop-md)] lg:[margin-top:0] lg:[grid-area:plate]">
      <h2 class="note__title [margin:0] [font-family:var(--font-display)] [font-weight:900] [font-size:16px] [letter-spacing:-0.24px] [color:var(--ink)]">Suggested plate structure</h2>
      <p class="note__body [margin:7px_0_0] [font-size:13.5px] [line-height:1.55] [color:var(--violet-28)]">{{ targets.plateStructure }}</p>
    </section>

    <!-- Allergies -->
    <section class="note note--allergy [margin-top:12px] [padding:18px] [border-radius:var(--radius-card)] [background:var(--paper-raised)] [border:1px_solid_var(--hairline)] [filter:var(--drop-md)] lg:[margin-top:0] lg:[grid-area:allergy]">
      <h2 class="note__title [margin:0] [font-family:var(--font-display)] [font-weight:900] [font-size:16px] [letter-spacing:-0.24px] [color:var(--ink)]">Allergy &amp; restriction note</h2>
      <p class="note__body [margin:7px_0_0] [font-size:13.5px] [line-height:1.55] [color:var(--violet-28)]">
        {{
          allergies
            ? `You told us: ${allergies}. Swaps that avoid it show up here.`
            : 'No restrictions are on file. Tell us in Profile & Settings and swaps show up here.'
        }}
      </p>
    </section>
  </div>
</template>
