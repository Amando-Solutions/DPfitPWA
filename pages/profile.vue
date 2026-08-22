<script setup lang="ts">
// 29 · Profile & Settings (+ 31 · Confirm Sign Out)
definePageMeta({ layout: 'app' })

import { activityOptions, callSlots, goalOptions } from '~/data/onboarding'
import { cohort } from '~/data/program'
import { formatWeight } from '~/lib/domain/nutrition'
import type { ActivityLevel, Goal, Units } from '~/data/types'

const router = useRouter()
const store = useAppStore()

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
  <div class="profile">
    <ScreenIntro
      :eyebrow="cohort.name"
      title="Profile & settings"
      subtitle="Change these any time — your fuel targets recalculate straight away."
      :actions="false"
      class="profile__header"
    />

    <!-- Snapshot -->
    <section class="profile__snapshot">
      <AppCard variant="ink" class="snapshot">
        <div class="snapshot__cell">
          <span class="snapshot__label">Started at</span>
          <span class="snapshot__value data">{{ formatWeight(startWeight, units) }}</span>
        </div>
        <div class="snapshot__cell">
          <span class="snapshot__label">Now</span>
          <span class="snapshot__value data">{{ formatWeight(weightKg, units) }}</span>
        </div>
        <div class="snapshot__cell">
          <span class="snapshot__label">Change</span>
          <span class="snapshot__value snapshot__value--accent data">
            {{ change === null ? '—' : `${change > 0 ? '+' : ''}${change.toFixed(1)}kg` }}
          </span>
        </div>
      </AppCard>
    </section>

    <!-- Your details -->
    <section class="profile__section">
      <div class="profile__section-head">
        <EyebrowLabel tone="muted">Your details</EyebrowLabel>
        <Transition name="fade">
          <span v-if="saved" class="profile__saved">Saved</span>
        </Transition>
      </div>
      <AppCard variant="raised" class="profile__card">
        <TextField v-model="displayName" label="Display name" @blur="persist" />
        <TextField
          v-model.number="weightKg"
          label="Current weight"
          type="number"
          suffix="kg"
          @blur="persist"
        />

        <div>
          <span class="profile__label">Activity level</span>
          <div class="profile__options">
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
          <span class="profile__label">Goal</span>
          <div class="profile__options">
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

    <div class="profile__right">
      <!-- Coach only -->
      <section class="profile__section">
      <EyebrowLabel tone="muted">Coach only</EyebrowLabel>
      <AppCard variant="raised" class="profile__card">
        <div>
          <span class="profile__label">Allergies / restrictions</span>
          <textarea v-model="allergies" class="profile__area" rows="2" @blur="persist" />
        </div>
        <div>
          <span class="profile__label">Injuries / limitations</span>
          <textarea v-model="injuries" class="profile__area" rows="2" @blur="persist" />
        </div>
        <div>
          <span class="profile__label">Preferred live call</span>
          <div class="profile__slots">
            <button
              v-for="slot in callSlots"
              :key="slot.id"
              class="profile__slot"
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
    <section class="profile__section">
      <EyebrowLabel tone="muted">Preferences</EyebrowLabel>
      <AppCard variant="raised" class="profile__card">
        <div class="profile__row">
          <span class="profile__row-label">Appearance</span>
          <ThemeToggle />
        </div>

        <div class="profile__row">
          <span class="profile__row-label">Weight unit</span>
          <div class="profile__units">
            <button
              class="profile__unit"
              :class="{ 'profile__unit--on btn-raised': units === 'kg' }"
              @click="setUnits('kg')"
            >
              KG
            </button>
            <button
              class="profile__unit"
              :class="{ 'profile__unit--on btn-raised': units === 'lb' }"
              @click="setUnits('lb')"
            >
              LB
            </button>
          </div>
        </div>

        <div v-for="toggle in toggles" :key="toggle.key" class="profile__row">
          <span class="profile__row-label">{{ toggle.label }}</span>
          <button
            class="switch"
            :class="{ 'switch--on': toggle.value }"
            role="switch"
            :aria-checked="toggle.value"
            :aria-label="toggle.label"
            @click="store.saveSettings({ [toggle.key]: !toggle.value })"
          >
            <span class="switch__knob" />
          </button>
        </div>
      </AppCard>
    </section>

    </div>

    <section class="profile__section profile__section--danger">
      <AppButton variant="danger" @click="showSignOut = true">Sign out</AppButton>
      <p class="profile__danger-note">
        Signing out clears everything stored on this device — logs, photos and
        check-ins included.
      </p>
    </section>

    <!-- 31 · Confirm Sign Out -->
    <BottomSheet v-model="showSignOut" title="Sign out?">
      <p class="signout__body">
        This device is where your challenge lives. Signing out erases your logged
        sessions, photos and check-ins.
      </p>
      <div class="signout__actions">
        <AppButton variant="secondary" @click="showSignOut = false">Stay</AppButton>
        <AppButton variant="danger" @click="signOut">Sign out</AppButton>
      </div>
    </BottomSheet>
  </div>
