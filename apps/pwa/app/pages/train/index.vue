<script setup lang="ts">
// 12 · Train · Day Picker
definePageMeta({ layout: 'app' })

import { nightsLabel } from '~/lib/time'

const store = useAppStore()

const setsFor = (exercises: { targetSets: number }[]) =>
  exercises.reduce((n, e) => n + e.targetSets, 0)

const resumable = computed(() => store.activeSession.value)

/** The plan day the calendar opens today, logged or not. `null` on a rest day. */
const scheduledToday = computed(
  () => store.days.value.find((d) => d.opensInNights === 0) ?? null,
)

/** A day the plan schedules nothing for. Not the same as having finished. */
const restDay = computed(() => store.days.value.length > 0 && !scheduledToday.value)

/**
 * The open days the week has already gone past — the ones they owe.
 *
 * What the screen counts, because it is the only part of "what is open" the
 * member did not already know: today's session is on the list either way.
 */
const owed = computed(() =>
  store.days.value.filter((d) => d.canStart && d.status === 'missed'),
)

/** "one session", "2 sessions" — for the sentences that count them. */
const owedCount = computed(() =>
  owed.value.length === 1 ? 'one session' : `${owed.value.length} sessions`,
)

/** "Day 3 opens Thursday", for whichever session they are waiting on. */
const nextUpNote = computed(() => {
  const next = store.nextUp.value
  if (!next) return ''
  return `Day ${next.dayNumber} opens ${nightsLabel(next.opensInNights ?? 1, store.now.value)}.`
})

const title = computed(() => {
  if (!store.trainingLocked.value) {
    if (!owed.value.length) return 'Today’s session'
    if (scheduledToday.value?.canStart) return `Today, plus ${owedCount.value} to catch up`
    return owed.value.length === 1
      ? 'One session to catch up'
      : `${owed.value.length} sessions to catch up`
  }
  if (store.weekComplete.value) return 'Week complete'
  if (store.sessionToday.value) return 'Today is logged'
  return restDay.value ? 'Rest day' : 'Nothing open today'
})

const subtitle = computed(() => {
  if (store.trainingLocked.value) {
    return 'Days open as the week reaches them. Nothing is waiting on you today.'
  }
  if (owed.value.length) {
    return 'A day you missed stays open until you log it. Take them in any order.'
  }
  return 'Your day is open. The ones ahead are there to read, not to log.'
})

/**
 * Why the Start buttons are away, in one line.
 *
 * The banner exists because an inert list is indistinguishable from a broken
 * one. Each branch names the reason and, where there is one, the date it lifts.
 */
const lockedNote = computed(() => {
  if (store.weekComplete.value) return 'Every session this week is logged. Well played.'
  if (store.sessionToday.value) {
    return `Nothing left behind you. ${nextUpNote.value}`
  }
  if (restDay.value) return `No session scheduled today. ${nextUpNote.value}`
  return nextUpNote.value
})

const lockedIcon = computed(() => {
  if (store.sessionToday.value || store.weekComplete.value) return 'check'
  return restDay.value ? 'moon' : 'lock'
})

const lockedHeading = computed(() => {
  if (store.sessionToday.value) return `${store.sessionToday.value.label} is in the log`
  if (store.weekComplete.value) return 'That is the week done'
  return restDay.value ? 'Rest day' : 'Nothing to log today'
})

const CHIP_ACCENT = 'bg-rose-soft text-rose'
const CHIP_QUIET = 'bg-fill-subtle text-muted'

/**
 * The rows, each with the one chip that says where it stands.
 *
 * Every row carries one, so the list reads as a schedule rather than as a menu
 * with some items greyed out: what is done, what is open, and the date each
 * closed day comes round. Resolved here rather than in the template so the
 * branch is read once per day per render instead of once per binding.
 */
const rows = computed(() =>
  store.days.value.map((day) => {
    if (day.status === 'completed') {
      return { day, chip: { text: 'Logged', cls: CHIP_ACCENT } }
    }
    // A day behind them is open on the same terms as today's, but it is not
    // today's — the chip is what tells them which one they are picking up.
    if (day.canStart) {
      return {
        day,
        chip: { text: day.status === 'today' ? 'Open now' : 'Catch up', cls: CHIP_ACCENT },
      }
    }
    return {
      day,
      chip: {
        text: `Opens ${nightsLabel(day.opensInNights ?? 1, store.now.value)}`,
        cls: CHIP_QUIET,
      },
    }
  }),
)
</script>

