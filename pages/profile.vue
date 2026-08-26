<script setup lang="ts">
// 29 · Profile & Settings (+ 31 · Confirm Sign Out)
definePageMeta({ layout: 'app' })

import { activityOptions, callSlots, goalOptions } from '~/data/onboarding'
import { cohort } from '~/data/program'
import { formatWeight } from '~/lib/domain/nutrition'
import type { ActivityLevel, Goal, Units } from '~/data/types'

const router = useRouter()
const store = useAppStore()

const UNIT_OPTIONS: Units[] = ['kg', 'lb']

const profile = computed(() => store.profile.value)

// --- Editable fields (saved on blur so nothing needs a "save" button) -------
const displayName = ref(profile.value?.displayName ?? '')
const weightKg = ref<number | null>(profile.value?.weightKg ?? null)
const activity = ref<ActivityLevel | ''>(profile.value?.activity ?? '')
const goal = ref<Goal | ''>(profile.value?.goal ?? '')
const allergies = ref(profile.value?.allergies ?? '')
const injuries = ref(profile.value?.injuries ?? '')
const callSlot = ref(profile.value?.callSlot ?? '')

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
    activity: (activity.value || undefined) as ActivityLevel,
    goal: (goal.value || undefined) as Goal,
    allergies: allergies.value.trim(),
    injuries: injuries.value.trim(),
    callSlot: callSlot.value,
  })
  flashSaved()
}

const units = computed(() => store.settings.value.units)
const setUnits = (value: Units) => store.saveSettings({ units: value })

const toggles = computed(() => [
  { key: 'workoutReminders' as const, label: 'Workout reminders', value: store.settings.value.workoutReminders },
  { key: 'coachMessages' as const, label: 'Coach messages', value: store.settings.value.coachMessages },
  { key: 'weeklyCheckInReminder' as const, label: 'Weekly check-in reminder', value: store.settings.value.weeklyCheckInReminder },
])

const startWeight = computed(() => profile.value?.startWeightKg ?? null)
const change = computed(() => {
  if (startWeight.value === null || weightKg.value === null) return null
  return weightKg.value - startWeight.value
})

// --- Sign out --------------------------------------------------------------
const showSignOut = ref(false)
const signOut = async () => {
  await store.signOut()
  await router.push('/access-code')
}
</script>

