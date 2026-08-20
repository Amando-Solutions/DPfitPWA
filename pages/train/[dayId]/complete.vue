<script setup lang="ts">
// 17 · Completion · Proof Required / 18 · Photo Attached / 20 · Discard Confirm
definePageMeta({ layout: false })

import type { Units } from '~/data/types'
import { readImageAsDataUrl } from '~/lib/image'

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
    volume: Math.round(
      exercises.reduce(
        (n, e) => n + e.sets.filter((s) => s.done).reduce((v, s) => v + s.weightKg * s.reps, 0),
        0,
      ),
    ),
  }
})

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
  <div v-if="day && session" class="complete">
    <SessionHeader
      :eyebrow="`Log workout · Week ${store.clock.value.week}`"
      :title="day.dayNumber ? `Day ${day.dayNumber} — ${day.label}` : day.label"
      :duration="durationLabel"
      :volume="totals.volume"
      :sets-done="totals.setsDone"
      :sets-total="totals.setsTotal"
      :unit="units"
      action="Save"
      @action="save"
      @unit="setUnits"
    />

    <div class="complete__body scroll-y">
      <!-- Proof dropzone -->
      <input
        ref="fileInput"
        class="complete__file"
        type="file"
        accept="image/*"
        capture="environment"
        @change="onPhoto"
      />
      <button
        class="dropzone"
        :class="{ 'dropzone--filled': session.proofPhoto, 'dropzone--error': showError }"
        @click="pickPhoto"
      >
        <img
          v-if="session.proofPhoto"
          :src="session.proofPhoto"
          class="dropzone__img"
          alt="Proof of workout"
        />
        <template v-else>
          <AppIcon name="camera" :size="26" :stroke="1.8" />
          <span>Add a proof-of-workout photo</span>
        </template>
      </button>

      <div class="complete__photo-actions">
        <p class="complete__hint">
          {{
            day.proofRequired
              ? 'Required. This is how your coach knows the session happened.'
              : 'Optional for the finisher — add one if you want it on record.'
          }}
        </p>
        <button v-if="session.proofPhoto" class="complete__retake" @click="clearPhoto">
          Retake
        </button>
      </div>

      <p v-if="showError" class="complete__error">• Please add a photo before saving.</p>
      <p v-if="photoError" class="complete__error">• {{ photoError }}</p>

      <div class="complete__notes">
        <EyebrowLabel tone="muted">Notes (optional)</EyebrowLabel>
        <textarea
          class="complete__area"
          rows="3"
          placeholder="How did this session feel? Leave a note for yourself…"
          :value="session.note"
          @change="onNote"
        />
      </div>

      <AppCard variant="raised" class="complete__logged">
        <AppIcon name="calendar" :size="18" />
        <div>
          <span class="complete__logged-label">Logged</span>
          <span class="complete__logged-time">{{ loggedAt }}</span>
        </div>
      </AppCard>

      <button class="complete__discard" @click="showDiscard = true">Discard workout</button>
    </div>

    <div class="complete__footer">
      <AppButton glow icon-right="arrowRight" :disabled="saving" @click="save">
        {{ saving ? 'Saving…' : 'Save workout' }}
      </AppButton>
    </div>

    <BottomSheet v-model="showDiscard" title="Discard this workout?">
      <p class="ds__body">
        All your logged sets for this session will be lost. This can’t be undone.
      </p>
      <div class="ds__actions">
        <AppButton variant="secondary" @click="showDiscard = false">Keep it</AppButton>
        <AppButton variant="danger" @click="discard">Discard workout</AppButton>
      </div>
    </BottomSheet>
  </div>
</template>

<style scoped lang="scss">
.complete {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--paper);

  &__body {
    flex: 1;
    min-height: 0;
    padding: 20px 20px 110px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  &__file {
    display: none;
  }

  &__photo-actions {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }

  &__hint {
    margin: 0;
    font-size: 12.5px;
    color: var(--violet-45);
  }

  &__retake {
    flex-shrink: 0;
    min-height: 28px;
    padding: 4px 8px;
    margin: -4px -8px;
    font-size: 12.5px;
    font-weight: 700;
    color: var(--rose);
  }

  &__error {
    margin: -6px 0 0;
    font-size: 13px;
    font-weight: 700;
    color: var(--rose);
  }

  &__notes {
    margin-top: 6px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  &__area {
    width: 100%;
    padding: 14px 16px;
    background: var(--paper-raised);
    border-radius: var(--radius-md);
    box-shadow: inset 0 0 0 1.5px var(--hairline);
    font-size: 14px;
    color: var(--ink);
    border: none;
    outline: none;
    resize: none;
    font-family: var(--font-body);
    &::placeholder {
      color: var(--text-placeholder);
    }
  }

  &__logged {
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--violet-45);

    div {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
  }

  &__logged-label {
    font-family: var(--font-eyebrow);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-size: 8.5px;
    font-weight: 700;
    color: var(--violet-45);
  }

  &__logged-time {
    font-size: 14px;
    font-weight: 600;
    color: var(--ink);
  }

  &__discard {
    align-self: center;
    min-height: 32px;
    margin-top: 6px;
    padding: 6px 14px;
    color: var(--rose);
    font-weight: 700;
    font-size: 14px;
  }

  &__footer {
    position: absolute;
    left: 16px;
    right: 16px;
    bottom: 16px;
  }
}

.dropzone {
  width: 100%;
  min-height: 130px;
  border-radius: var(--radius-card);
  border: 2px dashed var(--hairline-strong);
  background: var(--paper-raised);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--violet-45);
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  padding: 0;

  &--filled {
    border-style: solid;
    border-color: var(--rose);
    min-height: 180px;
  }

  &--error {
    border-color: var(--rose);
  }

  &__img {
    width: 100%;
    height: 180px;
    object-fit: cover;
  }
}

.ds {
  &__body {
    margin: 0 0 16px;
    font-size: 14px;
    color: var(--violet-45);
    line-height: 1.5;
  }
  &__actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
}

@media (min-width: 1024px) {
  .complete {
    &__body {
      width: 100%;
      max-width: var(--focus-max);
      margin: 0 auto;
      padding: 28px 40px 140px;
    }

    &__footer {
      left: 50%;
      right: auto;
      transform: translateX(-50%);
      width: min(var(--focus-max), calc(100% - 80px));
      bottom: 24px;
    }
  }

  .dropzone {
    min-height: 200px;

    &--filled {
      min-height: 260px;
    }

    &__img {
      height: 260px;
    }
  }
}
</style>
