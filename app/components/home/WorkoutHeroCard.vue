<script setup lang="ts">
import type { WorkoutDayView } from '~/data/types'

const props = withDefaults(
  defineProps<{
    day: WorkoutDayView
    /** Every session for the week is logged, so the card becomes a well-done. */
    allDone?: boolean
    /** Today's session is already in the log; the next one opens tomorrow. */
    locked?: boolean
    /** When the next session opens, e.g. "Tuesday 24 Feb". */
    nextLabel?: string
  }>(),
  { allDone: false, locked: false, nextLabel: '' },
)

const setsPlanned = computed(() =>
  props.day.exercises.reduce((n, e) => n + e.targetSets, 0),
)

/** Nothing to open while today's session is logged, so the card stops being a link. */
const NuxtLinkComponent = resolveComponent('NuxtLink')
const tag = computed(() => (props.locked ? 'div' : NuxtLinkComponent))

// Sentence case, because these read as a line of copy rather than a set of
// labels. The only uppercase mono left on Home is the week/phase eyebrow.
const eyebrow = computed(() => {
  if (props.locked) return 'Logged today'
  return props.allDone ? 'Week complete' : `Today · Day ${props.day.dayNumber}`
})

const cta = computed(() => {
  if (props.locked) return props.nextLabel ? `Next session ${props.nextLabel}` : 'Back tomorrow'
  return props.allDone ? 'Log an extra session' : 'Start today’s workout'
})
</script>

<template>
  <!--
    A photographic hero: dark in both themes on purpose, see `--surface-photo`.

    The photograph is the workout day's own `heroImage`, authored by the coach
    and served from Cloud Storage, so it changes with the block rather than
    being a design asset baked into the bundle. It carries no visible credit
    because it is the product's own image, not a borrowed one. When a day has no
    art the gradient stands alone, which is a finished card either way — nothing
    below depends on the photograph being there.
  -->
  <component
    :is="tag"
    :to="locked ? undefined : `/train/${day.id}`"
    class="relative block min-h-58 overflow-hidden rounded-lg bg-photo text-on-photo lg:min-h-75"
  >
    <!--
      `mix-blend-luminosity` is what keeps this from reading as stock: the photo
      contributes its light and shade and the brand wash underneath supplies the
      colour, so any image the coach uploads lands in the same palette as the
      rest of the card.
    -->
    <img
      v-if="day.heroImage"
      :src="day.heroImage.downloadUrl"
      alt=""
      aria-hidden="true"
      decoding="async"
      fetchpriority="high"
      class="absolute inset-0 size-full object-cover opacity-55 mix-blend-luminosity"
    />
    <div
      class="absolute inset-0 bg-[var(--photo-floor),radial-gradient(120%_80%_at_100%_0%,var(--rose-ring),transparent_55%),var(--photo-scrim)]"
    />

    <div
      class="relative flex min-h-58 flex-col justify-end p-5 lg:min-h-75 lg:p-6"
    >
      <div class="flex items-center justify-between gap-2.5 text-[12px] text-on-photo/75">
        <span>{{ eyebrow }}</span>
        <span>{{ day.estimatedMinutes }} min</span>
      </div>

      <h2
        class="mt-4 mb-0 font-display text-[25px] leading-[1.1] font-black tracking-[-0.625px] lg:text-[30px]"
      >
        {{ locked ? 'Rest up. That’s the work done.' : day.label }}
      </h2>

      <!-- One plain line rather than three chips. The calorie estimate that used
           to sit here was a guess presented with the same weight as two counts
           the plan actually knows, so it is gone rather than quietly wrong. -->
      <p v-if="!locked" class="mt-2 mb-0 text-[13.5px] text-on-photo/80">
        {{ day.exercises.length }} exercises · {{ setsPlanned }} sets
      </p>
      <p v-else class="mt-3.25 mb-0 max-w-80 text-[13.5px] leading-[1.45] text-on-photo/80">
        One session a day is the plan. Day {{ day.dayNumber }} is waiting for you.
      </p>

      <!-- Flat fill: no raised stack, no coloured halo. -->
      <span
        class="mt-4.5 flex items-center justify-center rounded-pill p-3.75 text-[14.5px] font-bold"
        :class="locked ? 'bg-on-photo/14 text-on-photo/85' : 'bg-rose-fill text-on-rose'"
      >
        {{ cta }}
      </span>
    </div>
  </component>
</template>