<template>
  <div class="picker pt-(--screen-pad-top) px-5 pb-0 lg:p-0">
    <ScreenIntro
      :eyebrow="`${store.clock.value.label} · Day ${store.clock.value.dayInWeek}`"
      :title="title"
      :subtitle="subtitle"
    />

    <!-- Says why no row offers to start, so a day without a Start button reads
         as a rule rather than as the screen having failed. -->
    <div v-if="store.trainingLocked.value && store.days.value.length" class="picker__locked flex items-center gap-3 mt-5 py-3.5 px-4.5 rounded-card bg-rose-softer border border-rose-ring">
      <span class="picker__locked-icon w-8.5 h-8.5 rounded-pill bg-rose-fill text-on-rose grid place-items-center shrink-0"><AppIcon :name="lockedIcon" :size="16" /></span>
      <span class="picker__locked-text flex flex-col gap-0.5 min-w-0 [&_strong]:font-display [&_strong]:font-black [&_strong]:text-[14.5px] [&_strong]:text-ink [&_small]:text-[12.5px] [&_small]:text-muted">
        <strong>{{ lockedHeading }}</strong>
        <small>{{ lockedNote }}</small>
      </span>
    </div>

    <!-- A workout left half-logged is the first thing they should see. -->
    <NuxtLink v-if="resumable" :to="`/train/${resumable.dayId}`" class="picker__resume flex items-center gap-3 mt-5 py-3.5 px-4.5 rounded-card bg-inverse text-on-inverse shadow-hero lg:mt-6 lg:transition-[translate,box-shadow] lg:duration-150 lg:ease-[ease] lg:hover:-translate-y-0.5 lg:hover:shadow-raised">
      <span class="picker__resume-icon w-9.5 h-9.5 rounded-[14px] bg-rose-fill grid place-items-center shrink-0"><AppIcon name="train" :size="18" /></span>
      <span class="picker__resume-text flex-1 min-w-0 flex flex-col gap-0.5 [&_strong]:font-display [&_strong]:font-black [&_strong]:text-[15px] [&_small]:text-[12.5px] [&_small]:text-on-inverse-soft">
        <strong>Pick up where you left off</strong>
        <small>{{ store.getDay(resumable.dayId)?.label ?? 'Session in progress' }}</small>
      </span>
      <AppIcon name="chevronRight" :size="16" />
    </NuxtLink>

    <div class="picker__list flex flex-col gap-2.75 pt-7 lg:grid lg:grid-cols-2 lg:gap-4 lg:pt-6">
      <!--
        Every row is a link, the closed ones included.

        A day the calendar has not reached is still the coach's plan for
        Thursday, and a member who wants to read what is coming should be able
        to. What a day still ahead withholds is the Start button on the other
        side, not the door — `canStart` is the only thing the session screen
        gates on, and it is only ever false on a day the week has not reached.
      -->
      <NuxtLink
        v-for="{ day, chip } in rows"
        :key="day.id"
        :to="`/train/${day.id}`"
        class="day flex items-center gap-3 p-4.5 rounded-card bg-raised border border-hairline filter-(--drop-md) text-ink [&.day--done]:border-rose-ring [&.day--shut]:opacity-70 [&.day--shut_.day__badge]:bg-fill-subtle [&.day--shut_.day__badge]:text-muted lg:transition-[translate,box-shadow] lg:duration-150 lg:ease-[ease] lg:hover:-translate-y-0.5 lg:hover:shadow-raised"
        :class="{
          'day--done': day.status === 'completed',
          'day--shut': !day.canStart && day.status !== 'completed',
        }"
      >
        <span class="day__badge w-10.5 h-10.5 rounded-[14px] bg-rose-soft text-rose grid place-items-center shrink-0 text-[13px] font-bold tabular-nums">
          <AppIcon v-if="day.status === 'completed'" name="check" :size="16" />
          <AppIcon v-else-if="!day.canStart" name="lock" :size="16" />
          <span v-else>D{{ day.dayNumber }}</span>
        </span>

        <span class="day__text flex-1 min-w-0 flex flex-col gap-0.5">
          <span class="day__title font-display font-black text-[15.5px] tracking-[-0.2325px] text-ink">Day {{ day.dayNumber }}: {{ day.label }}</span>
          <span class="day__meta flex items-center gap-2 pt-0.75 text-[12.5px] text-soft">
            <span class="truncate">{{ day.exercises.length }} exercises · {{ setsFor(day.exercises) }} sets</span>
            <span
              class="day__chip shrink-0 py-0.5 px-1.75 rounded-pill text-[11px]"
              :class="chip.cls"
            >
              {{ chip.text }}
            </span>
          </span>
        </span>

        <AppIcon name="chevronRight" :size="16" class="day__chev text-muted shrink-0" />
      </NuxtLink>
    </div>

    <!--
      No training week authored on the program yet.

      Reachable now that the plan is read rather than compiled in, and worth a
      sentence: an empty list under "Pick today's session" reads as the app
      having failed, when what has actually happened is that nobody has written
      the days into `programs/{id}/workoutDays`.
    -->
    <p
      v-if="!store.days.value.length"
      class="picker__empty mt-6 mb-0 rounded-card bg-raised p-4.5 text-[13.5px] leading-[1.5] text-muted"
    >
      Your coach hasn’t published this week’s sessions yet. They’ll show up here
      as soon as they do.
    </p>
  </div>
</template>
