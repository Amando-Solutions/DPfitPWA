<script setup lang="ts">
// 13 · Ready to Start / 14 · Active Session / 15 · Rest Timer / 16 · Exercise Menu
definePageMeta({ layout: false })

import type { SetType } from '~/data/types'
import { nightsLabel, trustedTimestamp } from '~/lib/time'

const route = useRoute()
const router = useRouter()
const store = useAppStore()

const dayId = computed(() => String(route.params.dayId))
const day = computed(() => store.getDay(dayId.value))

const session = computed(() => store.activeSession.value)

/**
 * True while the screen is still deciding between logging and preview.
 *
 * Without it the preview renders for a frame on a day that is about to open a
 * session, and the member sees a padlock flash over the workout they just
 * tapped Start on.
 */
const opening = ref(true)

/**
 * Resume this day's session, or open one if the plan has it open today.
 *
 * A day the calendar has not reached is not a dead end and not a redirect: it
 * renders as a preview below, so the member can read Thursday's session on
 * Tuesday and see the date it opens. A session already in progress for a
 * *different* day is left alone; the picker offers to resume it.
 */
const open = async () => {
  if (!day.value) {
    router.replace('/train')
    return
  }
  if (store.activeSession.value?.dayId !== dayId.value && day.value.canStart) {
    await store.startSession(day.value)
  }
  opening.value = false
}

onMounted(open)

// Midnight rolls the store's clock over, which is exactly when a day being
// previewed becomes the day that is open. Turn the preview into a session on
// the spot rather than making them find their way back to the picker.
watch(() => day.value?.canStart, (canStart) => {
  if (canStart && !session.value) void open()
})

/** The read-only state: a day to look at, with no session behind it. */
const preview = computed(() => !opening.value && !!day.value && !session.value)

/** "Opens Thursday", or the reason there is nothing to open at all. */
const opensLabel = computed(() => {
  if (!day.value) return ''
  if (day.value.status === 'completed') return 'Logged this week'
  const nights = day.value.opensInNights
  // The finisher holds no slot in the week, so nothing schedules it and the one
  // thing that shuts it is having already been logged today.
  if (nights === null) return 'Logged today'
  // Nothing reaches here with `nights` at zero: a day whose slot is today is
  // either open or already in the log, and both were answered above.
  return `Opens ${nightsLabel(nights, store.now.value)}`
})

/**
 * The sentence under it: which rule is holding this day shut.
 *
 * A day already logged and a day the week has not reached are shut for
 * different reasons, and only one of them is about the calendar. Neither is the
 * old one-a-day rule, which no longer exists — a day left behind stays open
 * precisely so a member who missed Tuesday can log it on Thursday.
 */
const previewNote = computed(() => {
  if (!day.value) return ''
  if (day.value.status === 'completed') {
    return 'This one is logged for the week. It comes round again when the week does.'
  }
  if (day.value.opensInNights === null) {
    return 'The finisher is once a day. It is here to read until tomorrow.'
  }
  return 'Days open as the week reaches them. This one is here to read until it does.'
})

/**
 * A padlock only where something is actually shut.
 *
 * A day already in the log — this week's, or the finisher done this morning —
 * is not locked, it is finished, and the tick is the honest mark for it.
 */
const previewIcon = computed(() =>
  day.value?.status === 'completed' || day.value?.opensInNights === null ? 'check' : 'lock',
)

const setsFor = (exercises: { sets: unknown[] }[]) =>
  exercises.reduce((n, e) => n + e.sets.length, 0)

// --- Timer -----------------------------------------------------------------
/**
 * The session clock.
 *
 * Two things it deliberately does not do. It does not tick while the session is
 * paused or the screen is hidden. An interval that wakes once a second to
 * decide it has nothing to do still costs a wakeup, and on a phone that is real
 * battery over a 45-minute workout. And it does not count ticks: it advances by
 * the wall-clock delta since the previous tick. Backgrounded tabs get their
 * timers throttled to about once a minute, so a counter incremented per tick
 * silently loses time whenever the member takes a call mid-set.
 */
let clock: ReturnType<typeof setInterval> | null = null
let lastTickAt = 0
/** Fractions carried between ticks, so repeated rounding cannot drift. */
let carry = 0

const advance = (seconds: number) => {
  const active = store.activeSession.value
  if (!active || seconds <= 0) return

  const before = active.elapsedSeconds
  const total = seconds + carry
  const whole = Math.floor(total)
  carry = total - whole
  if (whole <= 0) return

  active.elapsedSeconds += whole

  if (restRemaining.value > 0) {
    restRemaining.value = Math.max(0, restRemaining.value - whole)
    if (restRemaining.value === 0) restActive.value = false
  }

  // Persist about every 30s rather than every tick. What matters is crossing
  // the boundary, not landing exactly on it, since a jump can step over it.
  if (Math.floor(before / 30) !== Math.floor(active.elapsedSeconds / 30)) {
    store.persistActiveSession()
  }
}

