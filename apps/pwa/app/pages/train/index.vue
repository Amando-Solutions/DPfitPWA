<script setup lang="ts">
// 12 · Train · Day Picker
definePageMeta({ layout: 'app' })

import { nightsLabel, scheduleDateLabel } from '~/lib/time'

const route = useRoute()
const router = useRouter()
const store = useAppStore()

/**
 * The week the list is showing: the one the calendar is in, unless `?week=`
 * names another the schedule has.
 *
 * In the URL rather than a ref so that closing a day picked from week 4 comes
 * back to week 4, not to whatever week today is. A number the schedule does
 * not have — a stale link, a week the coach took down — falls back to this
 * week rather than to an empty list.
 */
const shownWeek = computed(() => {
  const n = Number(route.query.week)
  return store.weeks.value.some((w) => w.weekNumber === n) ? n : store.clock.value.week
})

const onCurrentWeek = computed(() => shownWeek.value === store.clock.value.week)

// `replace`, so flicking through the weeks does not become a trail of history
// entries the back button has to walk through before it leaves the screen.
const showWeek = (n: number) =>
  router.replace({ query: n === store.clock.value.week ? {} : { week: String(n) } })

const shownDays = computed(() => store.weekDays(shownWeek.value))

/** Where a row goes: this week's days by id alone, any other week's by id and week. */
const dayHref = (id: string) =>
  onCurrentWeek.value ? `/train/${id}` : `/train/${id}?week=${shownWeek.value}`

/** One line under the switcher on a week that is not this one, saying where it stands. */
const otherWeekNote = computed(() => {
  if (onCurrentWeek.value) return ''
  const week = store.weeks.value.find((w) => w.weekNumber === shownWeek.value)
  if (!week) return ''
  return shownWeek.value < store.clock.value.week
    ? `Week ${week.weekNumber} is behind you. Anything you didn’t log is still open.`
    : `Week ${week.weekNumber} starts ${scheduleDateLabel(week.startDate)}. Read ahead; nothing logs until then.`
})

const setsFor = (exercises: { targetSets: number }[]) =>
  exercises.reduce((n, e) => n + e.targetSets, 0)

const resumable = computed(() => store.activeSession.value)

/** The half-logged session's own week, so resuming a catch-up opens that week's copy. */
const resumeHref = computed(() => {
  const active = resumable.value
  const week = store.activeSessionWeek.value
  if (!active) return '/train'
  return week !== null && week !== store.clock.value.week
    ? `/train/${active.dayId}?week=${week}`
    : `/train/${active.dayId}`
})

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
    // Said outright, because a list of nothing but "Catch up" otherwise leaves
    // them hunting for which of those days is today.
    return restDay.value
      ? 'No session is scheduled today. A day you missed stays open until you log it; take them in any order.'
      : 'A day you missed stays open until you log it. Take them in any order.'
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

const CHIP_ACCENT = 'bg-primary-soft text-primary'
// Solid rather than a tint: the done green only clears contrast as a fill under
// white, and this chip says "Logged" in words.
const CHIP_DONE = 'bg-success text-on-success'
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
  shownDays.value.map((day) => {
    if (day.status === 'completed') {
      return { day, chip: { text: 'Logged', cls: CHIP_DONE } }
    }
    // A day behind them is open on the same terms as today's, but it is not
    // today's — the chip is what tells them which one they are picking up.
    if (day.canStart) {
      return {
        day,
        chip: { text: day.status === 'today' ? 'Today' : 'Catch up', cls: CHIP_ACCENT },
      }
    }
    return {
      day,
      chip: {
        // A later week's days by date: a list mixing "Monday" with "next
        // Tuesday" for days side by side reads as a mistake.
        text: onCurrentWeek.value
          ? `Opens ${nightsLabel(day.opensInNights ?? 1, store.now.value)}`
          : `Opens ${scheduleDateLabel(day.date)}`,
        cls: CHIP_QUIET,
      },
    }
  }),
)

/**
 * Where today falls in the list, on a day the plan schedules nothing for.
 *
 * A training day carries its own "Today" chip. A rest day has no row to put
 * one on, so without this a week of four "Catch up" rows gives no sign of where
 * in the week they actually are. A marker between the days behind and the days
 * ahead does, in the one place a member reads the schedule from.
 *
 * `null` on any other week, on a day that has its own row, and outside this
 * week's span — before week 1 starts there is no "today" inside it to mark.
 */
