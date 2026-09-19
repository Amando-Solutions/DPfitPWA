<script setup lang="ts">
import type { Platform } from '~/lib/platform'

/*
  The bar across the top of a screen that sits under another one: Back, a
  title, and room for one action. Laid out the way the device lays out its own.

  · iOS: a 44px navigation bar with the title centred however wide the two
    sides are. The middle column takes the title at its natural width first
    and gives way only once Back and the action have what they need, so a long
    exercise name truncates rather than shoving Back off the bar.
  · Android: Material's small top app bar. 64px, the arrow, and the title
    left-aligned beside it.
  · Desktop: the round button either side of a centred title, as it was.
*/
withDefaults(
  defineProps<{
    title?: string
    back?: boolean
    /** Where Back goes with no history behind it. See `useBackNavigation`. */
    fallback?: string | false
    action?: string // icon name for a right-side action
  }>(),
  { back: true, fallback: undefined },
)

const emit = defineEmits<{ (e: 'action'): void }>()
const { platform } = usePlatform()

const BAR: Record<Platform, string> = {
  ios: 'grid min-h-11 grid-cols-[1fr_minmax(0,max-content)_1fr] items-center gap-2 px-5 pt-[calc(4px+env(safe-area-inset-top,0px))] pb-1 lg:px-0 lg:pt-1.5',
  android:
    'flex min-h-16 items-center gap-1 px-5 pt-[env(safe-area-inset-top,0px)] lg:px-0 lg:pt-1.5',
  desktop:
    'flex items-center justify-between gap-3 px-5 pt-(--screen-pad-top) pb-3 lg:px-0 lg:pt-1.5',
}

const LEAD: Record<Platform, string> = {
  ios: 'flex min-w-0 justify-start',
  android: 'flex shrink-0',
  desktop: 'flex w-10 shrink-0',
}

const MIDDLE: Record<Platform, string> = {
  ios: 'min-w-0 text-center',
  android: 'min-w-0 flex-1',
  desktop: 'min-w-0 flex-1 text-center',
}

const TITLE: Record<Platform, string> = {
  ios: 'truncate text-[17px]',
  android: 'truncate text-[20px]',
  desktop: 'text-[17px]',
}

const TRAIL: Record<Platform, string> = {
  ios: 'flex min-w-0 justify-end',
  android: 'ml-auto flex shrink-0',
  desktop: 'flex w-10 shrink-0 justify-end',
}

/* Desktop is flat: a subtle fill and the icon, with a small press scale for
   feedback, matching AppButton. The phones use their own bar-button idioms. */
const ACTION: Record<Platform, string> = {
  ios: '-mr-2.5 grid size-11 place-items-center text-primary transition-opacity duration-100 active:opacity-40',
  android:
    '-mr-3 grid size-12 place-items-center rounded-full text-ink transition-colors duration-150 active:bg-fill-subtle',
  desktop:
    'grid size-10 shrink-0 place-items-center rounded-pill bg-fill-subtle text-ink transition-[transform,background-color] duration-100 ease-out active:scale-[0.94] motion-reduce:transition-none motion-reduce:active:scale-100',
}
</script>

<template>
  <header class="shrink-0" :class="BAR[platform]">
    <div :class="LEAD[platform]">
      <BackButton v-if="back" :fallback="fallback" />
    </div>

    <div :class="MIDDLE[platform]">
      <h1
        v-if="title"
        class="m-0 font-display font-black text-ink"
        :class="TITLE[platform]"
      >
        {{ title }}
      </h1>
      <slot name="title" />
    </div>

    <div :class="TRAIL[platform]">
      <button
        v-if="action"
        type="button"
        :class="ACTION[platform]"
        aria-label="Action"
        @click="emit('action')"
      >
        <AppIcon :name="action" :size="22" :stroke="2.2" />
      </button>
    </div>
  </header>
</template>