const stopClock = () => {
  if (clock) clearInterval(clock)
  clock = null
}

const startClock = () => {
  if (clock || document.hidden) return
  lastTickAt = Date.now()
  carry = 0
  clock = setInterval(() => {
    const now = Date.now()
    const delta = (now - lastTickAt) / 1000
    lastTickAt = now
    advance(delta)
  }, 1000)
}

/** Only run while there is something to count. */
const syncClock = () => {
  if (store.activeSession.value?.running && !document.hidden) startClock()
  else stopClock()
}

/**
 * Coming back from the background: settle up the time that passed while the
 * interval was stopped, then resume.
 */
const onVisibility = () => {
  if (document.hidden) {
    if (store.activeSession.value?.running && lastTickAt) {
      advance((Date.now() - lastTickAt) / 1000)
    }
    stopClock()
    store.persistActiveSession()
    return
  }
  if (store.activeSession.value?.running && lastTickAt) {
    advance((Date.now() - lastTickAt) / 1000)
  }
  syncClock()
}

const startWorkout = async () => {
  const active = store.activeSession.value
  if (!active) return
  active.running = true
  active.startedAt = active.startedAt ?? trustedTimestamp()
  syncClock()
  await store.persistActiveSession()
}

watch(() => store.activeSession.value?.running, syncClock)

onMounted(() => {
  document.addEventListener('visibilitychange', onVisibility)
  syncClock()
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibility)
  stopClock()
  // Leaving the screen shouldn't lose the last few reps.
  store.persistActiveSession()
})

