<script setup lang="ts">
import type { WorkoutDayView } from '~/data/types'

const props = withDefaults(
  defineProps<{
    day: WorkoutDayView
    /** Every session for the week is logged, so the card becomes a well-done. */
    allDone?: boolean
    /** When the next session opens, e.g. "Tuesday 24 Feb". */
    nextLabel?: string
  }>(),
  { allDone: false, nextLabel: '' },
)

const setsPlanned = computed(() =>
  props.day.exercises.reduce((n, e) => n + e.targetSets, 0),
)

/**
 * Why this card is not offering a workout, when it is not.
 *
 *   `null`    the plan has this day open; the card is the usual call to action.
 *   `logged`  it is done, and done today.
 *   `rest`    the plan schedules nothing today, so there is nothing to start.
 *
 * Read off the day rather than passed in as one `locked` flag, which is what
 * this used to take: a rest day and a finished day are both "not now" and they
 * are not the same sentence, and a card that told somebody mid-week "that's the
 * work done" on a scheduled rest day would be congratulating them for nothing.
 */
const shut = computed<'logged' | 'rest' | null>(() => {
  if (props.day.canStart) return null
  // Completed *and* today's slot. On a rest day the card falls back to the next
  // session up, which may well be a day they finished on Monday — reading that
  // as "logged today" would be congratulating them for the wrong morning.
  return props.day.status === 'completed' && props.day.opensInNights === 0
    ? 'logged'
    : 'rest'
})

// Sentence case, because these read as a line of copy rather than a set of
// labels. The only uppercase mono left on Home is the week/phase eyebrow.
const eyebrow = computed(() => {
  if (props.allDone) return 'Week complete'
  if (shut.value === 'logged') return 'Logged today'
  if (shut.value === 'rest') return 'Rest day'
  return `Today · Day ${props.day.dayNumber}`
})

const headline = computed(() => {
  if (props.allDone) return 'Rest up. That’s the week done.'
  if (shut.value === 'logged') return 'Rest up. That’s the work done.'
  if (shut.value === 'rest') return 'Nothing scheduled today.'
  return props.day.label
})

const body = computed(() => {
  // `allDone` first, so the eyebrow and the sentence under it agree. A finished
  // week that happens to land on a rest day was reading "Week complete" over
  // "Nothing scheduled today", which is two different pieces of news.
  if (props.allDone) {
    return 'Every session in the plan is logged. Next week picks up from here.'
  }
  if (shut.value === 'logged') {
    return `One session a day is the plan. Day ${props.day.dayNumber} is waiting for you.`
  }
  if (shut.value === 'rest') {
    return `Day ${props.day.dayNumber} is next. Recovery is part of the block, not a gap in it.`
  }
  return ''
})

const cta = computed(() =>
  shut.value
    ? props.nextLabel
      ? `Next session ${props.nextLabel}`
      : 'Back soon'
    : 'Start today’s workout',
)
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
  <NuxtLink
    :to="`/train/${day.id}`"
    class="relative block min-h-52 overflow-hidden rounded-lg bg-photo text-on-photo lg:min-h-64"
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
      class="relative flex min-h-52 flex-col justify-end p-5 lg:min-h-64 lg:p-6"
    >
      <div class="flex items-center justify-between gap-2.5 text-[12px] text-on-photo/75">
        <span>{{ eyebrow }}</span>
        <span>{{ day.estimatedMinutes }} min</span>
      </div>

      <h2
        class="mt-4 mb-0 font-display text-[25px] leading-[1.1] font-black tracking-[-0.625px] lg:text-[30px]"
      >
        {{ headline }}
      </h2>

      <!-- One plain line rather than three chips. The calorie estimate that used
           to sit here was a guess presented with the same weight as two counts
           the plan actually knows, so it is gone rather than quietly wrong. -->
      <p v-if="!body" class="mt-2 mb-0 text-[13.5px] text-on-photo/80">
        {{ day.exercises.length }} exercises · {{ setsPlanned }} sets
      </p>
      <p v-else class="mt-3.25 mb-0 max-w-80 text-[13.5px] leading-[1.45] text-on-photo/80">
        {{ body }}
      </p>

      <!-- Flat fill: no raised stack, no coloured halo. -->
      <span
        class="mt-4.5 flex items-center justify-center rounded-pill p-3.75 text-[14.5px] font-bold"
        :class="shut ? 'bg-on-photo/14 text-on-photo/85' : 'bg-rose-fill text-on-rose'"
      >
        {{ cta }}
      </span>
    </div>
  </NuxtLink>
</template>
