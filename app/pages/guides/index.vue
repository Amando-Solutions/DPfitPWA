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
  <div class="guides pt-(--screen-pad-top) px-5 pb-0 [&_.guides__title]:mt-2 [&_.guides__title]:mx-0 [&_.guides__title]:mb-1.5 [&_.guides__sub]:mt-0 [&_.guides__sub]:mx-0 [&_.guides__sub]:mb-4 [&_.guides__sub]:text-[13.5px] lg:p-0 lg:[&_.guides__sub]:text-[15px]">
    <ScreenIntro
      eyebrow="Reference library"
      title="Program guides"
      subtitle="Read-only guides, logging happens on Train."
      :actions="false"
      class="guides__header"
    />

    <div class="guides__filters scroll-x mt-4 flex gap-2 overflow-x-auto pb-1 mb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button
        v-for="category in guideCategories"
        :key="category"
        class="chip shrink-0 py-2 px-3.5 rounded-pill bg-raised text-[12.5px] text-muted whitespace-nowrap [&.chip--on]:bg-inverse [&.chip--on]:text-on-inverse [&.chip--on]:font-semibold"
        :class="{ 'chip--on': filter === category }"
        @click="filter = category"
      >
        {{ category }}
      </button>
    </div>

    <div class="guides__list flex flex-col gap-3 lg:grid lg:grid-cols-3 lg:items-start lg:gap-4">
      <component
        :is="guide.locked ? 'div' : NuxtLink"
        v-for="guide in rows"
        :key="guide.id"
        :to="guide.locked ? undefined : `/guides/${guide.id}`"
        class="guide block relative p-4 rounded-card bg-raised shadow-card text-ink [&.guide--locked]:opacity-60 [&.guide--locked]:shadow-[inset_0_0_0_1.5px_var(--hairline)] [&.guide--locked]:bg-transparent [&.guide--locked]:cursor-default lg:[&:not(.guide--locked)]:transition-[translate,box-shadow] lg:[&:not(.guide--locked)]:duration-150 lg:[&:not(.guide--locked)]:ease-[ease] lg:[&:not(.guide--locked):hover]:-translate-y-0.5 lg:[&:not(.guide--locked):hover]:shadow-raised"
        :class="{ 'guide--locked': guide.locked }"
      >
        <div class="guide__top flex items-center justify-between gap-2.5 mb-2">
          <span class="guide__meta tabular-nums text-[12px] text-muted">{{ guide.steps }} steps · {{ guide.readMinutes }} min read</span>
          <span v-if="guide.locked" class="guide__lock inline-flex items-center gap-1.25 text-[11.5px] text-muted">
            <AppIcon name="lock" :size="12" />
            Unlocks in week {{ guide.unlockWeek }}
          </span>
          <AppIcon v-else name="chevronRight" :size="16" class="guide__chev text-muted" />
        </div>
        <h2 class="guide__title mt-0 mx-0 mb-1.5 font-display font-black text-[17px]">{{ guide.title }}</h2>
        <p class="guide__excerpt mt-0 mx-0 mb-2.5 text-[13px] leading-[1.5] text-muted">{{ guide.excerpt }}</p>
        <span class="guide__category inline-block text-[11.5px] text-rose bg-rose-soft py-1 px-2.25 rounded-pill">{{ guide.category }}</span>
      </component>
    </div>

    <p v-if="!rows.length" class="guides__empty muted my-6 mx-0 text-center text-[13.5px]">
      Nothing in this category yet.
    </p>
  </div>
</template>
