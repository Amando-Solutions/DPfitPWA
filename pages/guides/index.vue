<script setup lang="ts">
// 25 · Program Guides (+ 27/28 locked & unlocked states)
definePageMeta({ layout: 'app' })

import { guideCategories, guides } from '~/data/program'

const store = useAppStore()

// Resolved once in setup — `resolveComponent` isn't usable from a v-for render.
const NuxtLink = resolveComponent('NuxtLink')

const filter = ref('All')

const stepsOf = (body: string) => body.split('\n\n').filter(Boolean).length

const rows = computed(() =>
  guides
    .map((guide) => ({
      ...guide,
      steps: stepsOf(guide.body),
      // A guide unlocks when the member reaches its week — never a fixed flag.
      locked: store.clock.value.week < guide.unlockWeek,
    }))
    .filter((guide) => filter.value === 'All' || guide.category === filter.value),
)
</script>

<template>
  <div class="guides">
    <ScreenIntro
      eyebrow="Reference library"
      title="Program guides"
      subtitle="Read-only guides, logging happens on Train."
      :actions="false"
      class="guides__header"
    />

    <div class="guides__filters scroll-x">
      <button
        v-for="category in guideCategories"
        :key="category"
        class="chip"
        :class="{ 'chip--on': filter === category }"
        @click="filter = category"
      >
        {{ category }}
      </button>
    </div>

    <div class="guides__list">
      <component
        :is="guide.locked ? 'div' : NuxtLink"
        v-for="guide in rows"
        :key="guide.id"
        :to="guide.locked ? undefined : `/guides/${guide.id}`"
        class="guide"
        :class="{ 'guide--locked': guide.locked }"
      >
        <div class="guide__top">
          <span class="guide__meta data">{{ guide.steps }} steps · {{ guide.readMinutes }} min read</span>
          <span v-if="guide.locked" class="guide__lock">
            <AppIcon name="lock" :size="12" />
            Unlocks in week {{ guide.unlockWeek }}
          </span>
          <AppIcon v-else name="chevronRight" :size="16" class="guide__chev" />
        </div>
        <h2 class="guide__title">{{ guide.title }}</h2>
        <p class="guide__excerpt">{{ guide.excerpt }}</p>
        <span class="guide__category">{{ guide.category }}</span>
      </component>
    </div>

    <p v-if="!rows.length" class="guides__empty muted">
      Nothing in this category yet.
    </p>
  </div>
</template>

<style scoped lang="scss">
.guides {
  padding: var(--screen-pad-top) 20px 0;

  &__title {
    margin: 8px 0 6px;
  }

  &__sub {
    margin: 0 0 16px;
    font-size: 13.5px;
  }

  &__filters {
    margin-top: 16px;
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 4px;
    margin-bottom: 16px;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  &__empty {
    margin: 24px 0;
    text-align: center;
    font-size: 13.5px;
  }
}

.chip {
  flex-shrink: 0;
  padding: 8px 14px;
  border-radius: var(--radius-pill);
  background: var(--paper-raised);
  box-shadow: inset 0 0 0 1.5px rgba(36, 27, 46, 0.09);
  font-family: var(--font-eyebrow);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-size: 9.5px;
  font-weight: 700;
  color: var(--violet-45);
  white-space: nowrap;
  transition:
    background 0.15s ease,
    color 0.15s ease;

  &--on {
    background: var(--ink);
    box-shadow: none;
    color: var(--paper-raised);
  }
}

.guide {
  display: block;
  position: relative;
  padding: 16px;
  border-radius: var(--radius-card);
  background: var(--paper-raised);
  box-shadow: var(--shadow-card);
  color: var(--ink);

  &--locked {
    opacity: 0.6;
    box-shadow: inset 0 0 0 1.5px rgba(36, 27, 46, 0.09);
    background: transparent;
    cursor: default;
  }

  &__top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 8px;
  }

  &__meta {
    font-size: 10px;
    letter-spacing: 0.45px;
    color: var(--violet-45);
  }

  &__lock {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-family: var(--font-data);
    text-transform: uppercase;
    letter-spacing: 0.85px;
    font-size: 8.5px;
    font-weight: 700;
    color: var(--violet-45);
  }

  &__chev {
    color: var(--violet-45);
  }

  &__title {
    margin: 0 0 6px;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 17px;
  }

  &__excerpt {
    margin: 0 0 10px;
    font-size: 13px;
    line-height: 1.5;
    color: var(--violet-45);
  }

  &__category {
    display: inline-block;
    font-family: var(--font-eyebrow);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-size: 8.5px;
    font-weight: 700;
    color: var(--rose);
    background: var(--rose-25);
    padding: 4px 8px;
    border-radius: var(--radius-pill);
  }
}

@media (min-width: 1024px) {
  .guides {
    padding: 0;

    &__sub {
      font-size: 15px;
    }

    &__list {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      align-items: start;
      gap: 16px;
    }
  }

  .guide:not(.guide--locked) {
    transition:
      transform 0.15s ease,
      box-shadow 0.15s ease;

    &:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-raised);
    }
  }
}
</style>
