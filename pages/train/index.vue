<script setup lang="ts">
// 12 · Train · Day Picker
definePageMeta({ layout: 'app' })

import type { WorkoutDay } from '~/data/types'

const store = useAppStore()

const setsFor = (exercises: { targetSets: number }[]) =>
  exercises.reduce((n, e) => n + e.targetSets, 0)

const resumable = computed(() => store.activeSession.value)

/**
 * A locked day is a plain div, not a link.
 *
 * Leaving it a link and blocking the arrival on the other side works, but the
 * row still looks tappable and still lights up under a finger, which reads as
 * the app being broken rather than as a rule.
 */
const NuxtLinkComponent = resolveComponent('NuxtLink')
const rowTag = (day: WorkoutDay) =>
  day.status === 'locked' ? 'div' : NuxtLinkComponent

/** The first locked day is the one that opens next; the rest just wait. */
const nextUpId = computed(() => store.days.value.find((d) => d.status === 'locked')?.id)

const nextSessionLabel = computed(() =>
  store.nextSessionAt.value.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  }),
)

const lockedNote = computed(() => {
  // Nothing left to name once the week is done, so don't point at day 1 again.
  if (store.weekComplete.value) return 'Every session this week is logged. Well played.'
  const next = store.days.value.find((d) => d.id === nextUpId.value)
  return `Recovery counts. Day ${next?.dayNumber} opens ${nextSessionLabel.value}.`
})
</script>

<template>
  <div class="picker">
    <ScreenIntro
      :eyebrow="`Week ${store.clock.value.week} · log workout`"
      :title="store.trainingLocked.value ? 'Today is logged' : 'Pick today\u2019s session'"
      :subtitle="
        store.trainingLocked.value
          ? 'One session a day. The next one opens tomorrow.'
          : 'Tap a day to start logging sets.'
      "
    />

    <!-- Says why the list is inert, so a locked row isn't just unresponsive. -->
    <div v-if="store.trainingLocked.value" class="picker__locked">
      <span class="picker__locked-icon"><AppIcon name="check" :size="16" /></span>
      <span class="picker__locked-text">
        <strong>{{ store.sessionToday.value?.label }} is in the log</strong>
        <small>{{ lockedNote }}</small>
      </span>
    </div>

    <!-- A workout left half-logged is the first thing they should see. -->
    <NuxtLink v-if="resumable" :to="`/train/${resumable.dayId}`" class="picker__resume">
      <span class="picker__resume-icon"><AppIcon name="train" :size="18" /></span>
      <span class="picker__resume-text">
        <strong>Pick up where you left off</strong>
        <small>{{ store.getDay(resumable.dayId)?.label ?? 'Session in progress' }}</small>
      </span>
      <AppIcon name="chevronRight" :size="16" />
    </NuxtLink>

    <div class="picker__list">
      <component
        :is="rowTag(day)"
        v-for="day in store.days.value"
        :key="day.id"
        :to="day.status === 'locked' ? undefined : `/train/${day.id}`"
        class="day"
        :class="{
          'day--done': day.status === 'completed',
          'day--locked': day.status === 'locked',
        }"
      >
        <span class="day__badge">
          <AppIcon v-if="day.status === 'completed'" name="check" :size="16" />
          <AppIcon v-else-if="day.status === 'locked'" name="lock" :size="16" />
          <span v-else class="data">D{{ day.dayNumber }}</span>
        </span>

        <span class="day__text">
          <span class="day__title">Day {{ day.dayNumber }}: {{ day.label }}</span>
          <span class="day__meta">
            <span>{{ day.exercises.length }} exercises · {{ setsFor(day.exercises) }} sets</span>
            <span v-if="day.status === 'completed'" class="day__logged">Logged</span>
            <span
              v-else-if="day.id === nextUpId"
              class="day__logged day__logged--soon"
            >
              Tomorrow
            </span>
          </span>
        </span>

        <AppIcon
          v-if="day.status !== 'locked'"
          name="chevronRight"
          :size="16"
          class="day__chev"
        />
      </component>
    </div>
  </div>
</template>

<style scoped lang="scss">
.picker {
  padding: var(--screen-pad-top) 20px 0;

  &__resume {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 20px;
    padding: 14px 18px;
    border-radius: var(--radius-card);
    background: var(--surface-inverse);
    color: var(--on-inverse);
    box-shadow: var(--shadow-hero);
  }

  &__resume-icon {
    width: 38px;
    height: 38px;
    border-radius: 14px;
    background: var(--rose-fill);
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }

  &__resume-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;

    strong {
      font-family: var(--font-display);
      font-weight: 900;
      font-size: 15px;
    }
    small {
      font-size: 12.5px;
      color: var(--on-inverse-soft);
    }
  }

  &__locked {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 20px;
    padding: 14px 18px;
    border-radius: var(--radius-card);
    background: var(--rose-softer);
    border: 1px solid var(--rose-ring);
  }

  &__locked-icon {
    width: 34px;
    height: 34px;
    border-radius: var(--radius-pill);
    background: var(--rose-fill);
    color: var(--on-rose);
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }

  &__locked-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;

    strong {
      font-family: var(--font-display);
      font-weight: 900;
      font-size: 14.5px;
      color: var(--ink);
    }
    small {
      font-size: 12.5px;
      color: var(--violet-45);
    }
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: 11px;
    padding-top: 28px;
  }
}

.day {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px;
  border-radius: var(--radius-card);
  background: var(--paper-raised);
  border: 1px solid var(--hairline);
  filter: var(--drop-md);
  color: var(--ink);

  &--done {
    border-color: var(--rose-ring);
  }

  &--locked {
    opacity: 0.55;
    cursor: default;

    .day__badge {
      background: var(--fill-subtle);
      color: var(--violet-45);
    }
  }

  &__badge {
    width: 42px;
    height: 42px;
    border-radius: 14px;
    background: var(--rose-soft);
    color: var(--rose);
    display: grid;
    place-items: center;
    flex-shrink: 0;
    font-family: var(--font-data);
    font-size: 12px;
    font-weight: 700;
  }

  &__text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__title {
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 15.5px;
    letter-spacing: -0.2325px;
    color: var(--ink);
  }

  &__meta {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-top: 3px;
    font-size: 12.5px;
    color: var(--violet-28);
  }

  &__logged {
    flex-shrink: 0;
    padding: 2px 6px;
    border-radius: 12px;
    background: var(--orange-soft);
    color: var(--orange-text);
    font-size: 8px;
    font-weight: 500;

    &--soon {
      background: var(--fill-subtle);
      color: var(--violet-45);
    }
  }

  &__chev {
    color: var(--violet-45);
    flex-shrink: 0;
  }
}

// Desktop: the day list becomes a two-column board so a whole training week is
// visible without scrolling.
@media (min-width: 1024px) {
  .picker {
    padding: 0;

    &__list {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
      padding-top: 24px;
    }

    &__resume {
      margin-top: 24px;
    }
  }

  .day,
  .picker__resume {
    transition:
      transform 0.15s ease,
      box-shadow 0.15s ease;

    &:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-raised);
    }
  }

  // Nothing to open, so nothing should lift under the pointer.
  .day--locked:hover {
    transform: none;
    box-shadow: none;
  }
}
</style>
