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

const CHIP =
  'data rounded-pill bg-on-photo/12 px-2.75 py-1.25 text-[10.5px] tracking-[0.525px]'
</script>

<template>
  <!-- A photographic hero: dark in both themes on purpose, see `--surface-photo`. -->
  <NuxtLink
    :to="`/train/${day.id}`"
    class="relative block min-h-58 overflow-hidden rounded-lg bg-photo text-on-photo lg:min-h-75"
  >
    <div
      class="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1517963879433-6ad2b056d712?w=712&q=70')] bg-cover bg-center opacity-50 mix-blend-luminosity"
    />
    <span
      class="absolute top-0 left-0 bg-black/55 px-1.75 py-0.5 text-[10px] text-on-photo/85"
    >
      Photo by John Arano on Unsplash
    </span>
    <div
      class="absolute inset-0 bg-[radial-gradient(120%_80%_at_100%_0%,var(--rose-ring),transparent_55%),var(--photo-scrim)]"
    />

    <div
      class="relative flex min-h-58 flex-col justify-end p-5 lg:min-h-75 lg:p-6"
    >
      <div class="flex items-center justify-between gap-2.5">
        <span
          class="data rounded-pill bg-on-photo/14 px-2.75 py-1.25 text-[10.5px] tracking-[0.525px]"
        >
          {{ allDone ? 'WEEK COMPLETE' : `TODAY · DAY ${day.dayNumber}` }}
        </span>
        <span class="data text-[11px] text-on-photo/75">
          ~{{ day.estMinutes }} MIN
        </span>
      </div>

      <h2
        class="mt-4 mb-0 font-display text-[25px] leading-[1.1] font-black tracking-[-0.625px] lg:text-[30px]"
      >
        {{ day.label }}
      </h2>

      <div class="mt-3.25 flex flex-wrap gap-1.75">
        <span :class="CHIP">{{ day.exercises.length }} EXERCISES</span>
        <span :class="CHIP">{{ setsPlanned }} SETS</span>
        <span
          class="data rounded-pill bg-orange-soft px-2.75 py-1.25 text-[10.5px] tracking-[0.525px] text-orange"
        >
          ~{{ day.estKcal }} KCAL
        </span>
      </div>

      <span
        class="btn-raised mt-4.5 flex items-center justify-center rounded-pill bg-rose-fill p-3.75 text-[14.5px] font-bold text-on-rose [--btn-face:var(--rose-fill)]"
      >
        {{ allDone ? 'Log an extra session' : 'Start today’s workout' }}
      </span>
    </div>
  </NuxtLink>
</template>
