<script setup lang="ts">
// 25 · Program Guides (+ 27/28 locked & unlocked states)
definePageMeta({ layout: 'app' })

import { guideCategories, guides } from '~/data/program'

const store = useAppStore()

// Resolved once in setup, because `resolveComponent` isn't usable from a v-for render.
const NuxtLink = resolveComponent('NuxtLink')

const filter = ref('All')

const stepsOf = (body: string) => body.split('\n\n').filter(Boolean).length

const rows = computed(() =>
  guides
    .map((guide) => ({
      ...guide,
      steps: stepsOf(guide.body),
      // A guide unlocks when the member reaches its week, never a fixed flag.
      locked: store.clock.value.week < guide.unlockWeek,
    }))
    .filter((guide) => filter.value === 'All' || guide.category === filter.value),
)
</script>

<template>
  <div class="guides [padding:var(--screen-pad-top)_20px_0] [&_.guides__title]:[margin:8px_0_6px] [&_.guides__sub]:[margin:0_0_16px] [&_.guides__sub]:[font-size:13.5px] lg:[padding:0] lg:[&_.guides__sub]:[font-size:15px]">
    <ScreenIntro
      eyebrow="Reference library"
      title="Program guides"
      subtitle="Read-only guides, logging happens on Train."
      :actions="false"
      class="guides__header"
    />

    <div class="guides__filters scroll-x [margin-top:16px] [display:flex] [gap:8px] [overflow-x:auto] [padding-bottom:4px] [margin-bottom:16px] [scrollbar-width:none] [&::-webkit-scrollbar]:[display:none]">
      <button
        v-for="category in guideCategories"
        :key="category"
        class="chip btn-raised [flex-shrink:0] [padding:8px_14px] [border-radius:var(--radius-pill)] [background:var(--paper-raised)] [--btn-face:var(--surface-raised)] [font-family:var(--font-eyebrow)] [text-transform:uppercase] [letter-spacing:0.5px] [font-size:9.5px] [font-weight:700] [color:var(--violet-45)] [white-space:nowrap] [&.chip--on]:[background:var(--surface-inverse)] [&.chip--on]:[--btn-face:var(--surface-inverse)] [&.chip--on]:[color:var(--on-inverse)]"
        :class="{ 'chip--on': filter === category }"
        @click="filter = category"
      >
        {{ category }}
      </button>
    </div>

    <div class="guides__list [display:flex] [flex-direction:column] [gap:12px] lg:[display:grid] lg:[grid-template-columns:repeat(3,_minmax(0,_1fr))] lg:[align-items:start] lg:[gap:16px]">
      <component
        :is="guide.locked ? 'div' : NuxtLink"
        v-for="guide in rows"
        :key="guide.id"
        :to="guide.locked ? undefined : `/guides/${guide.id}`"
        class="guide [display:block] [position:relative] [padding:16px] [border-radius:var(--radius-card)] [background:var(--paper-raised)] [box-shadow:var(--shadow-card)] [color:var(--ink)] [&.guide--locked]:[opacity:0.6] [&.guide--locked]:[box-shadow:inset_0_0_0_1.5px_var(--hairline)] [&.guide--locked]:[background:transparent] [&.guide--locked]:[cursor:default] lg:[&:not(.guide--locked)]:[transition:transform_0.15s_ease,_box-shadow_0.15s_ease] lg:[&:not(.guide--locked):hover]:[transform:translateY(-2px)] lg:[&:not(.guide--locked):hover]:[box-shadow:var(--shadow-raised)]"
        :class="{ 'guide--locked': guide.locked }"
      >
        <div class="guide__top [display:flex] [align-items:center] [justify-content:space-between] [gap:10px] [margin-bottom:8px]">
          <span class="guide__meta data [font-size:10px] [letter-spacing:0.45px] [color:var(--violet-45)]">{{ guide.steps }} steps · {{ guide.readMinutes }} min read</span>
          <span v-if="guide.locked" class="guide__lock [display:inline-flex] [align-items:center] [gap:5px] [font-family:var(--font-data)] [text-transform:uppercase] [letter-spacing:0.85px] [font-size:8.5px] [font-weight:700] [color:var(--violet-45)]">
            <AppIcon name="lock" :size="12" />
            Unlocks in week {{ guide.unlockWeek }}
          </span>
          <AppIcon v-else name="chevronRight" :size="16" class="guide__chev [color:var(--violet-45)]" />
        </div>
        <h2 class="guide__title [margin:0_0_6px] [font-family:var(--font-display)] [font-weight:900] [font-size:17px]">{{ guide.title }}</h2>
        <p class="guide__excerpt [margin:0_0_10px] [font-size:13px] [line-height:1.5] [color:var(--violet-45)]">{{ guide.excerpt }}</p>
        <span class="guide__category [display:inline-block] [font-family:var(--font-eyebrow)] [text-transform:uppercase] [letter-spacing:0.5px] [font-size:8.5px] [font-weight:700] [color:var(--rose)] [background:var(--rose-soft)] [padding:4px_8px] [border-radius:var(--radius-pill)]">{{ guide.category }}</span>
      </component>
    </div>

    <p v-if="!rows.length" class="guides__empty muted [margin:24px_0] [text-align:center] [font-size:13.5px]">
      Nothing in this category yet.
    </p>
  </div>
</template>
