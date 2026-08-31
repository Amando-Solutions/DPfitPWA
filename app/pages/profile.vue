<script setup lang="ts">
// 29 · Profile & Settings
definePageMeta({ layout: 'app' })

import { activityOptions } from '~/data/onboarding'
import {
  cmToFeetInches,
  feetInchesToCm,
  formatHeight,
  formatWeight,
  fromDisplayWeight,
  toDisplayWeight,
} from '~/lib/domain/nutrition'
import type { ActivityLevel, HeightUnits, Units } from '~/data/types'

const store = useAppStore()

/*
  This screen mirrors setup, field for field, because it is where every setup
  answer goes to be changed. So the same four edits land here:

    · sex is asked at setup and not re-asked here, now that it is two values
      feeding one equation
    · the goal dropdown is gone — it moved off this screen with the rest of the
      plan choices, which the coach owns
    · allergies became health conditions
    · the preferred-call radio is gone; the live call is one time for everyone
    · both unit toggles are here, on the fields they govern

  Sign out moved to the More menu. It was the single destructive control at the
  bottom of a form people open to change their weight.
*/
const WEIGHT_UNITS = [
  { id: 'kg', label: 'kg' },
  { id: 'lb', label: 'lbs' },
]
const HEIGHT_UNITS = [
  { id: 'cm', label: 'cm' },
  { id: 'ft', label: 'ft / in' },
]

const profile = computed(() => store.profile.value)

// --- Editable fields (saved on blur so nothing needs a "save" button) -------
const displayName = ref(profile.value?.displayName ?? '')
const weightKg = ref<number | null>(profile.value?.weightKg ?? null)
const heightCm = ref<number | null>(profile.value?.heightCm ?? null)
const activity = ref<ActivityLevel | ''>(profile.value?.activity ?? '')
const healthConditions = ref(profile.value?.healthConditions ?? '')
const injuries = ref(profile.value?.injuries ?? '')

const saved = ref(false)
let savedTimer: ReturnType<typeof setTimeout> | null = null

const flashSaved = () => {
  saved.value = true
  if (savedTimer) clearTimeout(savedTimer)
  savedTimer = setTimeout(() => (saved.value = false), 1600)
}
onBeforeUnmount(() => savedTimer && clearTimeout(savedTimer))

const persist = async () => {
  await store.saveProfile({
    displayName: displayName.value.trim(),
    weightKg: weightKg.value,
    heightCm: heightCm.value,
    activity: (activity.value || undefined) as ActivityLevel,
    healthConditions: healthConditions.value.trim(),
    injuries: injuries.value.trim(),
  })
  flashSaved()
}

// --- Units -----------------------------------------------------------------
// The same two preferences setup writes and the Train screen reads.
const units = computed(() => store.prefs.value.units)
const heightUnits = computed(() => store.prefs.value.heightUnits)

const setUnits = (value: string) => store.savePreferences({ units: value as Units })
const setHeightUnits = (value: string) =>
  store.savePreferences({ heightUnits: value as HeightUnits })

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

const toggles = computed(() => [
  { key: 'workoutReminders' as const, label: 'Workout reminders', value: store.prefs.value.workoutReminders },
  { key: 'coachMessages' as const, label: 'Coach messages', value: store.prefs.value.coachMessages },
  { key: 'weeklyCheckInReminder' as const, label: 'Weekly check-in reminder', value: store.prefs.value.weeklyCheckInReminder },
])

const startWeight = computed(() => profile.value?.startWeightKg ?? null)
const change = computed(() => {
  if (startWeight.value === null || weightKg.value === null) return null
  return weightKg.value - startWeight.value
})

const changeLabel = computed(() => {
  if (change.value === null) return '-'
  const shown = toDisplayWeight(Math.abs(change.value), units.value)
  return `${change.value > 0 ? '+' : change.value < 0 ? '−' : ''}${shown}${units.value}`
})

const SECTION = 'flex flex-col gap-2.5'
const SECTION_LABEL = 'text-[13px] text-muted'
const FIELD_HEAD = 'mb-1.5 flex items-center justify-between gap-2'
const FIELD_LABEL = 'text-[13px] text-soft'
const AREA =
  'w-full resize-none rounded-md border-none bg-sunken p-[12px_14px] font-body text-[14px] text-ink shadow-[inset_0_0_0_1.5px_var(--hairline)] outline-none'
const ROW = 'flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5'
const ROW_LABEL = 'text-[14px] font-semibold text-ink'
const SNAPSHOT_LABEL = 'text-[12px] text-on-inverse-muted'
const SNAPSHOT_VALUE = 'text-[17px] font-bold text-on-inverse tabular-nums'
</script>

