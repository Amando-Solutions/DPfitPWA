<script setup lang="ts">
import type { WorkoutDay } from '~/data/types'

defineProps<{ days: WorkoutDay[] }>()
</script>

<template>
  <div class="day-dots">
    <NuxtLink
      v-for="day in days"
      :key="day.id"
      :to="`/train/${day.id}`"
      class="day-dots__item"
    >
      <span
        class="day-dots__dot"
        :class="{
          'day-dots__dot--done': day.status === 'completed',
          'day-dots__dot--today': day.status === 'today',
        }"
      >
        <span v-if="day.status === 'today'" class="day-dots__ping" aria-hidden="true" />
        <AppIcon v-if="day.status === 'completed'" name="check" :size="17" />
        <AppIcon v-else-if="day.status === 'today'" name="train" :size="22" />
        <span v-else class="day-dots__n data">{{ day.dayNumber }}</span>
      </span>
      <span
        class="day-dots__label"
        :class="{ 'day-dots__label--today': day.status === 'today' }"
      >
        {{ day.status === 'today' ? 'Today' : `Day ${day.dayNumber}` }}
      </span>
    </NuxtLink>
  </div>
</template>

<style scoped lang="scss">
.day-dots {
  display: flex;
  gap: 8px;

  &__item {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  &__dot {
    position: relative;
    width: 54px;
    height: 54px;
    max-width: 100%;
    aspect-ratio: 1;
    border-radius: var(--radius-pill);
    background: var(--paper);
    color: var(--violet-45);
    display: grid;
    place-items: center;

    &--done {
      background: var(--rose);
      color: var(--paper-raised);
    }

    &--today {
      background: rgba(200, 30, 92, 0.09);
      color: var(--rose);
      box-shadow: 0 0 0 1.5px rgba(200, 30, 92, 0.25);
    }
  }

  // The design rings today's dot; the pulse is what makes it read as "now".
  &__ping {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    border: 1.5px solid var(--rose);
    animation: day-dot-ping 1.9s cubic-bezier(0, 0, 0.2, 1) infinite;
    pointer-events: none;
  }

  &__n {
    font-size: 13px;
    letter-spacing: -0.13px;
    color: var(--violet-45);
  }

  &__label {
    font-family: var(--font-data);
    text-transform: uppercase;
    font-size: 9px;
    color: var(--violet-45);

    &--today {
      color: var(--rose);
    }
  }
}

@keyframes day-dot-ping {
  0% {
    transform: scale(1);
    opacity: 0.75;
  }
  70%,
  100% {
    // 54px dot out to the ~73px ring the design draws around it.
    transform: scale(1.35);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .day-dots__ping {
    animation: none;
    opacity: 0.5;
  }
}
</style>
