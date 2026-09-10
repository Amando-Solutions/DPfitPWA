<script setup lang="ts">
import type { WorkoutDayView } from '~/data/types'

/**
 * Every dot is a link, and every day the plan has not opened wears a padlock.
 *
 * The padlock says the Start button is not there yet; it does not say the day
 * is a secret. Tapping through to read Thursday's session on Tuesday is a
 * reasonable thing to want, and the session screen is the place that explains
 * why it cannot be logged, with the date it opens.
 *
 * The lock used to sit on only the next day up, which left the rest looking
 * like ordinary days you could log — the one thing they are not. The caption is
 * what keeps them apart: today's day says so, the rest keep their number.
 */
defineProps<{ days: WorkoutDayView[] }>()
</script>

<template>
  <div class="flex gap-2">
    <NuxtLink
      v-for="day in days"
      :key="day.id"
      :to="`/train/${day.id}`"
      class="flex min-w-0 flex-1 flex-col items-center gap-2"
    >
      <span
        class="relative grid aspect-square size-13.5 max-w-full place-items-center rounded-pill"
        :class="{
          'bg-rose-fill text-on-rose': day.status === 'completed',
          'bg-rose-softer text-rose shadow-[0_0_0_1.5px_var(--rose-ring)]': day.canStart,
          'bg-sunken text-muted': day.status !== 'completed' && !day.canStart,
        }"
      >
        <!-- The design rings the open dot; the pulse is what makes it read as "now". -->
        <span
          v-if="day.canStart"
          class="pointer-events-none absolute inset-0 rounded-[inherit] border-[1.5px] border-rose animate-day-ping motion-reduce:animate-none motion-reduce:opacity-50"
          aria-hidden="true"
        />

        <AppIcon v-if="day.status === 'completed'" name="check" :size="17" />
        <AppIcon v-else-if="day.canStart" name="train" :size="22" />
        <AppIcon v-else name="lock" :size="16" />
      </span>

      <span
        class="text-[11px]"
        :class="day.status === 'today' ? 'text-rose' : 'text-muted'"
      >
        {{ day.status === 'today' ? 'Today' : `Day ${day.dayNumber}` }}
      </span>
    </NuxtLink>
  </div>
</template>
