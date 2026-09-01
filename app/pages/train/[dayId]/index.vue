<script setup lang="ts">
// 13 · Ready to Start / 14 · Active Session / 15 · Rest Timer / 16 · Exercise Menu
definePageMeta({ layout: false })

import { trustedTimestamp } from '~/lib/time'

const route = useRoute()
const router = useRouter()
const store = useAppStore()

const dayId = computed(() => String(route.params.dayId))
const day = computed(() => store.getDay(dayId.value))

// Resume the session for this day, or open a fresh one. A session already in
// progress for a *different* day is left alone; the picker offers to resume it.
onMounted(async () => {
  if (!day.value) {
    router.replace('/train')
    return
  }
  if (store.activeSession.value?.dayId !== dayId.value) {
    // Null means today's session is already in the log. The picker is where
    // that gets explained, so hand back to it rather than showing an empty
    // session that cannot be started.
    const started = await store.startSession(day.value)
    if (!started) router.replace('/train')
  }
})

const session = computed(() => store.activeSession.value)

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
  // marks it as the member's own, which is what makes it removable again.
  exercise.sets.push({
    reps: last?.reps ?? 10,
    weightKg: last?.weightKg ?? 0,
    done: false,
    added: true,
    previousWeightKg: null,
    previousReps: null,
  })
  await store.persistActiveSession()
}

const removeSet = async (exerciseIndex: number, setIndex: number) => {
  const active = store.activeSession.value
  if (!active) return
  // The card only offers this for a set the member added, but the guard belongs
  // here too: the prescribed sets are the workout, and nothing should be able
  // to take one out of it.
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
          @add-set="() => addSet(i)"
          @remove-set="(setIndex) => removeSet(i, setIndex)"
          @update-note="(value) => updateNote(i, value)"
          @rest="openRest"
        />
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
      <AppButton
        v-if="!session?.running"
        icon="play"
        @click="startWorkout"
      >
        Start workout
      </AppButton>
      <AppButton v-else variant="primary" @click="finish">
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
