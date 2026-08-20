<script setup lang="ts">
import type { WorkoutDay } from '~/data/types'

const props = withDefaults(
  defineProps<{
    day: WorkoutDay
    /** Every session for the week is logged — the card becomes a well-done. */
    allDone?: boolean
  }>(),
  { allDone: false },
)

const setsPlanned = computed(() =>
  props.day.exercises.reduce((n, e) => n + e.targetSets, 0),
)
</script>

<template>
  <NuxtLink :to="`/train/${day.id}`" class="hero">
    <div class="hero__media" />
    <span class="hero__credit">Photo by John Arano on Unsplash</span>
    <div class="hero__scrim" />

    <div class="hero__content">
      <div class="hero__top">
        <span class="hero__eyebrow data">
          {{ allDone ? 'WEEK COMPLETE' : `TODAY · DAY ${day.dayNumber}` }}
        </span>
        <span class="hero__meta data">~{{ day.estMinutes }} MIN</span>
      </div>

      <h2 class="hero__title">{{ day.label }}</h2>

      <div class="hero__chips">
        <span class="hero__chip data">{{ day.exercises.length }} EXERCISES</span>
        <span class="hero__chip data">{{ setsPlanned }} SETS</span>
        <span class="hero__chip hero__chip--kcal data">~{{ day.estKcal }} KCAL</span>
      </div>

      <span class="hero__cta">
        {{ allDone ? 'Log an extra session' : 'Start today’s workout' }}
      </span>
    </div>
  </NuxtLink>
</template>

<style scoped lang="scss">
.hero {
  display: block;
  position: relative;
  min-height: 232px;
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: var(--ink);
  color: var(--paper-raised);

  &__media {
    position: absolute;
    inset: 0;
    background:
      url('https://images.unsplash.com/photo-1517963879433-6ad2b056d712?w=712&q=70')
        center/cover;
    opacity: 0.5;
    mix-blend-mode: luminosity;
  }

  &__scrim {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(120% 80% at 100% 0%, rgba(200, 30, 92, 0.38), transparent 55%),
      linear-gradient(180deg, rgba(36, 27, 46, 0.15) 0%, rgba(36, 27, 46, 0.82) 72%);
  }

  &__credit {
    position: absolute;
    top: 0;
    left: 0;
    padding: 2px 7px;
    background: rgba(0, 0, 0, 0.55);
    font-size: 10px;
    color: rgba(251, 246, 242, 0.85);
  }

  &__content {
    position: relative;
    padding: 20px;
    display: flex;
    flex-direction: column;
    min-height: 232px;
    justify-content: flex-end;
  }

  &__top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  &__eyebrow {
    padding: 5px 11px;
    border-radius: var(--radius-pill);
    background: rgba(255, 255, 255, 0.14);
    font-size: 10.5px;
    letter-spacing: 0.525px;
  }

  &__meta {
    font-size: 11px;
    color: rgba(251, 246, 242, 0.75);
  }

  &__title {
    margin: 16px 0 0;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 25px;
    line-height: 1.1;
    letter-spacing: -0.625px;
  }

  &__chips {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    margin-top: 13px;
  }

  &__chip {
    padding: 5px 11px;
    border-radius: var(--radius-pill);
    background: rgba(255, 255, 255, 0.12);
    font-size: 10.5px;
    letter-spacing: 0.525px;

    &--kcal {
      background: rgba(232, 163, 61, 0.18);
      color: var(--orange);
    }
  }

  &__cta {
    margin-top: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 15px;
    border-radius: var(--radius-pill);
    background: var(--rose);
    color: var(--white);
    font-size: 14.5px;
    font-weight: 700;
  }
}

@media (min-width: 1024px) {
  .hero {
    min-height: 300px;

    &__content {
      min-height: 300px;
      padding: 24px;
    }

    &__title {
      font-size: 30px;
    }
  }
}
</style>