<template>
  <div class="profile pt-(--screen-pad-top) px-5 pb-0 flex flex-col gap-4.5 [&_.fade-enter-active]:transition-opacity [&_.fade-enter-active]:duration-200 [&_.fade-enter-active]:ease-[ease] [&_.fade-leave-active]:transition-opacity [&_.fade-leave-active]:duration-200 [&_.fade-leave-active]:ease-[ease] [&_.fade-enter-from]:opacity-0 [&_.fade-leave-to]:opacity-0 lg:p-0 lg:grid lg:grid-cols-2 lg:[grid-template-areas:'header_header'_'snapshot_snapshot'_'details_right'] lg:content-start lg:items-start lg:gap-x-6 lg:gap-y-4.5">
    <ScreenIntro
      title="Profile & settings"
      subtitle="Change these any time. Your fuel targets recalculate straight away."
      :actions="false"
      class="profile__header lg:[grid-area:header]"
    />

    <!-- Snapshot -->
    <section class="profile__snapshot lg:[grid-area:snapshot]">
      <AppCard variant="ink" class="grid grid-cols-4 gap-3">
        <div class="flex flex-col gap-1.25">
          <span :class="SNAPSHOT_LABEL">Started at</span>
          <span :class="SNAPSHOT_VALUE">{{ formatWeight(startWeight, units) }}</span>
        </div>
        <div class="flex flex-col gap-1.25">
          <span :class="SNAPSHOT_LABEL">Now</span>
          <span :class="SNAPSHOT_VALUE">{{ formatWeight(weightKg, units) }}</span>
        </div>
        <div class="flex flex-col gap-1.25">
          <span :class="SNAPSHOT_LABEL">Change</span>
          <span :class="SNAPSHOT_VALUE" class="text-rose-on-inverse">{{ changeLabel }}</span>
        </div>
        <div class="flex flex-col gap-1.25">
          <span :class="SNAPSHOT_LABEL">Height</span>
          <span :class="SNAPSHOT_VALUE">{{ formatHeight(heightCm, heightUnits) }}</span>
        </div>
      </AppCard>
    </section>

    <!-- Your details -->
    <section :class="SECTION" class="lg:[grid-area:details]">
      <div class="flex items-center justify-between">
        <span :class="SECTION_LABEL">Your details</span>
        <Transition name="fade">
          <span v-if="saved" class="text-[12px] text-rose">Saved</span>
        </Transition>
      </div>

      <AppCard variant="raised" class="flex flex-col gap-4.5">
        <TextField v-model="displayName" label="Display name" @blur="persist" />

        <!-- Weight, with the unit switch on the field it governs. -->
        <div>
          <div :class="FIELD_HEAD">
            <span :class="FIELD_LABEL">Current weight</span>
            <UnitToggle
              :model-value="units"
              :options="WEIGHT_UNITS"
              label="Weight unit"
              @update:model-value="setUnits"
            />
          </div>
          <TextField
            :model-value="weightShown"
            type="number"
            inputmode="decimal"
            :suffix="units"
            @update:model-value="onWeight"
            @blur="persist"
          />
        </div>

        <!-- Height. Feet is two fields, never a decimal. -->
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
            suffix="cm"
            @update:model-value="onHeightCm"
            @blur="persist"
          />
          <div v-else class="grid grid-cols-2 gap-3">
            <TextField
              :model-value="feetInches.feet"
              type="number"
              inputmode="numeric"
              suffix="ft"
              aria-label="Height in feet"
              @update:model-value="(v) => onFeetInches('feet', v)"
              @blur="persist"
            />
            <TextField
              :model-value="feetInches.inches"
              type="number"
              inputmode="numeric"
              suffix="in"
              aria-label="Height in inches"
              @update:model-value="(v) => onFeetInches('inches', v)"
              @blur="persist"
            />
          </div>
        </div>

        <div>
          <span class="mb-2.5 block text-[13px] text-soft">Activity level</span>
          <div class="flex flex-col gap-2">
            <OptionCard
              v-for="option in activityOptions"
              :key="option.id"
              :label="option.label"
              compact
              :selected="activity === option.id"
              @click="
                () => {
                  activity = option.id
                  persist()
                }
              "
            />
          </div>
        </div>
      </AppCard>
    </section>

    <div class="profile__right contents lg:[grid-area:right] lg:flex lg:flex-col lg:gap-4.5 lg:self-start">
      <!-- Coach only -->
      <section :class="SECTION">
        <span :class="SECTION_LABEL">Coach only</span>
        <AppCard variant="raised" class="flex flex-col gap-4.5">
          <div>
            <label class="mb-2.5 block text-[13px] text-soft" for="health">
              Health conditions
            </label>
            <textarea
              id="health"
              v-model="healthConditions"
              :class="AREA"
              rows="2"
              placeholder="e.g. asthma, lactose intolerance"
              @blur="persist"
            />
          </div>
          <div>
            <label class="mb-2.5 block text-[13px] text-soft" for="injuries">
              Injuries or limitations
            </label>
            <textarea
              id="injuries"
              v-model="injuries"
              :class="AREA"
              rows="2"
              placeholder="e.g. slight knee tenderness"
              @blur="persist"
            />
          </div>
        </AppCard>
      </section>

      <!-- Preferences -->
      <section :class="SECTION">
        <span :class="SECTION_LABEL">Preferences</span>
        <AppCard variant="raised" class="flex flex-col gap-4.5">
          <div :class="ROW">
            <span :class="ROW_LABEL">Appearance</span>
            <ThemeToggle />
          </div>

          <div
            v-for="toggle in toggles"
            :key="toggle.key"
            :class="ROW"
          >
            <span :class="ROW_LABEL">{{ toggle.label }}</span>
            <Switch
              :model-value="toggle.value"
              :aria-label="toggle.label"
              @update:model-value="store.savePreferences({ [toggle.key]: $event })"
            />
          </div>
        </AppCard>
      </section>
    </div>
  </div>
</template>
