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
  <div class="picker [padding:var(--screen-pad-top)_20px_0] lg:[padding:0]">
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
    <div v-if="store.trainingLocked.value" class="picker__locked [display:flex] [align-items:center] [gap:12px] [margin-top:20px] [padding:14px_18px] [border-radius:var(--radius-card)] [background:var(--rose-softer)] [border:1px_solid_var(--rose-ring)]">
      <span class="picker__locked-icon [width:34px] [height:34px] [border-radius:var(--radius-pill)] [background:var(--rose-fill)] [color:var(--on-rose)] [display:grid] [place-items:center] [flex-shrink:0]"><AppIcon name="check" :size="16" /></span>
      <span class="picker__locked-text [display:flex] [flex-direction:column] [gap:2px] [min-width:0] [&_strong]:[font-family:var(--font-display)] [&_strong]:[font-weight:900] [&_strong]:[font-size:14.5px] [&_strong]:[color:var(--ink)] [&_small]:[font-size:12.5px] [&_small]:[color:var(--violet-45)]">
        <strong>{{ store.sessionToday.value?.label }} is in the log</strong>
        <small>{{ lockedNote }}</small>
      </span>
    </div>

    <!-- A workout left half-logged is the first thing they should see. -->
    <NuxtLink v-if="resumable" :to="`/train/${resumable.dayId}`" class="picker__resume [display:flex] [align-items:center] [gap:12px] [margin-top:20px] [padding:14px_18px] [border-radius:var(--radius-card)] [background:var(--surface-inverse)] [color:var(--on-inverse)] [box-shadow:var(--shadow-hero)] lg:[margin-top:24px] lg:[transition:transform_0.15s_ease,_box-shadow_0.15s_ease] lg:hover:[transform:translateY(-2px)] lg:hover:[box-shadow:var(--shadow-raised)]">
      <span class="picker__resume-icon [width:38px] [height:38px] [border-radius:14px] [background:var(--rose-fill)] [display:grid] [place-items:center] [flex-shrink:0]"><AppIcon name="train" :size="18" /></span>
      <span class="picker__resume-text [flex:1] [min-width:0] [display:flex] [flex-direction:column] [gap:2px] [&_strong]:[font-family:var(--font-display)] [&_strong]:[font-weight:900] [&_strong]:[font-size:15px] [&_small]:[font-size:12.5px] [&_small]:[color:var(--on-inverse-soft)]">
        <strong>Pick up where you left off</strong>
        <small>{{ store.getDay(resumable.dayId)?.label ?? 'Session in progress' }}</small>
      </span>
      <AppIcon name="chevronRight" :size="16" />
    </NuxtLink>

    <div class="picker__list [display:flex] [flex-direction:column] [gap:11px] [padding-top:28px] lg:[display:grid] lg:[grid-template-columns:repeat(2,_minmax(0,_1fr))] lg:[gap:16px] lg:[padding-top:24px]">
      <component
        :is="rowTag(day)"
        v-for="day in store.days.value"
        :key="day.id"
        :to="day.status === 'locked' ? undefined : `/train/${day.id}`"
        class="day [display:flex] [align-items:center] [gap:12px] [padding:18px] [border-radius:var(--radius-card)] [background:var(--paper-raised)] [border:1px_solid_var(--hairline)] [filter:var(--drop-md)] [color:var(--ink)] [&.day--done]:[border-color:var(--rose-ring)] [&.day--locked]:[opacity:0.55] [&.day--locked]:[cursor:default] [&.day--locked_.day__badge]:[background:var(--fill-subtle)] [&.day--locked_.day__badge]:[color:var(--violet-45)] lg:[transition:transform_0.15s_ease,_box-shadow_0.15s_ease] lg:hover:[transform:translateY(-2px)] lg:hover:[box-shadow:var(--shadow-raised)] lg:[&.day--locked:hover]:[transform:none] lg:[&.day--locked:hover]:[box-shadow:none]"
        :class="{
          'day--done': day.status === 'completed',
          'day--locked': day.status === 'locked',
        }"
      >
        <span class="day__badge [width:42px] [height:42px] [border-radius:14px] [background:var(--rose-soft)] [color:var(--rose)] [display:grid] [place-items:center] [flex-shrink:0] [font-family:var(--font-data)] [font-size:12px] [font-weight:700]">
          <AppIcon v-if="day.status === 'completed'" name="check" :size="16" />
          <AppIcon v-else-if="day.status === 'locked'" name="lock" :size="16" />
          <span v-else class="data">D{{ day.dayNumber }}</span>
        </span>

        <span class="day__text [flex:1] [min-width:0] [display:flex] [flex-direction:column] [gap:2px]">
          <span class="day__title [font-family:var(--font-display)] [font-weight:900] [font-size:15.5px] [letter-spacing:-0.2325px] [color:var(--ink)]">Day {{ day.dayNumber }}: {{ day.label }}</span>
          <span class="day__meta [display:flex] [align-items:center] [gap:8px] [padding-top:3px] [font-size:12.5px] [color:var(--violet-28)]">
            <span>{{ day.exercises.length }} exercises · {{ setsFor(day.exercises) }} sets</span>
            <span v-if="day.status === 'completed'" class="day__logged [flex-shrink:0] [padding:2px_6px] [border-radius:12px] [background:var(--orange-soft)] [color:var(--orange-text)] [font-size:8px] [font-weight:500]">Logged</span>
            <span
              v-else-if="day.id === nextUpId"
              class="day__logged day__logged--soon [flex-shrink:0] [padding:2px_6px] [border-radius:12px] [background:var(--orange-soft)] [color:var(--orange-text)] [font-size:8px] [font-weight:500] [background:var(--fill-subtle)] [color:var(--violet-45)]"
            >
              Tomorrow
            </span>
          </span>
        </span>

        <AppIcon
          v-if="day.status !== 'locked'"
          name="chevronRight"
          :size="16"
          class="day__chev [color:var(--violet-45)] [flex-shrink:0]"
        />
      </component>
    </div>
  </div>
</template>
