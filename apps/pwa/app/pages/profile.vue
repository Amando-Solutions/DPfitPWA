<script setup lang="ts">
// 29 · Profile & Settings
definePageMeta({ layout: 'app' })

import { activityOptions } from '~/data/onboarding'
import { isCompleteChoice, type RegionChoice } from '~/lib/domain/region'
import {
  formatHeight,
  formatWeight,
  fromDisplayWeight,
  toDisplayWeight,
} from '~/lib/domain/nutrition'
import type {
  ActivityLevel,
  HeightUnits,
  MemberPreferences,
  MemberProfile,
  Units,
} from '~/data/types'

const store = useAppStore()
const router = useRouter()

/*
  This screen mirrors setup, field for field, because it is where every setup
  answer goes to be changed. So the same four edits land here:

    · sex is asked at setup and not re-asked here, now that it is two values
      feeding one equation
    · the goal dropdown is gone — it moved off this screen with the rest of the
      plan choices, which the coach owns
    · health conditions are gone, along with the Fuel note that read them
    · injuries are gone, here as well as at setup, and the "Coach only" card
      that held nothing else went with them
    · the preferred-call radio is gone; the live call is one time for everyone
    · both unit toggles are here, on the fields they govern
    · display name and height are shown, not edited. Both are answered once
      at setup and fixed from then on, and the lock is `firestore.rules`, not
      this template: a field hidden here is still a field anyone with devtools
      can write, so the rules refuse the change once setup is finished.
    · weight and the WhatsApp number ask before they save. See `ask`.
    · the region is the one setup answer that stays editable, because members
      travel. It is changed in a sheet of its own and sent to the server, which
      is what makes the change forward-only. See `regionOpen`.

  Sign out moved to the More menu. It was the single destructive control at the
  bottom of a form people open to change their weight.

  Past `lg` it comes back, because there is no More there to hold it: the side
  rail promotes what the "More" tab covers and drops the tab itself, so this is
  the only screen a desktop member can sign out from. It stays desktop-only,
  and the phone keeps the arrangement above.
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

// --- Fixed at setup ----------------------------------------------------------
// Read straight off the profile and never written from this screen. See the
// note at the top, and the `members` update rule.
const displayName = computed(() => profile.value?.displayName?.trim() || '-')
const heightCm = computed(() => profile.value?.heightCm ?? null)

// --- Editable fields (nothing needs a "save" button) -------------------------
const weightKg = ref<number | null>(profile.value?.weightKg ?? null)
const activity = ref<ActivityLevel | ''>(profile.value?.activity ?? '')
const whatsapp = ref(profile.value?.whatsapp ?? '')

/**
 * The same shape the landing form accepts, checked again here because this is
 * the only screen where the number can be corrected.
 *
 * Blank is fine and not an error: a member whose code was issued by hand never
 * gave one, and nagging them about a field they were never asked to fill in is
 * worse than an empty value the coach can chase.
 */
const whatsappError = computed(() => {
  const value = whatsapp.value.trim()
  return value && !/^\+?[\d\s().-]{7,}$/.test(value)
    ? 'Include the country code, like +234 801 234 5678.'
    : ''
})

const saved = ref(false)
let savedTimer: ReturnType<typeof setTimeout> | null = null

const flashSaved = () => {
  saved.value = true
  if (savedTimer) clearTimeout(savedTimer)
  savedTimer = setTimeout(() => (saved.value = false), 1600)
}
onBeforeUnmount(() => savedTimer && clearTimeout(savedTimer))

/**
 * A profile write is open, and the card is frozen for it.
 *
 * Each write carries only the field it is about — an activity option, or a
 * confirmed weight or number — but they all land on the same member document,
 * and `saveProfile` builds its patch from the profile as it last read it. Two
 * open at once is two whole profiles racing, and the one that lands second
 * undoes the first. So the whole card freezes, not just the field in question.
 */
const savingProfile = ref(false)
const profileError = ref('')

const save = async (patch: Partial<MemberProfile>) => {
  if (savingProfile.value) return
  savingProfile.value = true
  profileError.value = ''
  try {
    await store.saveProfile(patch)
    flashSaved()
  } catch (cause) {
    profileError.value =
      cause instanceof Error
        ? cause.message
        : 'Could not save that. Check your connection and try again.'
  } finally {
    savingProfile.value = false
  }
}