</template>

<style scoped lang="scss">
.profile {
  padding: var(--screen-pad-top) 20px 0;
  display: flex;
  flex-direction: column;
  gap: 18px;

  // Transparent on mobile so the sections stay in one column.
  &__right {
    display: contents;
  }

  &__title {
    margin: 8px 0 6px;
  }

  &__sub {
    margin: 0;
    font-size: 13.5px;
    line-height: 1.45;
  }

  &__section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  &__section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__saved {
    font-family: var(--font-eyebrow);
    text-transform: uppercase;
    letter-spacing: 1px;
    font-size: 9px;
    font-weight: 700;
    color: var(--rose);
  }

  &__card {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  &__label {
    display: block;
    font-family: var(--font-eyebrow);
    text-transform: uppercase;
    letter-spacing: 1px;
    font-size: 10px;
    font-weight: 700;
    color: var(--violet-45);
    margin-bottom: 10px;
  }

  &__options {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__area {
    width: 100%;
    padding: 12px 14px;
    background: var(--paper);
    border-radius: var(--radius-md);
    box-shadow: inset 0 0 0 1.5px var(--hairline);
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--ink);
    border: none;
    outline: none;
    resize: none;
  }

  &__slots {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  &__slot {
    height: 48px;
    border-radius: var(--radius-md);
    background: var(--paper);
    box-shadow: inset 0 0 0 1.5px var(--hairline);
    font-weight: 700;
    font-size: 14px;
    color: var(--ink);

    &--on {
      background: var(--rose-softer);
      box-shadow: inset 0 0 0 1.5px var(--rose);
      color: var(--rose);
    }
  }

  &__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    // The appearance control is ~224px wide; on a 320px screen it drops to its
    // own line rather than pushing out of the card.
    flex-wrap: wrap;
    row-gap: 10px;
  }

  &__row-label {
    font-size: 14px;
    font-weight: 600;
    color: var(--ink);
  }

  &__units {
    display: flex;
    gap: 2px;
    padding: 3px;
    background: var(--fill-subtle);
    border-radius: var(--radius-pill);
  }

  &__unit {
    padding: 6px 14px;
    border-radius: var(--radius-pill);
    font-family: var(--font-eyebrow);
    letter-spacing: 0.5px;
    font-size: 10px;
    font-weight: 700;
    color: var(--violet-45);

    &--on {
      background: var(--surface-inverse);
      --btn-face: var(--surface-inverse);
      color: var(--on-inverse);
    }
  }

  &__danger-note {
    margin: 0;
    font-size: 12px;
    line-height: 1.45;
    color: var(--violet-45);
    text-align: center;
  }
}

.switch {
  width: 46px;
  height: 27px;
  border-radius: var(--radius-pill);
  background: var(--hairline-strong);
  padding: 3px;
  display: flex;
  transition: background 0.18s ease;

  &--on {
    background: var(--rose-fill);
    justify-content: flex-end;
  }

  &__knob {
    width: 21px;
    height: 21px;
    border-radius: 50%;
    background: var(--paper-raised);
    box-shadow: var(--shadow-knob);
  }
}

.snapshot {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;

  &__cell {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  &__label {
    font-family: var(--font-eyebrow);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-size: 8.5px;
    font-weight: 700;
    color: var(--on-inverse-muted);
  }

  &__value {
    font-size: 17px;
    font-weight: 700;
    color: var(--on-inverse);

    &--accent {
      color: var(--orange);
    }
  }
}

.signout {
  &__body {
    margin: 0 0 16px;
    font-size: 14px;
    line-height: 1.5;
    color: var(--violet-45);
  }
  &__actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (min-width: 1024px) {
  .profile {
    padding: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    grid-template-areas:
      'header   header'
      'snapshot snapshot'
      'details  right'
      'danger   danger';
    align-content: start;
    align-items: start;
    column-gap: 24px;
    row-gap: 18px;

    &__header {
      grid-area: header;
    }

    &__sub {
      font-size: 15px;
      max-width: 560px;
    }

    &__snapshot {
      grid-area: snapshot;
    }

    &__section:nth-of-type(2) {
      grid-area: details;
    }

    &__right {
      grid-area: right;
      display: flex;
      flex-direction: column;
      gap: 18px;
      align-self: start;
    }

    &__section--danger {
      grid-area: danger;
      max-width: 420px;
    }
  }
}
</style>
