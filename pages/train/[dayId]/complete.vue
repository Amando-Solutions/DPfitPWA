<script setup lang="ts">
// 17 · Completion · Proof Required / 18 · Photo Attached / 20 · Discard Confirm
definePageMeta({ layout: false })

import type { Units } from '~/data/types'
import { readImageAsDataUrl } from '~/lib/image'
import { QUALIFYING_SET_PERCENT, sessionQualifies } from '~/lib/domain/rewards'

const route = useRoute()
const router = useRouter()
const store = useAppStore()

// Same preference the profile screen sets; weights stay stored in kilograms.
const units = computed(() => store.settings.value.units)
const setUnits = (value: Units) => store.saveSettings({ units: value })

const dayId = computed(() => String(route.params.dayId))
const day = computed(() => store.getDay(dayId.value))
const session = computed(() => store.activeSession.value)

// Nothing to complete without a session in flight.
onMounted(() => {
  if (!store.activeSession.value) router.replace('/train')
})

const showError = ref(false)
const showDiscard = ref(false)
const saving = ref(false)
const photoError = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const totals = computed(() => {
  const exercises = session.value?.exercises ?? []
  return {
    setsTotal: exercises.reduce((n, e) => n + e.sets.length, 0),
    setsDone: exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0),
    setsPrescribed: exercises.reduce((n, e) => n + e.sets.filter((s) => !s.added).length, 0),
    volume: Math.round(
      exercises.reduce(
        (n, e) => n + e.sets.filter((s) => s.done).reduce((v, s) => v + s.weightKg * s.reps, 0),
        0,
      ),
    ),
  }
})

/**
 * Whether this will count once saved. Told before the save, not after: the
 * member can still go back and finish the sets they left.
 */
const willCount = computed(() =>
  sessionQualifies(totals.value.setsDone, totals.value.setsPrescribed || totals.value.setsTotal),
)