// --- Confirming a change -----------------------------------------------------
/**
 * Weight and the WhatsApp number ask before they save.
 *
 * Both are easy to get wrong without noticing. A slipped digit in the weight
 * moves every fuel target the app sets, and a wrong digit in the number is how
 * a member quietly drops out of the coach's reach. Both used to save the moment
 * the field was left, so leaving it was the whole commitment. Now leaving one
 * with a different value opens a sheet naming the old value and the new one,
 * and nothing is sent until the member says yes. Cancel puts the saved value
 * back in the field.
 *
 * The patch is captured when the sheet opens rather than read from the field
 * on confirm, so what is written is exactly what the sheet said would be.
 *
 * Focus needs no handling here: Reka returns it, when the sheet closes, to
 * wherever it was when the sheet opened — which is where the member was heading
 * when they left the field.
 */
interface PendingChange {
  field: 'weightKg' | 'whatsapp'
  title: string
  description: string
  from: string
  to: string
  patch: Partial<MemberProfile>
}

/**
 * Left in place when the sheet closes. The panel animates out, and clearing
 * its content first would collapse it halfway down the screen.
 */
const pending = ref<PendingChange | null>(null)
const confirmOpen = ref(false)
const confirming = ref(false)

const ask = (change: PendingChange) => {
  pending.value = change
  confirmOpen.value = true
}

const onWeightBlur = () => {
  const stored = profile.value?.weightKg ?? null
  // An emptied or unreadable field is not a new weight. The saved one goes
  // back, rather than a blank being put up for confirmation.
  if (weightKg.value === null) {
    weightKg.value = stored
    return
  }
  // Compared as shown, not as stored. The same weight typed in lbs converts
  // back to kilograms a few decimals off, and "68kg → 68kg?" is a question
  // about rounding.
  if (
    stored !== null &&
    toDisplayWeight(weightKg.value, units.value) === toDisplayWeight(stored, units.value)
  ) {
    weightKg.value = stored
    return
  }
  ask({
    field: 'weightKg',
    title: 'Update your weight?',
    description: 'Your daily fuel targets recalculate straight away.',
    from: formatWeight(stored, units.value),
    to: formatWeight(weightKg.value, units.value),
    patch: { weightKg: weightKg.value },
  })
}

const onWhatsappBlur = () => {
  const stored = profile.value?.whatsapp ?? ''
  const next = whatsapp.value.trim()
  // A malformed number stays in the field with its error under it, unsent.
  if (whatsappError.value || next === stored) return
  ask({
    field: 'whatsapp',
    title: next ? 'Change your WhatsApp number?' : 'Remove your WhatsApp number?',
    description: 'It’s the number your coach uses to add you to the group chat.',
    from: stored || 'None',
    to: next || 'None',
    patch: { whatsapp: next },
  })
}

const cancelChange = () => {
  if (pending.value?.field === 'weightKg') weightKg.value = profile.value?.weightKg ?? null
  if (pending.value?.field === 'whatsapp') whatsapp.value = profile.value?.whatsapp ?? ''
  confirmOpen.value = false
}

const confirmChange = async () => {
  if (!pending.value || confirming.value) return
  confirming.value = true
  try {
    // `save` reports its own failure under the card, where it stays visible
    // once the sheet is gone; the field keeps the new value, so leaving it
    // again asks again.
    await save(pending.value.patch)
  } finally {
    confirming.value = false
    confirmOpen.value = false
  }
}

/**
 * Escape, the scrim, or a swipe. Before the write starts that is Cancel. After
 * it has started the write is already out, and only the sheet goes.
 */
const onConfirmToggle = (open: boolean) => {
  if (open) return
  if (confirming.value) confirmOpen.value = false
  else cancelChange()
}

// --- Region ------------------------------------------------------------------
/**
 * Where the member's training days turn over.
 *
 * Picked in a sheet and sent with Update, not on tap: it moves when the next
 * session opens, so it is worth a second look. `setRegion` goes to the server,
 * which applies it from now on only — nothing logged moves, and a day already
 * under way cannot be reopened by picking a zone where it is still yesterday.
 *
 * The details card freezes with it as well as the sheet. Both writes land on
 * the member document, and a profile save built from the member as it was
 * before the region landed would put the old region back in the local copy.
 */
const regionOpen = ref(false)
const regionDraft = ref<RegionChoice>({ ...store.region.value })
const savingRegion = ref(false)
const regionError = ref('')

const openRegion = () => {
  regionDraft.value = { ...store.region.value }
  regionError.value = ''
  regionOpen.value = true
}

const regionUnchanged = computed(
  () =>
    regionDraft.value.id === store.region.value.id &&
    regionDraft.value.timezone === store.region.value.timezone,
)