const todayMarkerAt = computed(() => {
  const week = store.currentWeek.value
  const today = store.clock.value.today
  if (!onCurrentWeek.value || !week || !rows.value.length) return null
  if (today < week.startDate || today > week.endDate) return null
  if (rows.value.some(({ day }) => day.opensInNights === 0)) return null
  const ahead = rows.value.findIndex(({ day }) => (day.opensInNights ?? 0) > 0)
  return ahead === -1 ? rows.value.length : ahead
})

const todayLabel = computed(() => scheduleDateLabel(store.clock.value.today))

/** The rows with the marker spliced in, so the template walks one list in date order. */
const items = computed(() => {
  const list: ({ kind: 'day' } & (typeof rows.value)[number] | { kind: 'today' })[] =
    rows.value.map((row) => ({ kind: 'day' as const, ...row }))
  if (todayMarkerAt.value !== null) list.splice(todayMarkerAt.value, 0, { kind: 'today' })
  return list
})
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
    <div v-if="store.trainingLocked.value && store.days.value.length" class="picker__locked flex items-center gap-3 mt-5 py-3.5 px-4.5 rounded-card bg-primary-softer border border-primary-ring">
      <span class="picker__locked-icon w-8.5 h-8.5 rounded-pill bg-primary-fill text-on-primary grid place-items-center shrink-0"><AppIcon :name="lockedIcon" :size="16" /></span>
      <span class="picker__locked-text flex flex-col gap-0.5 min-w-0 [&_strong]:font-display [&_strong]:font-black [&_strong]:text-[14.5px] [&_strong]:text-ink [&_small]:text-[12.5px] [&_small]:text-muted">
        <strong>{{ lockedHeading }}</strong>
        <small>{{ lockedNote }}</small>
      </span>
    </div>

    <!-- A workout left half-logged is the first thing they should see. -->
    <NuxtLink v-if="resumable" :to="resumeHref" class="picker__resume flex items-center gap-3 mt-5 py-3.5 px-4.5 rounded-card bg-inverse text-on-inverse shadow-hero lg:mt-6 lg:transition-[translate,box-shadow] lg:duration-150 lg:ease-[ease] lg:hover:-translate-y-0.5 lg:hover:shadow-raised">
      <span class="picker__resume-icon w-9.5 h-9.5 rounded-[14px] bg-primary-fill grid place-items-center shrink-0"><AppIcon name="train" :size="18" /></span>
      <span class="picker__resume-text flex-1 min-w-0 flex flex-col gap-0.5 [&_strong]:font-display [&_strong]:font-black [&_strong]:text-[15px] [&_small]:text-[12.5px] [&_small]:text-on-inverse-soft">
        <strong>Pick up where you left off</strong>
        <small>
          {{ store.getDay(resumable.dayId, store.activeSessionWeek.value ?? undefined)?.label ?? 'Session in progress' }}<template
            v-if="store.activeSessionWeek.value !== store.clock.value.week"
          > · Week {{ store.activeSessionWeek.value }}</template>
        </small>
      </span>
      <AppIcon name="chevronRight" :size="16" />
    </NuxtLink>

    <!--
      Every week of the block, opening on this one.

      Only drawn when there is more than one week to choose between; a block of
      one would be a switch with nothing on the other side. Chips that scroll
      rather than a segmented pill, because the number of weeks is the coach's
      to author and eight segments do not fit across a phone.
    -->
    <nav
      v-if="store.weeks.value.length > 1"
      aria-label="Training weeks"
      class="picker__weeks -mx-5 mt-6 flex gap-2 overflow-x-auto px-5 pb-1 scrollbar-none lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden"
    >
      <button
        v-for="week in store.weeks.value"
        :key="week.id"
        type="button"
        class="relative shrink-0 rounded-pill bg-raised px-3.5 py-2 text-[12.5px] whitespace-nowrap text-muted tabular-nums aria-pressed:bg-inverse aria-pressed:font-semibold aria-pressed:text-on-inverse"
        :aria-pressed="week.weekNumber === shownWeek"
        @click="showWeek(week.weekNumber)"
      >
        Week {{ week.weekNumber }}
        <!-- Marks the calendar's week, so it can be found again from any other. -->
        <span
          v-if="week.weekNumber === store.clock.value.week"
          class="absolute top-1 right-1.5 size-1.5 rounded-pill bg-primary"
          aria-hidden="true"
        />
        <span v-if="week.weekNumber === store.clock.value.week" class="sr-only">(this week)</span>
      </button>
    </nav>

    <p
      v-if="otherWeekNote"
      class="picker__week-note mt-3 mb-0 text-[12.5px] leading-[1.45] text-muted"
    >
      {{ otherWeekNote }}
    </p>

    <div
      class="picker__list flex flex-col gap-2.75 lg:grid lg:grid-cols-2 lg:gap-4"
      :class="store.weeks.value.length > 1 ? 'pt-4' : 'pt-7 lg:pt-6'"
    >
      <!--
        Every row is a link, the closed ones included.

        A day the calendar has not reached is still the coach's plan for
        Thursday, and a member who wants to read what is coming should be able
        to. What a day still ahead withholds is the Start button on the other
        side, not the door — `canStart` is the only thing the session screen
        gates on, and it is only ever false on a day the calendar has not reached.
      -->
      <template v-for="item in items" :key="item.kind === 'day' ? item.day.id : 'today'">
        <!-- Today, on a rest day: see `todayMarkerAt`. Spans both desktop columns
             so it reads as a line across the schedule rather than a short card. -->
        <div
          v-if="item.kind === 'today'"
          class="picker__today flex items-center gap-2.5 py-1 text-[12.5px] lg:col-span-2"
        >
          <span class="size-2 shrink-0 rounded-pill bg-primary" aria-hidden="true" />
          <strong class="font-semibold text-primary">Today</strong>
          <span class="truncate text-muted">{{ todayLabel }} · no session scheduled</span>
          <span class="h-px min-w-4 flex-1 bg-hairline" aria-hidden="true" />
        </div>
        <NuxtLink
          v-else
          :to="dayHref(item.day.id)"
          class="day flex items-center gap-3 p-4.5 rounded-card bg-raised border border-hairline filter-(--drop-md) text-ink [&.day--done]:border-success-ring [&.day--done_.day\_\_badge]:bg-success-soft [&.day--done_.day\_\_badge]:text-success [&.day--shut]:opacity-70 [&.day--shut_.day\_\_badge]:bg-fill-subtle [&.day--shut_.day\_\_badge]:text-muted lg:transition-[translate,box-shadow] lg:duration-150 lg:ease-[ease] lg:hover:-translate-y-0.5 lg:hover:shadow-raised"
          :class="{
            'day--done': item.day.status === 'completed',
            'day--shut': !item.day.canStart && item.day.status !== 'completed',
          }"
        >
          <span class="day__badge w-10.5 h-10.5 rounded-[14px] bg-primary-soft text-primary grid place-items-center shrink-0 text-[13px] font-bold tabular-nums">
            <AppIcon v-if="item.day.status === 'completed'" name="check" :size="16" />
            <AppIcon v-else-if="!item.day.canStart" name="lock" :size="16" />
            <span v-else>D{{ item.day.dayNumber }}</span>
          </span>

          <span class="day__text flex-1 min-w-0 flex flex-col gap-0.5">
            <span class="day__title font-display font-black text-[15.5px] tracking-[-0.2325px] text-ink">Day {{ item.day.dayNumber }}: {{ item.day.label }}</span>
            <span class="day__meta flex items-center gap-2 pt-0.75 text-[12.5px] text-soft">
              <span class="truncate">{{ item.day.exercises.length }} exercises · {{ setsFor(item.day.exercises) }} sets</span>
              <span
                class="day__chip shrink-0 py-0.5 px-1.75 rounded-pill text-[11px]"
                :class="item.chip.cls"
              >
                {{ item.chip.text }}
              </span>
            </span>
          </span>

          <AppIcon name="chevronRight" :size="16" class="day__chev text-muted shrink-0" />
        </NuxtLink>
      </template>
    </div>

    <!--
      No training week authored on the program yet.

      Reachable now that the plan is read rather than compiled in, and worth a
      sentence: an empty list under "Pick today's session" reads as the app
      having failed, when what has actually happened is that nobody has written
      the days into `programs/{id}/weeks/{weekId}/days`.
    -->
    <p
      v-if="!shownDays.length"
      class="picker__empty mt-6 mb-0 rounded-card bg-raised p-4.5 text-[13.5px] leading-[1.5] text-muted"
    >
      Your coach hasn’t published
      {{ onCurrentWeek ? 'this week’s' : `Week ${shownWeek}’s` }} sessions yet.
      They’ll show up here as soon as they do.
    </p>
  </div>
</template>
