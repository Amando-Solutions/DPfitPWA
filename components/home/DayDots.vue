<script setup lang="ts">
import type { WorkoutDay } from '~/data/types'

defineProps<{ days: WorkoutDay[] }>()
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
        <span v-else class="data text-[13px] tracking-[-0.13px]">
          {{ day.dayNumber }}
        </span>
      </span>

      <span
        class="font-data text-[9px] uppercase"
        :class="day.status === 'today' ? 'text-rose' : 'text-muted'"
      >
        {{ day.status === 'today' ? 'Today' : `Day ${day.dayNumber}` }}
      </span>
    </NuxtLink>
  </div>
</template>
