<script setup lang="ts">
// 17 · Completion · Proof Required / 18 · Photo Attached / 20 · Discard Confirm
definePageMeta({ layout: false })

import { processImage } from '~/lib/image'
import { sessionQualifies } from '~/lib/domain/rewards'
import { prescribedSets } from '~/lib/domain/sets'

const route = useRoute()
const router = useRouter()
const store = useAppStore()

// Read only, like the logging screen: the unit is a global preference set once
// during setup, not something to re-ask on the way out of a workout.
const units = computed(() => store.prefs.value.units)

const dayId = computed(() => String(route.params.dayId))
const day = computed(() => store.getDay(dayId.value))
const session = computed(() => store.activeSession.value)

// Nothing to complete without a session in flight.
onMounted(() => {
  if (!store.activeSession.value) router.replace('/train')
})

const showError = ref(false)
const showDiscard = ref(false)
const photoError = ref('')
const saveError = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

/**
 * Which write is open, so the screen can freeze for the length of it.
 *
 * One ref rather than a flag apiece, because this screen has four separate
 * writes on it — the proof upload, clearing it, the note, and the save itself —
 * and they all touch the same session document. Two of them running at once is
 * two writers racing over `activeSession`; the last to land wins, and which one
 * that is depends on how long an upload took.
 *
 * Everything below the header goes `inert` while it is set, so the freeze is
 * the whole screen and not just the button that started it. That is what
 * closes the worst of them: "Discard workout" during a save, which was
 * reachable the entire time the session was being written and would clear the
 * document out from under it.
 */
const pending = ref<'' | 'photo' | 'save' | 'discard'>('')
const saving = computed(() => pending.value === 'save')

const totals = computed(() => {
  const exercises = session.value?.exercises ?? []
  return {
    setsTotal: exercises.reduce((n, e) => n + e.sets.length, 0),
    setsDone: exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0),
    // What the plan asked for, which is not the same as what is on screen: a
    // set the member removed still counts toward the threshold.
    setsPrescribed: exercises.reduce((n, e) => n + prescribedSets(e), 0),
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
  sessionQualifies(
    totals.value.setsDone,
    totals.value.setsPrescribed || totals.value.setsTotal,
    // The member's own program's threshold, which is the one the write will
    // actually be judged against — this screen's job is to predict that answer,
    // so it has to be asking the same question.
    store.qualifyingSetPercent.value,
  ),
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
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !session.value || pending.value) return
  photoError.value = ''
  pending.value = 'photo'
  try {
    // Uploaded on pick rather than on save: a proof shot that only reaches
    // storage when "Finish" is tapped is one that a closed tab loses along
    // with the session it was proving.
    await store.attachProofPhoto(await processImage(file))
    showError.value = false
  } catch (cause) {
    photoError.value = cause instanceof Error ? cause.message : 'Could not read that photo.'
  } finally {
    pending.value = ''
    // Cleared so picking the same file again still fires `change`.
    input.value = ''
  }
}

const clearPhoto = async () => {
  if (pending.value) return
  pending.value = 'photo'
  photoError.value = ''
  try {
    await store.clearProofPhoto()
  } catch (cause) {
    photoError.value = cause instanceof Error ? cause.message : 'Could not remove that photo.'
  } finally {
    pending.value = ''
  }
}

/*
  `change`, not `input`, so this is one write when the member leaves the box
  rather than one per keystroke — and it is guarded like the rest, because it
  persists the same session document the save is about to read.
*/
const onNote = async (event: Event) => {
  if (!session.value || pending.value) return
  session.value.note = (event.target as HTMLTextAreaElement).value
  await store.persistActiveSession()
}

const save = async () => {
  if (pending.value) return
  if (day.value?.proofRequired && !session.value?.proofPhoto) {
    showError.value = true
    return
  }
  saveError.value = ''
  pending.value = 'save'
  try {
    const log = await store.finishSession()
    // `finishSession` clears the active session, so this screen is already
    // unmounting; there is nothing to release the freeze for.
    if (log) await router.replace(`/train/${dayId.value}/saved`)
    else pending.value = ''
  } catch (cause) {
    saveError.value =
      cause instanceof Error
        ? cause.message
        : 'Could not save this workout. Check your connection and try again.'
    pending.value = ''
  }
}

const discard = async () => {
  if (pending.value) return
  pending.value = 'discard'
  try {
    await store.discardSession()
    await router.push('/train')
  } catch (cause) {
    saveError.value =
      cause instanceof Error ? cause.message : 'Could not discard this workout.'
    showDiscard.value = false
    pending.value = ''
  }
}
</script>

