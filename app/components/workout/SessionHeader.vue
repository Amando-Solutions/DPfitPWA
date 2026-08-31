<script setup lang="ts">
import { formatVolume, unitLabel } from '~/lib/domain/nutrition'
import type { Units } from '~/data/types'

const props = withDefaults(
  defineProps<{
    title: string
    duration: string
    /** Always kilograms; the display unit is `unit`. */
    volume: number
    setsDone: number
    setsTotal: number
    /** Label for the right-hand button. Omitted, and no button is drawn. */
    action?: string
    unit?: Units
  }>(),
  { unit: 'kg' },
)

const emit = defineEmits<{ (e: 'action'): void }>()

const volumeLabel = computed(
  () => `${formatVolume(props.volume, props.unit)} ${unitLabel(props.unit)}`,
)

/*
  One accent, and it is spent on the clock.

  The three stats used to sit in rounded wells with uppercase mono labels, and
  the sets figure was gold — a second accent doing no work except competing with
  the first. Berry now marks exactly one thing here: the elapsed time, the only
  value on the screen that changes on its own. Volume and sets are the member's
  own numbers and read in plain ink.

  Labels are regular weight; the values carry the bold. `tabular-nums` on all
  three so a digit changing width can't shove the row sideways mid-set.
*/
const STAT_LABEL = 'text-[12px] text-on-photo/60'
const STAT_VALUE = 'text-[17px] font-bold tabular-nums'
</script>

<template>
  <!--
    Sticky, so the clock and the finish button stay reachable however far down
    the exercise list you are. It sits inside the scroller on the logging screen
    and above it on the save screen; `sticky` is correct either way.

    The decorative gym photograph that used to wash this panel is gone. It was
    stock imagery of somebody else's gym, and repainting it behind a header that
    now follows the scroll is cost with nothing on the other side of it.
  -->
  <header
    class="sticky top-0 z-20 rounded-b-2xl bg-photo text-on-photo shadow-[0_1px_0_rgba(0,0,0,0.25)]"
  >
    <!-- Desktop: the banner stays full-bleed, its content follows the focus column. -->
    <div
      class="px-5 pt-(--screen-pad-top) pb-4 lg:mx-auto lg:max-w-(--focus-max) lg:px-10 lg:pt-6 lg:pb-5"
    >
      <div class="mb-3.5 flex items-center justify-between gap-3">
        <h1 class="m-0 min-w-0 truncate font-display text-[17px] font-bold lg:text-[20px]">
          {{ title }}
        </h1>
        <!--
          Only drawn when there is something to abandon. Before the first set is
          logged there is no workout yet, so a "Cancel" offering to discard one
          is answering a question nobody asked.
        -->
        <button
          v-if="action"
          class="shrink-0 rounded-pill bg-on-photo/14 px-4 py-2 text-[13px] font-bold text-on-photo transition-opacity duration-100 active:opacity-70"
          @click="emit('action')"
        >
          {{ action }}
        </button>
      </div>

      <div class="grid grid-cols-3 gap-3">
        <div class="flex flex-col gap-0.5">
          <span :class="STAT_LABEL">Duration</span>
          <!-- The one monospace face left on this screen. A clock ticking in a
               proportional font redraws at a different width every second. -->
          <span :class="STAT_VALUE" class="font-data text-rose-on-inverse">
            {{ duration }}
          </span>
        </div>
        <div class="flex flex-col gap-0.5">
          <span :class="STAT_LABEL">Volume</span>
          <span :class="STAT_VALUE">{{ volumeLabel }}</span>
        </div>
        <div class="flex flex-col gap-0.5">
          <span :class="STAT_LABEL">Sets</span>
          <span :class="STAT_VALUE">{{ setsDone }}/{{ setsTotal }}</span>
        </div>
      </div>
    </div>
  </header>
</template>
