<script setup lang="ts">
// 12 · Train · Day Picker
definePageMeta({ layout: 'app' })

const store = useAppStore()

const setsFor = (exercises: { targetSets: number }[]) =>
  exercises.reduce((n, e) => n + e.targetSets, 0)

const resumable = computed(() => store.activeSession.value)
</script>

<template>
  <div class="picker">
    <ScreenIntro
      :eyebrow="`Week ${store.clock.value.week} · log workout`"
      title="Pick today's session"
      subtitle="Tap a day to start logging sets."
    />

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
      <NuxtLink
        v-for="day in store.days.value"
        :key="day.id"
        :to="`/train/${day.id}`"
        class="day"
        :class="{ 'day--done': day.status === 'completed' }"
      >
        <span class="day__badge">
          <AppIcon v-if="day.status === 'completed'" name="check" :size="16" />
          <span v-else class="data">D{{ day.dayNumber }}</span>
        </span>

        <span class="day__text">
          <span class="day__title">Day {{ day.dayNumber }} — {{ day.label }}</span>
          <span class="day__meta">
            <span>{{ day.exercises.length }} exercises · {{ setsFor(day.exercises) }} sets</span>
            <span v-if="day.status === 'completed'" class="day__logged">Logged</span>
          </span>
        </span>

        <AppIcon name="chevronRight" :size="16" class="day__chev" />
      </NuxtLink>
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
    background: var(--ink);
    color: var(--paper-raised);
    box-shadow: var(--shadow-hero);
  }

  &__resume-icon {
    width: 38px;
    height: 38px;
    border-radius: 14px;
    background: var(--rose);
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
      color: rgba(251, 246, 242, 0.65);
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
  border: 1px solid rgba(36, 27, 46, 0.09);
  filter: drop-shadow(0 4px 7px rgba(36, 27, 46, 0.04));
  color: var(--ink);

  &--done {
    border-color: rgba(200, 30, 92, 0.28);
  }

  &__badge {
    width: 42px;
    height: 42px;
    border-radius: 14px;
    background: rgba(200, 30, 92, 0.1);
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
    color: var(--black);
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
    background: rgba(232, 163, 61, 0.2);
    color: var(--orange);
    font-size: 8px;
    font-weight: 500;
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
}
</style>