<template>
  <div v-if="day && session" class="complete relative h-full flex flex-col bg-surface">
    <SessionHeader
      :title="day.dayNumber ? `Day ${day.dayNumber}: ${day.label}` : day.label"
      :duration="durationLabel"
      :volume="totals.volume"
      :sets-done="totals.setsDone"
      :sets-total="totals.setsTotal"
      :unit="units"
      :image-url="day.heroImage?.downloadUrl"
      action="Save"
      :action-disabled="pending !== ''"
      @action="save"
    />

    <!-- Frozen for the length of any write on this screen. The dropzone, the
         retake link, the note and "Discard workout" all live in here, and each
         of them edits the session document that a save in flight has already
         read. -->
    <div
      class="complete__body scroll-y flex-1 min-h-0 p-[20px_20px_110px] flex flex-col gap-3.5 transition-opacity duration-150 lg:w-full lg:max-w-(--focus-max) lg:m-[0_auto] lg:p-[28px_40px_140px]"
      :class="pending && 'opacity-60'"
      :inert="pending !== ''"
      :aria-busy="pending !== '' || undefined"
    >
      <!-- Proof dropzone -->
      <input
        ref="fileInput"
        class="complete__file hidden"
        type="file"
        accept="image/*"
        capture="environment"
        @change="onPhoto"
      />
      <button
        class="dropzone w-full min-h-32.5 rounded-card border-2 border-dashed border-hairline-strong bg-raised flex flex-col items-center justify-center gap-2.5 text-(--violet-45) text-[14px] font-semibold overflow-hidden p-0 [&.dropzone--filled]:border-solid [&.dropzone--filled]:border-rose [&.dropzone--filled]:min-h-45 [&.dropzone--error]:border-rose lg:min-h-50 lg:[&.dropzone--filled]:min-h-65"
        :class="{ 'dropzone--filled': session.proofPhoto, 'dropzone--error': showError }"
        @click="pickPhoto"
      >
        <img
          v-if="session.proofPhoto"
          :src="session.proofPhoto.downloadUrl"
          class="dropzone__img w-full h-45 object-cover lg:h-65"
          alt="Proof of workout"
          decoding="async"
        />
        <template v-else>
          <AppIcon name="camera" :size="26" :stroke="1.8" />
          <span>Add a proof-of-workout photo</span>
        </template>
      </button>

      <div class="complete__photo-actions flex items-baseline justify-between gap-3">
        <p class="complete__hint m-0 text-[12.5px] text-(--violet-45)">
          {{
            day.proofRequired
              ? 'Required. This is how your coach knows the session happened.'
              : 'Optional for the finisher. Add one if you want it on record.'
          }}
        </p>
        <button v-if="session.proofPhoto" class="complete__retake shrink-0 min-h-7 p-[4px_8px] m-[-4px_-8px] text-[12.5px] font-bold text-rose" @click="clearPhoto">
          Retake
        </button>
      </div>

      <p v-if="showError" class="complete__error m-[-6px_0_0] text-[13px] font-bold text-rose">• Please add a photo before saving.</p>
      <p v-if="photoError" class="complete__error m-[-6px_0_0] text-[13px] font-bold text-rose">• {{ photoError }}</p>

      <div class="complete__notes mt-1.5 flex flex-col gap-2.5">
        <span class="text-[13px] text-muted">Notes (optional)</span>
        <textarea
          class="complete__area w-full p-[14px_16px] bg-raised rounded-md shadow-[inset_0_0_0_1.5px_var(--hairline)] text-[14px] text-(--ink) border-none outline-none resize-none font-body placeholder:text-placeholder"
          rows="3"
          placeholder="How did this session feel? Leave a note for yourself…"
          :value="session.note"
          @change="onNote"
        />
      </div>

      <!-- Informational, not an error, so it reads in ink on a neutral well
           rather than borrowing the gold this flow no longer uses. -->
      <p v-if="!willCount" class="complete__short m-0 rounded-md bg-sunken p-[12px_14px] text-[12.5px] leading-[1.45] text-soft shadow-[inset_0_0_0_1px_var(--hairline)]">
        You’ve logged {{ totals.setsDone }} of {{ totals.setsPrescribed }} sets.<template
          v-if="store.qualifyingSetPercent.value"
        >
          Under {{ store.qualifyingSetPercent.value }}%</template
        ><template v-else> As it stands</template> this still saves for your coach, but it
        earns no RP and won’t count toward badges or your streak.
      </p>

      <AppCard variant="raised" class="complete__logged flex items-center gap-3 text-(--violet-45) [&_div]:flex [&_div]:flex-col [&_div]:gap-0.5">
        <AppIcon name="calendar" :size="18" />
        <div>
          <span class="complete__logged-label text-[12px] text-muted">Logged</span>
          <span class="complete__logged-time text-[14px] font-semibold text-ink tabular-nums">{{ loggedAt }}</span>
        </div>
      </AppCard>

      <button class="complete__discard self-center min-h-8 mt-1.5 p-[6px_14px] text-rose font-bold text-[14px]" @click="showDiscard = true">Discard workout</button>
    </div>

    <!-- Outside the frozen body, so the label and any failure stay readable and
         announced while the screen is inert. -->
    <div class="complete__footer absolute left-4 right-4 bottom-4 lg:left-1/2 lg:right-auto lg:transform-[translateX(-50%)] lg:w-[min(var(--focus-max),100%-80px)] lg:bottom-6">
      <p
        v-if="saveError"
        role="alert"
        class="complete__save-error mb-2.5 text-center text-[13px] font-bold text-rose"
      >
        {{ saveError }}
      </p>
      <AppButton :disabled="pending !== ''" @click="save">
        {{ saving ? 'Saving…' : pending === 'photo' ? 'Uploading photo…' : 'Save workout' }}
      </AppButton>
    </div>

    <BottomSheet v-model="showDiscard" title="Discard this workout?">
      <p class="ds__body m-[0_0_16px] text-[14px] text-(--violet-45) leading-normal">
        All your logged sets for this session will be lost. This can’t be undone.
      </p>
      <!-- The sheet is teleported out of the frozen body, so its two buttons
           carry the guard themselves. Cancel goes too: backing out of a discard
           that is already running does not un-discard it. -->
      <div class="ds__actions grid grid-cols-2 gap-3">
        <AppButton
          variant="secondary"
          :disabled="pending !== ''"
          @click="showDiscard = false"
        >
          Keep it
        </AppButton>
        <AppButton variant="danger" :disabled="pending !== ''" @click="discard">
          {{ pending === 'discard' ? 'Discarding…' : 'Discard workout' }}
        </AppButton>
      </div>
    </BottomSheet>
  </div>
</template>