const saveRegion = async () => {
  if (savingRegion.value || !isCompleteChoice(regionDraft.value)) return
  if (regionUnchanged.value) {
    regionOpen.value = false
    return
  }
  savingRegion.value = true
  regionError.value = ''
  try {
    await store.setRegion({ ...regionDraft.value })
    regionOpen.value = false
    flashSaved()
  } catch (cause) {
    regionError.value =
      cause instanceof Error ? cause.message : 'Could not save that. Check your connection and try again.'
  } finally {
    savingRegion.value = false
  }
}

/** Escape, the scrim or a swipe. Mid-write only the sheet goes; the write is already out. */
const onRegionToggle = (open: boolean) => {
  if (!open) regionOpen.value = false
}

// --- Units -----------------------------------------------------------------
// The same two preferences setup writes and the Train screen reads.
const units = computed(() => store.prefs.value.units)
const heightUnits = computed(() => store.prefs.value.heightUnits)

/**
 * Which preference is being written, if any.
 *
 * Every preference control on this screen — both unit toggles and the
 * switches — writes the same `prefs` document, and `savePreferences` replaces
 * it with whatever comes back. Two of them open at once is two replacements
 * racing, and the one that lands second wins regardless of which was asked
 * for second: flip a switch while a unit toggle is still in the air and the
 * switch can be undone by an answer built before it was touched.
 *
 * So a write freezes every preference control, not only the one that started
 * it. They are one row of switches over one document, which is the scope the
 * write actually covers.
 */
const savingPrefs = ref(false)
const prefsError = ref('')

const setPreference = async (patch: Partial<MemberPreferences>) => {
  if (savingPrefs.value) return
  savingPrefs.value = true
  prefsError.value = ''
  try {
    await store.savePreferences(patch)
  } catch (cause) {
    prefsError.value =
      cause instanceof Error ? cause.message : 'Could not save that preference.'
  } finally {
    savingPrefs.value = false
  }
}

const setUnits = (value: string) => setPreference({ units: value as Units })
const setHeightUnits = (value: string) =>
  setPreference({ heightUnits: value as HeightUnits })

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

/*
  Only switches that change something are shown. `workoutReminders` and
  `coachMessages` are still on `MemberPreferences` and still default to true,
  but nothing acts on either yet — push is one switch for the whole inbox,
  below, and the inbox does not filter — so a switch for them would be a
  control that does nothing. Add each back here once it has a reader.
*/
const toggles = computed(() => [
  { key: 'weeklyCheckInReminder' as const, label: 'Weekly check-in reminder', value: store.prefs.value.weeklyCheckInReminder },
])

// --- Push --------------------------------------------------------------------
// Not a preference: it writes the device's own document, not `prefs`, so it
// freezes its own row and leaves the others alone. See `usePushNotifications`.
const push = usePushNotifications()
const install = useInstallApp()

/**
 * Straight through, with nothing awaited first. Switching on asks for
 * permission, and Safari only shows that prompt from inside the tap.
 */
const onPushToggle = (on: boolean) => void (on ? push.enable() : push.disable())

// --- Sign out (desktop only) ------------------------------------------------
// Same confirmation the More menu uses, so the two entry points behave alike.
const showSignOut = ref(false)
/*
  Guarded like a write, because it is one: the session goes, and "Cancel" while
  it is going cannot put it back. Both buttons in the sheet freeze, not just the
  one that was pressed.
*/
const signingOut = ref(false)
const signOut = async () => {
  if (signingOut.value) return
  signingOut.value = true
  try {
    await store.signOut()
    await router.push('/sign-in')
  } catch {
    signingOut.value = false
  }
}

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
// The shape of a TextField with nothing to type into: plain text, so there is no
// input for a stray tap to focus or a keyboard to open over.
const FIXED_VALUE =
  'm-0 flex h-13.5 items-center rounded-2xl bg-sunken px-4.25 text-[15px] text-soft'