const durationLabel = computed(() => {
  const total = session.value?.elapsedSeconds ?? 0
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

// --- Live totals -----------------------------------------------------------
const totals = computed(() => {
  const exercises = session.value?.exercises ?? []
  const setsTotal = exercises.reduce((n, e) => n + e.sets.length, 0)
  const setsDone = exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0)
  const volume = exercises.reduce(
    (n, e) => n + e.sets.filter((s) => s.done).reduce((v, s) => v + s.weightKg * s.reps, 0),
    0,
  )
  return { setsTotal, setsDone, volume: Math.round(volume) }
})

const allDone = computed(() => totals.value.setsTotal > 0 && totals.value.setsDone === totals.value.setsTotal)

// --- Rest timer ------------------------------------------------------------
const restActive = ref(false)
const restRemaining = ref(0)

const openRest = async (seconds: number) => {
  if (!session.value?.running) await startWorkout()
  restActive.value = true
  restRemaining.value = seconds
}

// --- Set logging -----------------------------------------------------------
const toggleSet = async (exerciseIndex: number, setIndex: number) => {
  const active = store.activeSession.value
  if (!active) return
  if (!active.running) await startWorkout()
  const exercise = active.exercises[exerciseIndex]
  const set = exercise?.sets[setIndex]
  if (!set) return
  set.done = !set.done
  // Completing a set is the natural moment to start resting.
  if (set.done) await openRest(exercise.restSeconds)
  await store.persistActiveSession()
}

const updateSet = async (
  exerciseIndex: number,
  payload: { index: number; field: 'reps' | 'weightKg'; value: number },
) => {
  const active = store.activeSession.value
  if (!active) return
  const set = active.exercises[exerciseIndex]?.sets[payload.index]
  if (!set) return
  set[payload.field] = payload.value
  await store.persistActiveSession()
}

const addSet = async (exerciseIndex: number) => {
  const active = store.activeSession.value
  if (!active) return
  const exercise = active.exercises[exerciseIndex]
  if (!exercise) return
  const last = exercise.sets.at(-1)
  // A set added mid-session has no counterpart in a previous week, so it
  // carries no "previous" reference and the column renders a dash. `added`
  // marks it as the member's own, which is what keeps it out of the
  // qualifying denominator the data source works out at save time.
  exercise.sets.push({
    reps: last?.reps ?? 10,
    weightKg: last?.weightKg ?? 0,
    done: false,
    added: true,
    // An extra set is a working set until the member says otherwise; copying
    // the previous row's type would make an extra after a warm-up a warm-up.
    setType: 'normal',
    previousWeightKg: null,
    previousReps: null,
  })
  await store.persistActiveSession()
}

const setSetType = async (
  exerciseIndex: number,
  payload: { index: number; setType: SetType },
) => {
  const active = store.activeSession.value
  if (!active) return
  const set = active.exercises[exerciseIndex]?.sets[payload.index]
  if (!set) return
  set.setType = payload.setType
  // Nothing is renumbered here: the SET column is computed from the order of
  // the array, so the rows below this one relabel themselves on the next render.
  await store.persistActiveSession()
}

/**
 * Take a row out of the log.
 *
 * Only a set the member added themselves. The prescribed sets are the workout
 * the coach authored in the admin panel: "4 sets of 10" is the instruction, and
 * a member who can delete two of them has edited the plan rather than logged
 * it. The picker greys the option out on those rows, but the guard belongs here
 * too — the sheet is a UI, and this is the only thing that touches the session.
 */
const removeSet = async (exerciseIndex: number, setIndex: number) => {
  const active = store.activeSession.value
  if (!active) return
  const exercise = active.exercises[exerciseIndex]
  if (!exercise?.sets[setIndex]?.added) return
  exercise.sets.splice(setIndex, 1)
  await store.persistActiveSession()
}

const updateNote = async (exerciseIndex: number, value: string) => {
  const active = store.activeSession.value
  if (!active) return
  const exercise = active.exercises[exerciseIndex]
  if (!exercise) return
  exercise.note = value
  await store.persistActiveSession()
}

// --- Units -----------------------------------------------------------------
// Read only. The member picked kilograms or pounds once, during setup, and can
// change it in Profile & Settings; this screen used to ask a second time in its
// own header, which is one preference with two places to disagree. Only the
// *display* changes either way: every weight is stored in kilograms.
const units = computed(() => store.prefs.value.units)

// --- Leaving ---------------------------------------------------------------
const showDiscard = ref(false)
const confirmDiscard = async () => {
  await store.discardSession()
  router.push('/train')
}

const finish = () => router.push(`/train/${dayId.value}/complete`)
</script>

<template>
  <div class="session relative h-full flex flex-col bg-surface">
    <div v-if="day && session" class="session__scroll scroll-y flex-1 min-h-0">
      <!-- `action` only once the clock is running: before that there is no
           workout to cancel. -->
      <SessionHeader
        :title="day.dayNumber ? `Day ${day.dayNumber}: ${day.label}` : day.label"
        :duration="durationLabel"
        :volume="totals.volume"
        :sets-done="totals.setsDone"
        :sets-total="totals.setsTotal"
        :unit="units"
        :image-url="day.heroImage?.downloadUrl"
        :action="session.running ? 'Cancel' : undefined"
        @action="showDiscard = true"
      />

      <div class="session__body pt-4 px-5 pb-30 flex flex-col gap-3.5 lg:w-full lg:max-w-(--focus-max) lg:my-0 lg:mx-auto lg:pt-6 lg:px-10 lg:pb-37.5">
        <ExerciseLogCard
          v-for="(exercise, i) in session.exercises"
          :key="exercise.id"
          :name="exercise.name"
          :rest-seconds="exercise.restSeconds"
          :note="exercise.note"
          :sets="exercise.sets"
          :unit="units"
          @toggle-set="(setIndex) => toggleSet(i, setIndex)"
          @update-set="(payload) => updateSet(i, payload)"
          @update-set-type="(payload) => setSetType(i, payload)"
          @add-set="() => addSet(i)"
          @remove-set="(setIndex) => removeSet(i, setIndex)"
          @update-note="(value) => updateNote(i, value)"
          @rest="openRest"
        />
      </div>
    </div>

    <!--
      A day the plan has not opened yet, or has already taken.

      Read-only on purpose, and reachable on purpose: the coach's session for
      Thursday is worth being able to look at on Tuesday, and a member who taps
      a padlocked day deserves the workout and the date it opens rather than
      being bounced back to the list they just left. Nothing here writes — no
      session document exists for this day until its own day comes round.

      A day the week has gone past is not one of these. It stays open to log,
      so it arrives at the session above rather than here.
    -->
    <div v-else-if="preview && day" class="session__scroll scroll-y flex-1 min-h-0">
      <header
        class="relative overflow-hidden rounded-b-2xl bg-photo text-on-photo shadow-[0_1px_0_rgba(0,0,0,0.25)]"
      >
        <img
          v-if="day.heroImage"
          :src="day.heroImage.downloadUrl"
          alt=""
          aria-hidden="true"
          decoding="async"
          class="absolute inset-0 size-full object-cover"
        />
        <div v-if="day.heroImage" class="absolute inset-0 bg-photo/80" />

        <div
          class="relative px-5 pt-(--screen-pad-top) pb-4 lg:mx-auto lg:max-w-(--focus-max) lg:px-10 lg:pt-6 lg:pb-5"
        >
          <div class="mb-3.5 flex items-center justify-between gap-3">
            <h1 class="m-0 min-w-0 truncate font-display text-[17px] font-bold lg:text-[20px]">
              {{ day.dayNumber ? `Day ${day.dayNumber}: ${day.label}` : day.label }}
            </h1>
            <NuxtLink
              to="/train"
              class="shrink-0 rounded-pill bg-on-photo/14 px-4 py-2 text-[13px] font-bold text-on-photo transition-opacity duration-100 active:opacity-70"
            >
              Close
            </NuxtLink>
          </div>

          <!-- The plan's own figures, not a session's. A duration and a volume
               of zero would read as a workout gone wrong rather than one not
               started. -->
          <div class="grid grid-cols-3 gap-3">
            <div class="flex flex-col gap-0.5">
              <span class="text-[12px] text-on-photo/60">Exercises</span>
              <span class="text-[17px] font-bold tabular-nums">{{ day.exercises.length }}</span>
            </div>
            <div class="flex flex-col gap-0.5">
              <span class="text-[12px] text-on-photo/60">Sets</span>
              <span class="text-[17px] font-bold tabular-nums">{{ setsFor(day.exercises) }}</span>
            </div>
            <div class="flex flex-col gap-0.5">
              <span class="text-[12px] text-on-photo/60">Est. time</span>
              <span class="text-[17px] font-bold tabular-nums">{{ day.estimatedMinutes }} min</span>
            </div>
          </div>
        </div>
      </header>

      <div class="pt-4 px-5 pb-30 flex flex-col gap-3.5 lg:w-full lg:max-w-(--focus-max) lg:my-0 lg:mx-auto lg:pt-6 lg:px-10 lg:pb-37.5">
        <!-- Says which rule is holding it shut, above the plan rather than
             below it, so it is read before the scrolling starts. -->
        <div class="flex items-center gap-3 rounded-card border border-hairline bg-raised px-4.5 py-3.5">
          <span class="grid size-8.5 shrink-0 place-items-center rounded-pill bg-fill-subtle text-muted">
            <AppIcon :name="previewIcon" :size="16" />
          </span>
          <span class="flex min-w-0 flex-col gap-0.5">
            <strong class="font-display text-[14.5px] font-black text-ink">{{ opensLabel }}</strong>
            <small class="text-[12.5px] text-muted">{{ previewNote }}</small>
          </span>
        </div>

        <article
          v-for="exercise in day.exercises"
          :key="exercise.id"
          class="rounded-card border border-hairline bg-raised p-4.5"
        >
          <div class="flex items-baseline justify-between gap-3">
            <h2 class="m-0 min-w-0 font-display text-[15.5px] font-black tracking-[-0.2325px] text-ink">
              {{ exercise.name }}
            </h2>
            <span class="shrink-0 text-[12.5px] text-muted tabular-nums">
              {{ exercise.restSeconds }}s rest
            </span>
          </div>
          <p class="mt-1.5 mb-0 text-[13px] text-soft">
            {{ exercise.sets.length }} × {{ exercise.targetReps }} · {{ exercise.muscleGroup }}
          </p>
          <!-- The coach's cues are the reason to open a day early at all. -->
          <ul v-if="exercise.cues.length" class="mt-2.5 mb-0 flex flex-col gap-1 pl-4.5">
            <li v-for="cue in exercise.cues" :key="cue" class="text-[12.5px] leading-[1.45] text-muted">
              {{ cue }}
            </li>
          </ul>
        </article>
      </div>
    </div>

    <!-- Docked footer: rest timer (when running) + primary CTA -->
    <div class="session__footer absolute left-4 right-4 bottom-4 flex flex-col gap-2.5 lg:left-1/2 lg:right-auto lg:-translate-x-1/2 lg:w-[min(var(--focus-max),100%-80px)] lg:bottom-6">
      <RestTimerBar
        v-if="restActive"
        :seconds="restRemaining"
        @skip="restActive = false"
        @adjust="(delta) => (restRemaining = Math.max(0, restRemaining + delta))"
      />
      <AppButton v-if="preview" icon="lock" variant="secondary" disabled>
        {{ opensLabel }}
      </AppButton>
      <AppButton
        v-else-if="session && !session.running"
        icon="play"
        @click="startWorkout"
      >
        Start workout
      </AppButton>
      <AppButton v-else-if="session" variant="primary" @click="finish">
        {{ allDone ? 'Finish workout' : `Finish (${totals.setsDone}/${totals.setsTotal} sets)` }}
      </AppButton>
    </div>

    <BottomSheet v-model="showDiscard" title="Discard this workout?">
      <p class="discard__body mt-0 mx-0 mb-4 text-[14px] text-muted leading-normal">
        You’ve logged {{ totals.setsDone }} of {{ totals.setsTotal }} sets. This can’t be
        undone.
      </p>
      <div class="discard__actions grid grid-cols-[1fr_1fr] gap-3">
        <AppButton variant="secondary" @click="showDiscard = false">Keep going</AppButton>
        <AppButton variant="danger" @click="confirmDiscard">Discard workout</AppButton>
      </div>
    </BottomSheet>
  </div>
</template>
