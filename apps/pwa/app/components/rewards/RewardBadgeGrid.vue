<script setup lang="ts">
import type { BadgeDef } from '~/data/types'

/*
  Badges as tiles rather than full-width rows.

  Seven badges as stacked rows made Rewards a screen you scrolled through
  rather than looked at, and each row spent most of its width on empty space to
  the right of a two-line description. Two columns puts the whole set in view at
  once, which is the point of a badge sheet: you are meant to see what is left,
  not read down a list.
*/
defineProps<{
  badges: (BadgeDef & { earned: boolean; points: number })[]
}>()
</script>

<template>
  <div class="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
    <article
      v-for="badge in badges"
      :key="badge.id"
      class="flex flex-col gap-1.5 rounded-card border bg-raised p-3.5"
      :class="badge.earned ? 'border-rose-ring opacity-100' : 'border-hairline opacity-65'"
    >
      <div class="flex items-start justify-between gap-2">
        <span class="text-[24px] leading-none">{{ badge.emoji }}</span>
        <span
          v-if="badge.earned"
          class="shrink-0 rounded-pill bg-rose-soft px-2 py-0.75 text-[10.5px] text-rose"
        >
          Earned
        </span>
        <span
          v-else
          class="inline-flex shrink-0 items-center gap-1 text-[11.5px] text-muted tabular-nums"
        >
          +{{ badge.points }}
          <AppIcon name="lock" :size="12" />
        </span>
      </div>

      <h3 class="m-0 font-display text-[14px] font-black text-ink">{{ badge.name }}</h3>
      <p class="m-0 text-[12px] leading-[1.4] text-muted">{{ badge.description }}</p>
    </article>
  </div>
</template>