const durationLabel = computed(() => {
  const total = session.value?.elapsedSeconds ?? 0
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}m ${s}s`
})

const loggedAt = computed(() =>
  new Date().toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }),
)

const pickPhoto = () => fileInput.value?.click()

const onPhoto = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file || !session.value) return
  photoError.value = ''
  try {
    session.value.proofPhoto = await readImageAsDataUrl(file)
    showError.value = false
    await store.persistActiveSession()
  } catch (cause) {
    photoError.value = cause instanceof Error ? cause.message : 'Could not read that photo.'
  }
}

const clearPhoto = async () => {
  if (!session.value) return
  session.value.proofPhoto = null
  await store.persistActiveSession()
}

const onNote = async (event: Event) => {
  if (!session.value) return
  session.value.note = (event.target as HTMLTextAreaElement).value
  await store.persistActiveSession()
}

const save = async () => {
  if (saving.value) return
  if (day.value?.proofRequired && !session.value?.proofPhoto) {
    showError.value = true
    return
  }
  saving.value = true
  const log = await store.finishSession()
  saving.value = false
  if (log) router.replace(`/train/${dayId.value}/saved`)
}

const discard = async () => {
  await store.discardSession()
  router.push('/train')
}
</script>

<template>
  <div v-if="day && session" class="complete [position:relative] [height:100%] [display:flex] [flex-direction:column] [background:var(--paper)]">
    <SessionHeader
      :eyebrow="`Log workout · Week ${store.clock.value.week}`"
      :title="day.dayNumber ? `Day ${day.dayNumber}: ${day.label}` : day.label"
      :duration="durationLabel"
      :volume="totals.volume"
      :sets-done="totals.setsDone"
      :sets-total="totals.setsTotal"
      :unit="units"
      action="Save"
      @action="save"
      @unit="setUnits"
    />

    <div class="complete__body scroll-y [flex:1] [min-height:0] [padding:20px_20px_110px] [display:flex] [flex-direction:column] [gap:14px] lg:[width:100%] lg:[max-width:var(--focus-max)] lg:[margin:0_auto] lg:[padding:28px_40px_140px]">
      <!-- Proof dropzone -->
      <input
        ref="fileInput"
        class="complete__file [display:none]"
        type="file"
        accept="image/*"
        capture="environment"
        @change="onPhoto"
      />
      <button
        class="dropzone [width:100%] [min-height:130px] [border-radius:var(--radius-card)] [border:2px_dashed_var(--hairline-strong)] [background:var(--paper-raised)] [display:flex] [flex-direction:column] [align-items:center] [justify-content:center] [gap:10px] [color:var(--violet-45)] [font-size:14px] [font-weight:600] [overflow:hidden] [padding:0] [&.dropzone--filled]:[border-style:solid] [&.dropzone--filled]:[border-color:var(--rose)] [&.dropzone--filled]:[min-height:180px] [&.dropzone--error]:[border-color:var(--rose)] lg:[min-height:200px] lg:[&.dropzone--filled]:[min-height:260px]"
        :class="{ 'dropzone--filled': session.proofPhoto, 'dropzone--error': showError }"
        @click="pickPhoto"
      >
        <img
          v-if="session.proofPhoto"
          :src="session.proofPhoto"
          class="dropzone__img [width:100%] [height:180px] [object-fit:cover] lg:[height:260px]"
          alt="Proof of workout"
          decoding="async"
        />
        <template v-else>
          <AppIcon name="camera" :size="26" :stroke="1.8" />
          <span>Add a proof-of-workout photo</span>
        </template>
      </button>

      <div class="complete__photo-actions [display:flex] [align-items:baseline] [justify-content:space-between] [gap:12px]">
        <p class="complete__hint [margin:0] [font-size:12.5px] [color:var(--violet-45)]">
          {{
            day.proofRequired
              ? 'Required. This is how your coach knows the session happened.'
              : 'Optional for the finisher. Add one if you want it on record.'
          }}
        </p>
        <button v-if="session.proofPhoto" class="complete__retake [flex-shrink:0] [min-height:28px] [padding:4px_8px] [margin:-4px_-8px] [font-size:12.5px] [font-weight:700] [color:var(--rose)]" @click="clearPhoto">
          Retake
        </button>
      </div>

      <p v-if="showError" class="complete__error [margin:-6px_0_0] [font-size:13px] [font-weight:700] [color:var(--rose)]">• Please add a photo before saving.</p>
      <p v-if="photoError" class="complete__error [margin:-6px_0_0] [font-size:13px] [font-weight:700] [color:var(--rose)]">• {{ photoError }}</p>

      <div class="complete__notes [margin-top:6px] [display:flex] [flex-direction:column] [gap:10px]">
        <EyebrowLabel tone="muted">Notes (optional)</EyebrowLabel>
        <textarea
          class="complete__area [width:100%] [padding:14px_16px] [background:var(--paper-raised)] [border-radius:var(--radius-md)] [box-shadow:inset_0_0_0_1.5px_var(--hairline)] [font-size:14px] [color:var(--ink)] [border:none] [outline:none] [resize:none] [font-family:var(--font-body)] placeholder:[color:var(--text-placeholder)]"
          rows="3"
          placeholder="How did this session feel? Leave a note for yourself…"
          :value="session.note"
          @change="onNote"
        />
      </div>

      <p v-if="!willCount" class="complete__short [margin:0] [padding:12px_14px] [border-radius:var(--radius-md)] [background:var(--orange-16)] [font-size:12.5px] [line-height:1.45] [color:var(--orange-text)]">
        You’ve logged {{ totals.setsDone }} of {{ totals.setsPrescribed }} sets. Under
        {{ QUALIFYING_SET_PERCENT }}% this still saves for your coach, but it earns no RP
        and won’t count toward badges or your streak.
      </p>

      <AppCard variant="raised" class="complete__logged [display:flex] [align-items:center] [gap:12px] [color:var(--violet-45)] [&_div]:[display:flex] [&_div]:[flex-direction:column] [&_div]:[gap:2px]">
        <AppIcon name="calendar" :size="18" />
        <div>
          <span class="complete__logged-label [font-family:var(--font-eyebrow)] [text-transform:uppercase] [letter-spacing:0.5px] [font-size:8.5px] [font-weight:700] [color:var(--violet-45)]">Logged</span>
          <span class="complete__logged-time [font-size:14px] [font-weight:600] [color:var(--ink)]">{{ loggedAt }}</span>
        </div>
      </AppCard>

      <button class="complete__discard [align-self:center] [min-height:32px] [margin-top:6px] [padding:6px_14px] [color:var(--rose)] [font-weight:700] [font-size:14px]" @click="showDiscard = true">Discard workout</button>
    </div>

    <div class="complete__footer [position:absolute] [left:16px] [right:16px] [bottom:16px] lg:[left:50%] lg:[right:auto] lg:[transform:translateX(-50%)] lg:[width:min(var(--focus-max),_100%_-_80px)] lg:[bottom:24px]">
      <AppButton glow icon-right="arrowRight" :disabled="saving" @click="save">
        {{ saving ? 'Saving…' : 'Save workout' }}
      </AppButton>
    </div>

    <BottomSheet v-model="showDiscard" title="Discard this workout?">
      <p class="ds__body [margin:0_0_16px] [font-size:14px] [color:var(--violet-45)] [line-height:1.5]">
        All your logged sets for this session will be lost. This can’t be undone.
      </p>
      <div class="ds__actions [display:grid] [grid-template-columns:1fr_1fr] [gap:12px]">
        <AppButton variant="secondary" @click="showDiscard = false">Keep it</AppButton>
        <AppButton variant="danger" @click="discard">Discard workout</AppButton>
      </div>
    </BottomSheet>
  </div>
</template>
