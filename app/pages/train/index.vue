<script setup lang="ts">
// 12 · Train · Day Picker
definePageMeta({ layout: 'app' })

import type { WorkoutDayView } from '~/data/types'

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
const rowTag = (day: WorkoutDayView) =>
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
  <div class="picker pt-(--screen-pad-top) px-5 pb-0 lg:p-0">
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
    <div v-if="store.trainingLocked.value" class="picker__locked flex items-center gap-3 mt-5 py-3.5 px-4.5 rounded-card bg-rose-softer border border-rose-ring">
      <span class="picker__locked-icon w-8.5 h-8.5 rounded-pill bg-rose-fill text-on-rose grid place-items-center shrink-0"><AppIcon name="check" :size="16" /></span>
      <span class="picker__locked-text flex flex-col gap-0.5 min-w-0 [&_strong]:font-display [&_strong]:font-black [&_strong]:text-[14.5px] [&_strong]:text-ink [&_small]:text-[12.5px] [&_small]:text-muted">
        <strong>{{ store.sessionToday.value?.label }} is in the log</strong>
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
      <component
        :is="rowTag(day)"
        v-for="day in store.days.value"
        :key="day.id"
        :to="day.status === 'locked' ? undefined : `/train/${day.id}`"
        class="day flex items-center gap-3 p-4.5 rounded-card bg-raised border border-hairline filter-(--drop-md) text-ink [&.day--done]:border-rose-ring [&.day--locked]:opacity-55 [&.day--locked]:cursor-default [&.day--locked_.day__badge]:bg-fill-subtle [&.day--locked_.day__badge]:text-muted lg:transition-[translate,box-shadow] lg:duration-150 lg:ease-[ease] lg:hover:-translate-y-0.5 lg:hover:shadow-raised lg:[&.day--locked:hover]:translate-none lg:[&.day--locked:hover]:shadow-none"
        :class="{
          'day--done': day.status === 'completed',
          'day--locked': day.status === 'locked',
        }"
      >
        <span class="day__badge w-10.5 h-10.5 rounded-[14px] bg-rose-soft text-rose grid place-items-center shrink-0 text-[13px] font-bold tabular-nums">
          <AppIcon v-if="day.status === 'completed'" name="check" :size="16" />
          <AppIcon v-else-if="day.status === 'locked'" name="lock" :size="16" />
          <span v-else>D{{ day.dayNumber }}</span>
        </span>

        <span class="day__text flex-1 min-w-0 flex flex-col gap-0.5">
          <span class="day__title font-display font-black text-[15.5px] tracking-[-0.2325px] text-ink">Day {{ day.dayNumber }}: {{ day.label }}</span>
          <span class="day__meta flex items-center gap-2 pt-0.75 text-[12.5px] text-soft">
            <span>{{ day.exercises.length }} exercises · {{ setsFor(day.exercises) }} sets</span>
            <span v-if="day.status === 'completed'" class="day__logged shrink-0 py-0.5 px-1.75 rounded-pill bg-rose-soft text-rose text-[11px]">Logged</span>
            <span
              v-else-if="day.id === nextUpId"
              class="day__logged day__logged--soon shrink-0 py-0.5 px-1.75 rounded-pill bg-fill-subtle text-muted text-[11px]"
            >
              Tomorrow
            </span>
          </span>
        </span>

        <AppIcon
          v-if="day.status !== 'locked'"
          name="chevronRight"
          :size="16"
          class="day__chev text-muted shrink-0"
        />
      </component>
    </div>
  </div>
</template>
