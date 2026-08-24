<script setup lang="ts">
import type { WorkoutDay } from '~/data/types'

/**
 * A locked dot is not a link.
 *
 * Today's session is already logged, so there is nowhere for it to go; leaving
 * it tappable only produces a screen that bounces straight back.
 */
const NuxtLinkComponent = resolveComponent('NuxtLink')
const dotTag = (day: WorkoutDay) => (day.status === 'locked' ? 'div' : NuxtLinkComponent)

/**
 * Once today is logged every remaining day is locked, so a padlock on each of
 * them is four padlocks and no information. Only the one that opens next wears
 * it; the rest keep their number.
 */
const props = defineProps<{ days: WorkoutDay[] }>()
const nextUpId = computed(() => props.days.find((d) => d.status === 'locked')?.id)
</script>

<template>
  <div class="flex gap-2">
    <component
      :is="dotTag(day)"
      v-for="day in days"
      :key="day.id"
      :to="day.status === 'locked' ? undefined : `/train/${day.id}`"
      class="flex min-w-0 flex-1 flex-col items-center gap-2"
    >
      <span
        class="relative grid aspect-square size-13.5 max-w-full place-items-center rounded-pill"
        :class="{
          'bg-rose-fill text-on-rose': day.status === 'completed',
          'bg-rose-softer text-rose shadow-[0_0_0_1.5px_var(--rose-ring)]':
            day.status === 'today',
          'bg-sunken text-muted':
            day.status !== 'completed' && day.status !== 'today',
        }"
      >
        <!-- The design rings today's dot; the pulse is what makes it read as "now". -->
        <span
          v-if="day.status === 'today'"
          class="pointer-events-none absolute inset-0 rounded-[inherit] border-[1.5px] border-rose animate-day-ping motion-reduce:animate-none motion-reduce:opacity-50"
          aria-hidden="true"
        />

        <AppIcon v-if="day.status === 'completed'" name="check" :size="17" />
        <AppIcon v-else-if="day.status === 'today'" name="train" :size="22" />
        <AppIcon v-else-if="day.id === nextUpId" name="lock" :size="16" />
        <span v-else class="data text-[13px] tracking-[-0.13px]">
          {{ day.dayNumber }}
        </span>
      </span>

      <span
        class="font-data text-[9px] uppercase"
        :class="day.status === 'today' ? 'text-rose' : 'text-muted'"
      >
        {{
          day.status === 'today'
            ? 'Today'
            : day.id === nextUpId
              ? 'Tomorrow'
              : `Day ${day.dayNumber}`
        }}
      </span>
    </component>
  </div>
</template>