const FIXED_HINT = 'mt-1.5 mb-0 text-[12px] text-muted'
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
          <span :class="SNAPSHOT_VALUE" class="text-primary-on-inverse">{{ changeLabel }}</span>
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
          <span v-if="savingProfile || savingRegion" class="text-[12px] text-muted">Saving…</span>
          <span v-else-if="saved" class="text-[12px] text-primary">Saved</span>
        </Transition>
      </div>

      <!-- Frozen for the write. The status line above and the failure below sit
           outside the card on purpose: `inert` takes everything in it out of the
           accessibility tree, and those two are the only things worth hearing
           while it is. -->
      <AppCard
        variant="raised"
        class="flex flex-col gap-4.5 transition-opacity duration-150"
        :class="(savingProfile || savingRegion) && 'opacity-60'"
        :inert="savingProfile || savingRegion"
        :aria-busy="savingProfile || savingRegion || undefined"
      >
        <div>
          <span :class="FIELD_LABEL" class="mb-1.5 block">Display name</span>
          <p :class="FIXED_VALUE">{{ displayName }}</p>
          <p :class="FIXED_HINT">Set during setup. It can’t be changed.</p>
        </div>

        <!-- Where their training days turn over. The one setup answer that
             stays editable. -->
        <div>
          <span :class="FIELD_LABEL" class="mb-1.5 block">Your region</span>
          <button
            type="button"
            class="flex h-13.5 w-full items-center justify-between gap-3 rounded-2xl bg-sunken px-4.25 text-left text-[15px] font-semibold text-ink"
            @click="openRegion"
          >
            <span class="min-w-0 truncate">{{ store.regionName.value }}</span>
            <span class="shrink-0 text-[13px] font-bold text-primary">Change</span>
          </button>
          <p :class="FIXED_HINT">Your training days open at midnight here. Travelling? Change it before you go.</p>
        </div>

        <!-- The number the coach uses to add somebody to the cohort's group
             chat. Seeded from the access code at redemption, so for anyone who
             came through the landing form this is already filled in and this
             screen is only here to correct it. -->
        <TextField
          v-model="whatsapp"
          label="WhatsApp number"
          type="tel"
          inputmode="tel"
          placeholder="+234 801 234 5678"
          :error="whatsappError"
          @blur="onWhatsappBlur"
        />

        <!-- Weight, with the unit switch on the field it governs. -->
        <div>
          <div :class="FIELD_HEAD">
            <span :class="FIELD_LABEL">Current weight</span>
            <UnitToggle
              :model-value="units"
              :options="WEIGHT_UNITS"
              label="Weight unit"
              :disabled="savingPrefs"
              @update:model-value="setUnits"
            />
          </div>
          <TextField
            :model-value="weightShown"
            type="number"
            inputmode="decimal"
            :suffix="units"
            @update:model-value="onWeight"
            @blur="onWeightBlur"
          />
        </div>

        <!-- Height. Fixed, but the unit it is shown in is still a preference. -->
        <div>
          <div :class="FIELD_HEAD">
            <span :class="FIELD_LABEL">Height</span>
            <UnitToggle
              :model-value="heightUnits"
              :options="HEIGHT_UNITS"
              label="Height unit"
              :disabled="savingPrefs"
              @update:model-value="setHeightUnits"
            />
          </div>
          <p :class="FIXED_VALUE">{{ formatHeight(heightCm, heightUnits) }}</p>
          <p :class="FIXED_HINT">Set during setup. It can’t be changed.</p>
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
                  save({ activity: option.id })
                }
              "
            />
          </div>
        </div>
      </AppCard>

      <p v-if="profileError" role="alert" class="m-0 text-[12.5px] font-bold text-primary">
        {{ profileError }}
      </p>
    </section>

    <div class="profile__right contents lg:[grid-area:right] lg:flex lg:flex-col lg:gap-4.5 lg:self-start">
      <!-- Preferences & notifications -->
      <section :class="SECTION">
        <span :class="SECTION_LABEL">Preferences &amp; Notifications</span>
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
            <!-- Every switch freezes while any one of them is writing: they
                 share a document, and a second flip mid-write is resolved by
                 whichever reply lands last rather than by what was asked. -->
            <Switch
              :model-value="toggle.value"
              :aria-label="toggle.label"
              :disabled="savingPrefs"
              @update:model-value="setPreference({ [toggle.key]: $event })"
            />
          </div>

          <p v-if="prefsError" role="alert" class="m-0 text-[12.5px] font-bold text-primary">
            {{ prefsError }}
          </p>

          <!-- Hidden where it can never work: no Push API, or a deploy without
               a Web Push key. iOS in a browser tab is the exception, because
               adding the app to the Home Screen is a way to get it. -->
          <div v-if="push.availability.value !== 'unsupported'" class="flex flex-col gap-1.5">
            <!-- Frozen while the registration is written, and only then. While
                 the permission prompt is up the switch shows the member's
                 answer-in-waiting and stays live: the prompt may never be
                 answered, and tapping off is how they walk away from it. The
                 hint and any error stay outside, so they're still read out. -->
            <div :class="ROW" :inert="push.busy.value">
              <span :class="ROW_LABEL">Push notifications</span>
              <Switch
                :model-value="push.enabled.value || push.asking.value"
                aria-label="Push notifications"
                aria-describedby="push-hint"
                :disabled="push.busy.value || !push.canToggle.value"
                @update:model-value="onPushToggle"
              />
            </div>
            <p id="push-hint" aria-live="polite" class="m-0 text-[12.5px] leading-[1.45] text-soft">
              <template v-if="push.asking.value">
                Choose Allow in the prompt to finish turning this on.
              </template>
              <template v-else-if="push.availability.value === 'needs-install'">
                Add DP Fitness to your Home Screen to turn these on.
                <button type="button" class="p-0 font-bold text-primary" @click="install.openGuide()">
                  Show me how
                </button>
              </template>
              <template v-else-if="push.permission.value === 'denied' && !push.enabled.value">
                Notifications are blocked for DP Fitness. Allow them in your settings to turn
                this on.
              </template>
              <template v-else>
                Mentions, replies, reactions and your coach&rsquo;s announcements, on this device.
              </template>
            </p>
            <p v-if="push.error.value" role="alert" class="m-0 text-[12.5px] font-bold text-primary">
              {{ push.error.value }}
            </p>
          </div>
        </AppCard>
      </section>

      <!-- Hidden below `lg`, where the More menu owns this. -->
      <section class="hidden lg:flex lg:flex-col lg:gap-2.5">
        <span :class="SECTION_LABEL">Account</span>
        <AppButton variant="danger" @click="showSignOut = true">Sign out</AppButton>
      </section>
    </div>

    <BottomSheet v-model="showSignOut" title="Do you want to sign out?">
      <div class="grid grid-cols-2 gap-3">
        <AppButton variant="secondary" :disabled="signingOut" @click="showSignOut = false">
          Cancel
        </AppButton>
        <AppButton variant="danger" :disabled="signingOut" @click="signOut">
          {{ signingOut ? 'Signing out…' : 'Sign out' }}
        </AppButton>
      </div>
    </BottomSheet>

    <!-- Region. The picker and both buttons freeze for the write; the error sits
         outside that, so it is still read out. -->
    <BottomSheet
      :model-value="regionOpen"
      title="Your region"
      description="It applies from now on. Anything you’ve logged stays as it is, and a day you’ve already started can’t be opened again."
      @update:model-value="onRegionToggle"
    >
      <div
        class="flex flex-col gap-4 transition-opacity duration-150"
        :class="savingRegion && 'opacity-60'"
        :inert="savingRegion"
        :aria-busy="savingRegion || undefined"
      >
        <!-- Capped, because the sheet is not: eight options and a zone list
             are taller than a phone. Padded out by a pixel or two so the
             selected card's inset ring is not clipped by the scroll edge. -->
        <div class="-mx-1 max-h-[min(58dvh,520px)] overflow-y-auto overscroll-contain px-1 py-0.5">
          <RegionPicker v-model="regionDraft" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <AppButton variant="secondary" @click="regionOpen = false">Cancel</AppButton>
          <AppButton :disabled="!isCompleteChoice(regionDraft) || regionUnchanged" @click="saveRegion">
            {{ savingRegion ? 'Saving…' : 'Update' }}
          </AppButton>
        </div>
      </div>
      <p v-if="regionError" role="alert" class="mt-3 mb-0 text-[12.5px] font-bold text-primary">
        {{ regionError }}
      </p>
    </BottomSheet>

    <!-- Weight and WhatsApp number. See `ask`. Confirm also waits out any
         write already open, since `save` would otherwise drop this one. -->
    <BottomSheet
      :model-value="confirmOpen"
      :title="pending?.title"
      :description="pending?.description"
      @update:model-value="onConfirmToggle"
    >
      <p
        v-if="pending"
        class="m-0 mb-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-2xl bg-sunken p-[13px_15px] text-[15px] tabular-nums"
      >
        <span class="text-muted">{{ pending.from }}</span>
        <span aria-hidden="true" class="text-muted">→</span>
        <span class="sr-only">to</span>
        <span class="font-bold text-ink">{{ pending.to }}</span>
      </p>
      <div class="grid grid-cols-2 gap-3">
        <AppButton variant="secondary" :disabled="confirming" @click="cancelChange">
          Cancel
        </AppButton>
        <AppButton :disabled="confirming || savingProfile" @click="confirmChange">
          {{ confirming ? 'Saving…' : 'Update' }}
        </AppButton>
      </div>
    </BottomSheet>
  </div>
</template>
