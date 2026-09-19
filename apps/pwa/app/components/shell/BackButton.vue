<script setup lang="ts">
import { registerBackHandler } from '~/lib/navigation'
import type { Platform } from '~/lib/platform'

/*
  The one Back button, drawn the way the device draws its own.

  · iOS: the chevron and the name of where it goes ("‹ Train"), in the accent,
    dimming on press the way UIKit's bar buttons do.
  · Android: Material's arrow in a 48px round target, with a pressed state
    layer rather than a scale.
  · Desktop: the app's own round button, unchanged. A website with an iOS
    chevron in it reads as a website pretending.

  All three go through `useBackNavigation`, so a deep link gets the screen above
  rather than a trip out of the app. The iOS edge swipe goes through here too:
  it is offered wherever this button is, and nowhere else, and not while the
  button is disabled.
*/
const props = withDefaults(
  defineProps<{
    /** Where Back goes with no history behind it. See `useBackNavigation`. */
    fallback?: string | false
    /** Name the destination beside the chevron on iOS. Off where a row is tight. */
    label?: boolean
    /** `photo` for the light-on-image session headers. */
    tone?: 'default' | 'photo'
    /** A write is in flight. Back, and the swipe, wait for it. */
    disabled?: boolean
  }>(),
  { fallback: undefined, label: true, tone: 'default', disabled: false },
)

const { platform } = usePlatform()
const { canGoBack, label: destination, goBack } = useBackNavigation(() => props.fallback)

let unregister: (() => void) | undefined
onMounted(() => {
  unregister = registerBackHandler({
    go: goBack,
    enabled: () => canGoBack.value && !props.disabled,
  })
})
onBeforeUnmount(() => unregister?.())

/** "Back to Train" says where it goes; the visible "Train" is part of it. */
const ariaLabel = computed(() =>
  destination.value === 'Back' ? 'Back' : `Back to ${destination.value}`,
)

const SHAPE: Record<Platform, string> = {
  ios: '-ml-2.5 flex h-11 min-w-11 max-w-[45vw] items-center gap-px pr-1 text-[17px] transition-opacity duration-100 active:opacity-40 disabled:opacity-35',
  android:
    '-ml-3 grid size-12 shrink-0 place-items-center rounded-full transition-colors duration-150 disabled:opacity-40',
  desktop:
    'grid size-10 shrink-0 place-items-center rounded-pill transition-[transform,background-color] duration-100 ease-out active:scale-[0.94] disabled:opacity-45 motion-reduce:transition-none motion-reduce:active:scale-100',
}

const TONE: Record<'default' | 'photo', Record<Platform, string>> = {
  default: {
    ios: 'text-primary',
    android: 'text-ink active:bg-fill-subtle',
    desktop: 'bg-fill-subtle text-ink',
  },
  photo: {
    ios: 'text-on-photo',
    android: 'text-on-photo active:bg-on-photo/14',
    desktop: 'bg-on-photo/14 text-on-photo',
  },
}
</script>

<template>
  <button
    v-if="canGoBack"
    type="button"
    :class="[SHAPE[platform], TONE[tone][platform]]"
    :aria-label="ariaLabel"
    :disabled="disabled"
    @click="goBack()"
  >
    <template v-if="platform === 'ios'">
      <AppIcon name="chevronLeft" :size="28" :stroke="2.4" />
      <span v-if="label" class="min-w-0 truncate">{{ destination }}</span>
    </template>
    <AppIcon v-else-if="platform === 'android'" name="arrowLeft" :size="24" :stroke="2" />
    <AppIcon v-else name="arrowLeft" :size="22" :stroke="2.2" />
  </button>
</template>
