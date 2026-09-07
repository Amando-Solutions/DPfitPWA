<script setup lang="ts">
// 07 · Setup · Body Metrics
definePageMeta({ layout: 'default' })

import {
  cmToFeetInches,
  feetInchesToCm,
  fromDisplayWeight,
  toDisplayWeight,
} from '~/lib/domain/nutrition'
import type { HeightUnits, Units } from '~/data/types'

const router = useRouter()
const store = useAppStore()

/*
  Units are a *preference*, not an answer to this step.

  Both toggles write straight through to `prefs`, which is the same preference
  the profile screen and the Train screen's weight column read. That is what
  stops a member picking pounds here and being handed kilograms the first time
  they log a set — the choice is made once, globally, and nothing asks again.
*/
const units = computed(() => store.prefs.value.units)
const heightUnits = computed(() => store.prefs.value.heightUnits)

const WEIGHT_UNITS = [
  { id: 'kg', label: 'kg' },
  { id: 'lb', label: 'lbs' },
]
const HEIGHT_UNITS = [
  { id: 'cm', label: 'cm' },
  { id: 'ft', label: 'ft / in' },
]

/*
  Canonical state, in metric. The fields below are views onto these two numbers,
  so flipping a toggle re-renders the same measurement in the other unit rather
  than reinterpreting whatever digits happen to be in the box.
*/
const weightKg = ref<number | null>(store.profile.value?.weightKg ?? null)
const heightCm = ref<number | null>(store.profile.value?.heightCm ?? null)

// --- Weight ----------------------------------------------------------------
const weightShown = computed(() =>
  weightKg.value === null ? null : toDisplayWeight(weightKg.value, units.value),
)

const onWeight = (raw: string | number | null) => {
  const value = Number(raw)
  weightKg.value =
    raw === '' || raw === null || !Number.isFinite(value)
      ? null
      : fromDisplayWeight(value, units.value)
}

const setWeightUnits = (value: string) =>
  store.savePreferences({ units: value as Units })

// --- Height ----------------------------------------------------------------
// In feet the measurement is two fields, because 5'7" is how people know their
// own height and 5.58ft is how nobody does. They are kept as one derived pair
// so a change to either recomposes the same stored centimetres.
const feetInches = computed(() =>
  heightCm.value === null ? { feet: null, inches: null } : cmToFeetInches(heightCm.value),
)

const onHeightCm = (raw: string | number | null) => {
  const value = Number(raw)
  heightCm.value = raw === '' || raw === null || !Number.isFinite(value) ? null : value
}

const onFeetInches = (part: 'feet' | 'inches', raw: string | number | null) => {
  const value = Number(raw)
  const next = Number.isFinite(value) && raw !== '' && raw !== null ? value : 0
  const current = feetInches.value
  const feet = part === 'feet' ? next : (current.feet ?? 0)
  const inches = part === 'inches' ? next : (current.inches ?? 0)
  heightCm.value = feet === 0 && inches === 0 ? null : feetInchesToCm(feet, inches)
}

const setHeightUnits = (value: string) =>
  store.savePreferences({ heightUnits: value as HeightUnits })

// --- Continue --------------------------------------------------------------
// Validated on the metric values, so the bounds are one pair of numbers rather
// than one pair per unit.
const inRange = (value: number | null, min: number, max: number) =>
  value !== null && value >= min && value <= max

const canContinue = computed(
  () => inRange(weightKg.value, 30, 300) && inRange(heightCm.value, 100, 250),
)

const busy = ref(false)
const next = async () => {
  busy.value = true
  await store.saveProfile({
    weightKg: weightKg.value,
    heightCm: heightCm.value,
    // The weight they started at is fixed here, and every later check-in compares
    // against it rather than overwriting it.
    startWeightKg: store.profile.value?.startWeightKg ?? weightKg.value,
  })
  busy.value = false
  router.push('/setup/activity-goal')
}

const FIELD_HEAD = 'mb-1.5 flex items-center justify-between gap-2'
const FIELD_LABEL = 'text-[13px] text-soft'
</script>

<template>
  <SetupStepShell
    :step="2"
    :total="4"
    eyebrow="Your numbers"
    title="What's your starting point?"
    subtitle="Weight and height set your daily food targets. Nothing here is shared with the group."
    :can-continue="canContinue"
    :busy="busy"
    @continue="next"
  >
    <AppCard variant="raised" class="flex flex-col gap-4.5 p-4.75">
      <!-- Weight -->
      <div>
        <div :class="FIELD_HEAD">
          <span :class="FIELD_LABEL">Weight</span>
          <UnitToggle
            :model-value="units"
            :options="WEIGHT_UNITS"
            label="Weight unit"
            @update:model-value="setWeightUnits"
          />
        </div>
        <TextField
          :model-value="weightShown"
          type="number"
          inputmode="decimal"
          :placeholder="units === 'kg' ? '63' : '139'"
          :suffix="units"
          @update:model-value="onWeight"
        />
      </div>

      <!-- Height -->
      <div>
        <div :class="FIELD_HEAD">
          <span :class="FIELD_LABEL">Height</span>
          <UnitToggle
            :model-value="heightUnits"
            :options="HEIGHT_UNITS"
            label="Height unit"
            @update:model-value="setHeightUnits"
          />
        </div>

        <TextField
          v-if="heightUnits === 'cm'"
          :model-value="heightCm"
          type="number"
          inputmode="numeric"
          placeholder="164"
          suffix="cm"
          @update:model-value="onHeightCm"
        />
        <div v-else class="grid grid-cols-2 gap-3">
          <TextField
            :model-value="feetInches.feet"
            type="number"
            inputmode="numeric"
            placeholder="5"
            suffix="ft"
            aria-label="Height in feet"
            @update:model-value="(v) => onFeetInches('feet', v)"
          />
          <TextField
            :model-value="feetInches.inches"
            type="number"
            inputmode="numeric"
            placeholder="5"
            suffix="in"
            aria-label="Height in inches"
            @update:model-value="(v) => onFeetInches('inches', v)"
          />
        </div>
      </div>

      <p class="m-0 rounded-2xl bg-sunken p-[13px_15px] text-[12.5px] leading-normal text-soft">
        These two numbers set your calorie and protein targets. Update them any time
        from Profile &amp; Settings, and your daily fuel recalculates itself.
      </p>
    </AppCard>
  </SetupStepShell>
</template>
