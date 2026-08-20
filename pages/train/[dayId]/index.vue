<script setup lang="ts">
// 13 · Ready to Start / 14 · Active Session / 15 · Rest Timer / 16 · Exercise Menu
definePageMeta({ layout: false })

const route = useRoute()
const router = useRouter()
const store = useAppStore()

const dayId = computed(() => String(route.params.dayId))
const day = computed(() => store.getDay(dayId.value))

// Resume the session for this day, or open a fresh one. A session already in
// progress for a *different* day is left alone — the picker offers to resume it.
onMounted(async () => {
  if (!day.value) {
    router.replace('/train')
    return
  }
  if (store.activeSession.value?.dayId !== dayId.value) {
    await store.startSession(day.value)
  }
})

const session = computed(() => store.activeSession.value)

// --- Timer -----------------------------------------------------------------
let clock: ReturnType<typeof setInterval> | null = null

const startClock = () => {
  if (clock) return
  clock = setInterval(() => {
    const active = store.activeSession.value
    if (!active?.running) return
    active.elapsedSeconds++
    if (restRemaining.value > 0) {
      restRemaining.value--
      if (restRemaining.value === 0) restActive.value = false
    }
    // Persist about once a minute rather than every tick.
    if (active.elapsedSeconds % 30 === 0) store.persistActiveSession()
  }, 1000)
}

const startWorkout = async () => {
  const active = store.activeSession.value
  if (!active) return
  active.running = true
  active.startedAt = active.startedAt ?? new Date().toISOString()
  startClock()
  await store.persistActiveSession()
}

onMounted(startClock)
onBeforeUnmount(() => {
  if (clock) clearInterval(clock)
  clock = null
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
  const set = active.exercises[exerciseIndex].sets[setIndex]
  set.done = !set.done
  // Completing a set is the natural moment to start resting.
  if (set.done) await openRest(active.exercises[exerciseIndex].restSeconds)
  await store.persistActiveSession()
}

const updateSet = async (
  exerciseIndex: number,
  payload: { index: number; field: 'reps' | 'weightKg'; value: number },
) => {
  const active = store.activeSession.value
  if (!active) return
  active.exercises[exerciseIndex].sets[payload.index][payload.field] = payload.value
  await store.persistActiveSession()
}

const addSet = async (exerciseIndex: number) => {
  const active = store.activeSession.value
  if (!active) return
  const exercise = active.exercises[exerciseIndex]
  const last = exercise.sets.at(-1)
  exercise.sets.push({
    reps: last?.reps ?? 10,
    weightKg: last?.weightKg ?? 0,
    done: false,
    previous: '—',
  })
  await store.persistActiveSession()
}

const removeSet = async (exerciseIndex: number, setIndex: number) => {
  const active = store.activeSession.value
  if (!active) return
  active.exercises[exerciseIndex].sets.splice(setIndex, 1)
  await store.persistActiveSession()
}

const updateNote = async (exerciseIndex: number, value: string) => {
  const active = store.activeSession.value
  if (!active) return
  active.exercises[exerciseIndex].note = value
  await store.persistActiveSession()
}

// --- Leaving ---------------------------------------------------------------
const showDiscard = ref(false)
const confirmDiscard = async () => {
  await store.discardSession()
  router.push('/train')
}

const finish = () => router.push(`/train/${dayId.value}/complete`)
</script>

<template>
  <div class="session">
    <div v-if="day && session" class="session__scroll scroll-y">
      <SessionHeader
        :eyebrow="`${session.running ? 'Logging' : 'Ready to start'} · Week ${store.clock.value.week}`"
        :title="day.dayNumber ? `Day ${day.dayNumber} — ${day.label}` : day.label"
        :duration="durationLabel"
        :volume="totals.volume"
        :sets-done="totals.setsDone"
        :sets-total="totals.setsTotal"
        @action="showDiscard = true"
      />

      <div class="session__body">
        <ExerciseLogCard
          v-for="(exercise, i) in session.exercises"
          :key="exercise.id"
          :name="exercise.name"
          :muscle-group="exercise.muscleGroup"
          :rest-seconds="exercise.restSeconds"
          :note="exercise.note"
          :sets="exercise.sets"
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
    <div class="session__footer">
      <RestTimerBar
        v-if="restActive"
        :seconds="restRemaining"
        @skip="restActive = false"
        @adjust="(delta) => (restRemaining = Math.max(0, restRemaining + delta))"
      />
      <AppButton
        v-if="!session?.running"
        glow
        icon="play"
        @click="startWorkout"
      >
        Start workout
      </AppButton>
      <AppButton
        v-else
        glow
        :variant="allDone ? 'primary' : 'dark'"
        icon-right="arrowRight"
        @click="finish"
      >
        {{ allDone ? 'Finish workout' : `Finish (${totals.setsDone}/${totals.setsTotal} sets)` }}
      </AppButton>
    </div>

    <BottomSheet v-model="showDiscard" title="Discard this workout?">
      <p class="discard__body">
        You’ve logged {{ totals.setsDone }} of {{ totals.setsTotal }} sets. This can’t be
        undone.
      </p>
      <div class="discard__actions">
        <AppButton variant="secondary" @click="showDiscard = false">Keep going</AppButton>
        <AppButton variant="danger" @click="confirmDiscard">Discard workout</AppButton>
      </div>
    </BottomSheet>
  </div>
</template>

<style scoped lang="scss">
.session {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--paper);

  &__scroll {
    flex: 1;
    min-height: 0;
  }

  &__body {
    padding: 16px 20px 120px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  &__footer {
    position: absolute;
    left: 16px;
    right: 16px;
    bottom: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
}
.discard {
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
  .session {
    &__body {
      width: 100%;
      max-width: var(--focus-max);
      margin: 0 auto;
      padding: 24px 40px 150px;
    }

    &__footer {
      left: 50%;
      right: auto;
      transform: translateX(-50%);
      width: min(var(--focus-max), calc(100% - 80px));
      bottom: 24px;
    }
  }
}
</style>
