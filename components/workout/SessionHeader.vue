<script setup lang="ts">
import type { Units } from '~/data/types'
import { formatVolume, unitLabel } from '~/lib/domain/nutrition'

const props = withDefaults(
  defineProps<{
    eyebrow: string
    title: string
    duration: string
    /** Always kilograms; the display unit is `unit`. */
    volume: number
    setsDone: number
    setsTotal: number
    action?: string // right button label
    unit?: Units
  }>(),
  { unit: 'kg' },
)

const emit = defineEmits<{
  (e: 'action'): void
  (e: 'unit', v: Units): void
}>()

const volumeLabel = computed(
  () => `${formatVolume(props.volume, props.unit)} ${unitLabel(props.unit)}`,
)

const STAT = 'flex flex-col gap-1 rounded-[14px] bg-on-photo/8 px-3 py-2.5'
const STAT_LABEL =
  'font-eyebrow text-[8px] uppercase tracking-[0.5px] text-on-photo/55'
const UNITS: Units[] = ['kg', 'lb']

const TOGGLE_BTN =
  'min-h-6.5 rounded-pill px-3 py-1.5 text-[10px] font-bold tracking-[0.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-photo/40'
// The selected unit is the raised thumb of the segmented control; its other
// half stays flat so the pair reads as one switch rather than two buttons.
// Reka sets `data-state` on the checked item, so the two halves no longer need
// a bound class each.
const TOGGLE_ON =
  'data-[state=checked]:btn-raised data-[state=checked]:bg-on-photo data-[state=checked]:text-photo data-[state=checked]:[--btn-face:var(--on-photo)]'
const TOGGLE_OFF = 'text-on-photo/60 transition-colors'
</script>

<template>
  <!-- A photographic banner: dark in both themes on purpose (`--surface-photo`). -->
  <header
    class="relative overflow-hidden rounded-b-lg bg-photo text-on-photo lg:rounded-b-4xl"
  >
    <div
      class="absolute inset-0 bg-[var(--photo-wash),url('https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=500&q=60')] bg-cover bg-center opacity-25 mix-blend-luminosity"
    />

    <!-- Desktop: the banner stays full-bleed, its content follows the focus column. -->
    <div
      class="relative px-5 pt-(--screen-pad-top) pb-4.5 lg:mx-auto lg:max-w-(--focus-max) lg:px-10 lg:pt-8 lg:pb-6.5"
    >
      <div class="mb-4 flex items-start justify-between gap-3">
        <div>
          <span
            class="font-eyebrow text-[9.5px] font-bold uppercase tracking-[1px] text-on-photo/60"
          >
            {{ eyebrow }}
          </span>
          <h1
            class="mt-1.5 mb-0 font-display text-[18px] font-black lg:text-[22px]"
          >
            {{ title }}
          </h1>
        </div>
        <button
          class="btn-raised shrink-0 rounded-pill bg-on-photo/14 px-4 py-2 text-[13px] font-bold text-on-photo [--btn-face:var(--face-on-photo)]"
          @click="emit('action')"
        >
          {{ action ?? 'Cancel' }}
        </button>
      </div>

      <div class="mb-4 grid grid-cols-3 gap-2.5 lg:gap-3.5">
        <div :class="STAT">
          <span :class="STAT_LABEL">Duration</span>
          <span class="data text-base font-bold">{{ duration }}</span>
        </div>
        <div :class="STAT">
          <span :class="STAT_LABEL">Volume</span>
          <span class="data text-base font-bold">{{ volumeLabel }}</span>
        </div>
        <div :class="STAT">
          <span :class="STAT_LABEL">Sets</span>
          <span class="data text-base font-bold text-orange">
            {{ setsDone }}/{{ setsTotal }}
          </span>
        </div>
      </div>

      <div class="flex items-center justify-between">
        <span
          class="font-eyebrow text-[8.5px] uppercase tracking-[0.5px] text-on-photo/55"
        >
          Weight unit
        </span>
        <!-- A two-option radio group rather than two buttons wearing radio
             roles: Reka gives it one tab stop and arrow-key movement. -->
        <RadioGroup
          :model-value="unit"
          orientation="horizontal"
          aria-label="Weight unit"
          class="flex gap-0.5 rounded-pill bg-on-photo/10 p-0.75"
          @update:model-value="emit('unit', $event as 'kg' | 'lb')"
        >
          <RadioGroupItem
            v-for="option in UNITS"
            :key="option"
            :value="option"
            variant="plain"
            :class="[TOGGLE_BTN, TOGGLE_OFF, TOGGLE_ON]"
          >
            {{ option.toUpperCase() }}
          </RadioGroupItem>
        </RadioGroup>
      </div>
    </div>
  </header>
</template>