<template>
  <div class="profile [padding:var(--screen-pad-top)_20px_0] [display:flex] [flex-direction:column] [gap:18px] [&_.profile__title]:[margin:8px_0_6px] [&_.profile__sub]:[margin:0] [&_.profile__sub]:[font-size:13.5px] [&_.profile__sub]:[line-height:1.45] [&_.switch]:[width:46px] [&_.switch]:[height:27px] [&_.switch]:[border-radius:var(--radius-pill)] [&_.switch]:[background:var(--hairline-strong)] [&_.switch]:[padding:3px] [&_.switch]:[display:flex] [&_.switch]:[transition:background_0.18s_ease] [&_.switch--on]:[background:var(--rose-fill)] [&_.switch--on]:[justify-content:flex-end] [&_.switch__knob]:[width:21px] [&_.switch__knob]:[height:21px] [&_.switch__knob]:[border-radius:50%] [&_.switch__knob]:[background:var(--paper-raised)] [&_.switch__knob]:[box-shadow:var(--shadow-knob)] [&_.fade-enter-active]:[transition:opacity_0.2s_ease] [&_.fade-leave-active]:[transition:opacity_0.2s_ease] [&_.fade-enter-from]:[opacity:0] [&_.fade-leave-to]:[opacity:0] lg:[padding:0] lg:[display:grid] lg:[grid-template-columns:minmax(0,_1fr)_minmax(0,_1fr)] lg:[grid-template-areas:'header_header'_'snapshot_snapshot'_'details_right'_'danger_danger'] lg:[align-content:start] lg:[align-items:start] lg:[column-gap:24px] lg:[row-gap:18px] lg:[&_.profile__sub]:[font-size:15px] lg:[&_.profile__sub]:[max-width:560px]">
    <ScreenIntro
      :eyebrow="cohort.name"
      title="Profile & settings"
      subtitle="Change these any time. Your fuel targets recalculate straight away."
      :actions="false"
      class="profile__header lg:[grid-area:header]"
    />

    <!-- Snapshot -->
    <section class="profile__snapshot lg:[grid-area:snapshot]">
      <AppCard variant="ink" class="snapshot [display:grid] [grid-template-columns:repeat(3,_1fr)] [gap:12px]">
        <div class="snapshot__cell [display:flex] [flex-direction:column] [gap:5px]">
          <span class="snapshot__label [font-family:var(--font-eyebrow)] [text-transform:uppercase] [letter-spacing:0.5px] [font-size:8.5px] [font-weight:700] [color:var(--on-inverse-muted)]">Started at</span>
          <span class="snapshot__value data [font-size:17px] [font-weight:700] [color:var(--on-inverse)]">{{ formatWeight(startWeight, units) }}</span>
        </div>
        <div class="snapshot__cell [display:flex] [flex-direction:column] [gap:5px]">
          <span class="snapshot__label [font-family:var(--font-eyebrow)] [text-transform:uppercase] [letter-spacing:0.5px] [font-size:8.5px] [font-weight:700] [color:var(--on-inverse-muted)]">Now</span>
          <span class="snapshot__value data [font-size:17px] [font-weight:700] [color:var(--on-inverse)]">{{ formatWeight(weightKg, units) }}</span>
        </div>
        <div class="snapshot__cell [display:flex] [flex-direction:column] [gap:5px]">
          <span class="snapshot__label [font-family:var(--font-eyebrow)] [text-transform:uppercase] [letter-spacing:0.5px] [font-size:8.5px] [font-weight:700] [color:var(--on-inverse-muted)]">Change</span>
          <span class="snapshot__value snapshot__value--accent data [font-size:17px] [font-weight:700] [color:var(--on-inverse)] [color:var(--orange)]">
            {{ change === null ? '-' : `${change > 0 ? '+' : ''}${change.toFixed(1)}kg` }}
          </span>
        </div>
      </AppCard>
    </section>

    <!-- Your details -->
    <section class="profile__section [display:flex] [flex-direction:column] [gap:10px] lg:[&:nth-of-type(2)]:[grid-area:details]">
      <div class="profile__section-head [display:flex] [align-items:center] [justify-content:space-between]">
        <EyebrowLabel tone="muted">Your details</EyebrowLabel>
        <Transition name="fade">
          <span v-if="saved" class="profile__saved [font-family:var(--font-eyebrow)] [text-transform:uppercase] [letter-spacing:1px] [font-size:9px] [font-weight:700] [color:var(--rose)]">Saved</span>
        </Transition>
      </div>
      <AppCard variant="raised" class="profile__card [display:flex] [flex-direction:column] [gap:16px]">
        <TextField v-model="displayName" label="Display name" @blur="persist" />
        <TextField
          v-model.number="weightKg"
          label="Current weight"
          type="number"
          suffix="kg"
          @blur="persist"
        />

        <div>
          <span class="profile__label [display:block] [font-family:var(--font-eyebrow)] [text-transform:uppercase] [letter-spacing:1px] [font-size:10px] [font-weight:700] [color:var(--violet-45)] [margin-bottom:10px]">Activity level</span>
          <div class="profile__options [display:flex] [flex-direction:column] [gap:8px]">
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

        <div>
          <span class="profile__label [display:block] [font-family:var(--font-eyebrow)] [text-transform:uppercase] [letter-spacing:1px] [font-size:10px] [font-weight:700] [color:var(--violet-45)] [margin-bottom:10px]">Goal</span>
          <div class="profile__options [display:flex] [flex-direction:column] [gap:8px]">
            <OptionCard
              v-for="option in goalOptions"
              :key="option.id"
              :label="option.label"
              :icon="option.icon"
              compact
              :selected="goal === option.id"
              @click="
                () => {
                  goal = option.id
                  persist()
                }
              "
            />
          </div>
        </div>
      </AppCard>
    </section>

    <div class="profile__right [display:contents] lg:[grid-area:right] lg:[display:flex] lg:[flex-direction:column] lg:[gap:18px] lg:[align-self:start]">
      <!-- Coach only -->
      <section class="profile__section [display:flex] [flex-direction:column] [gap:10px] lg:[&:nth-of-type(2)]:[grid-area:details]">
      <EyebrowLabel tone="muted">Coach only</EyebrowLabel>
      <AppCard variant="raised" class="profile__card [display:flex] [flex-direction:column] [gap:16px]">
        <div>
          <span class="profile__label [display:block] [font-family:var(--font-eyebrow)] [text-transform:uppercase] [letter-spacing:1px] [font-size:10px] [font-weight:700] [color:var(--violet-45)] [margin-bottom:10px]">Allergies / restrictions</span>
          <textarea v-model="allergies" class="profile__area [width:100%] [padding:12px_14px] [background:var(--paper)] [border-radius:var(--radius-md)] [box-shadow:inset_0_0_0_1.5px_var(--hairline)] [font-family:var(--font-body)] [font-size:14px] [color:var(--ink)] [border:none] [outline:none] [resize:none]" rows="2" @blur="persist" />
        </div>
        <div>
          <span class="profile__label [display:block] [font-family:var(--font-eyebrow)] [text-transform:uppercase] [letter-spacing:1px] [font-size:10px] [font-weight:700] [color:var(--violet-45)] [margin-bottom:10px]">Injuries / limitations</span>
          <textarea v-model="injuries" class="profile__area [width:100%] [padding:12px_14px] [background:var(--paper)] [border-radius:var(--radius-md)] [box-shadow:inset_0_0_0_1.5px_var(--hairline)] [font-family:var(--font-body)] [font-size:14px] [color:var(--ink)] [border:none] [outline:none] [resize:none]" rows="2" @blur="persist" />
        </div>
        <div>
          <span class="profile__label [display:block] [font-family:var(--font-eyebrow)] [text-transform:uppercase] [letter-spacing:1px] [font-size:10px] [font-weight:700] [color:var(--violet-45)] [margin-bottom:10px]">Preferred live call</span>
          <div class="profile__slots [display:grid] [grid-template-columns:1fr_1fr] [gap:12px]">
            <button
              v-for="slot in callSlots"
              :key="slot.id"
              class="profile__slot [height:48px] [border-radius:var(--radius-md)] [background:var(--paper)] [box-shadow:inset_0_0_0_1.5px_var(--hairline)] [font-weight:700] [font-size:14px] [color:var(--ink)] [&.profile__slot--on]:[background:var(--rose-softer)] [&.profile__slot--on]:[box-shadow:inset_0_0_0_1.5px_var(--rose)] [&.profile__slot--on]:[color:var(--rose)]"
              :class="{ 'profile__slot--on': callSlot === slot.id }"
              @click="
                () => {
                  callSlot = slot.id
                  persist()
                }
              "
            >
              {{ slot.label }}
            </button>
          </div>
        </div>
      </AppCard>
    </section>

    <!-- Preferences -->
    <section class="profile__section [display:flex] [flex-direction:column] [gap:10px] lg:[&:nth-of-type(2)]:[grid-area:details]">
      <EyebrowLabel tone="muted">Preferences</EyebrowLabel>
      <AppCard variant="raised" class="profile__card [display:flex] [flex-direction:column] [gap:16px]">
        <div class="profile__row [display:flex] [align-items:center] [justify-content:space-between] [gap:12px] [flex-wrap:wrap] [row-gap:10px]">
          <span class="profile__row-label [font-size:14px] [font-weight:600] [color:var(--ink)]">Appearance</span>
          <ThemeToggle />
        </div>

        <div class="profile__row [display:flex] [align-items:center] [justify-content:space-between] [gap:12px] [flex-wrap:wrap] [row-gap:10px]">
          <span class="profile__row-label [font-size:14px] [font-weight:600] [color:var(--ink)]">Weight unit</span>
          <RadioGroup
            :model-value="units"
            orientation="horizontal"
            aria-label="Weight unit"
            class="profile__units [display:flex] [gap:2px] [padding:3px] [background:var(--fill-subtle)] [border-radius:var(--radius-pill)]"
            @update:model-value="setUnits($event as Units)"
          >
            <RadioGroupItem
              v-for="option in UNIT_OPTIONS"
              :key="option"
              :value="option"
              variant="plain"
              class="profile__unit [padding:6px_14px] [border-radius:var(--radius-pill)] [font-family:var(--font-eyebrow)] [letter-spacing:0.5px] [font-size:10px] [font-weight:700] [color:var(--violet-45)] data-[state=checked]:btn-raised data-[state=checked]:[background:var(--surface-inverse)] data-[state=checked]:[--btn-face:var(--surface-inverse)] data-[state=checked]:[color:var(--on-inverse)]"
            >
              {{ option.toUpperCase() }}
            </RadioGroupItem>
          </RadioGroup>
        </div>

        <div v-for="toggle in toggles" :key="toggle.key" class="profile__row [display:flex] [align-items:center] [justify-content:space-between] [gap:12px] [flex-wrap:wrap] [row-gap:10px]">
          <span class="profile__row-label [font-size:14px] [font-weight:600] [color:var(--ink)]">{{ toggle.label }}</span>
          <Switch
            :model-value="toggle.value"
            :aria-label="toggle.label"
            @update:model-value="store.saveSettings({ [toggle.key]: $event })"
          />
        </div>
      </AppCard>
    </section>

    </div>

    <section class="profile__section profile__section--danger [display:flex] [flex-direction:column] [gap:10px] lg:[&:nth-of-type(2)]:[grid-area:details] lg:[grid-area:danger] lg:[max-width:420px]">
      <AppButton variant="danger" @click="showSignOut = true">Sign out</AppButton>
      <p class="profile__danger-note [margin:0] [font-size:12px] [line-height:1.45] [color:var(--violet-45)] [text-align:center]">
        Signing out clears everything stored on this device: logs, photos and
        check-ins included.
      </p>
    </section>

    <!-- 31 · Confirm Sign Out -->
    <BottomSheet v-model="showSignOut" title="Sign out?">
      <p class="signout__body [margin:0_0_16px] [font-size:14px] [line-height:1.5] [color:var(--violet-45)]">
        This device is where your challenge lives. Signing out erases your logged
        sessions, photos and check-ins.
      </p>
      <div class="signout__actions [display:grid] [grid-template-columns:1fr_1fr] [gap:12px]">
        <AppButton variant="secondary" @click="showSignOut = false">Stay</AppButton>
        <AppButton variant="danger" @click="signOut">Sign out</AppButton>
      </div>
    </BottomSheet>
  </div>
</template>
