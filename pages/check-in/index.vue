<script setup lang="ts">
// 21 · Weekly Check-in
definePageMeta({ layout: 'app' })

import { trainingFeelOptions } from '~/data/program'
import type { TrainingFeel } from '~/data/types'

const router = useRouter()
const store = useAppStore()

const existing = computed(() => store.currentCheckIn.value)

// Prefill from a previous submission for this week, otherwise from what we
// already know: the sessions they've actually logged.
const workoutsDone = ref(existing.value?.workoutsDone ?? store.sessionsThisWeek.value.length)
const nutritionPct = ref(existing.value?.nutritionPct ?? 80)
const energy = ref<number | null>(existing.value?.energy ?? null)
const trainingFeel = ref<TrainingFeel | null>(existing.value?.trainingFeel ?? null)
const showFeel = ref(false)
const feelLabel = computed(
  () => trainingFeelOptions.find((o) => o.id === trainingFeel.value)?.label ?? 'Choose one',
)
const pain = ref(existing.value?.pain ?? '')
const note = ref(existing.value?.note ?? '')

const canSubmit = computed(() => energy.value !== null && trainingFeel.value !== null)

const saving = ref(false)
const submit = async () => {
  if (!canSubmit.value || saving.value) return
  saving.value = true
  await store.saveCheckIn({
    workoutsDone: workoutsDone.value,
    nutritionPct: nutritionPct.value,
    energy: energy.value,
    trainingFeel: trainingFeel.value,
    pain: pain.value.trim(),
    note: note.value.trim(),
  })
  saving.value = false
  router.replace('/check-in/saved')
}
</script>

<template>
  <div class="checkin">
    <ScreenIntro
      :eyebrow="`Week ${store.clock.value.week} · check-in`"
      title="How was your week?"
      subtitle="One quick form covers how the week went and how training felt."
      :actions="false"
      class="checkin__header"
    />

    <span class="checkin__stamp data">
      Stamped automatically · W{{ store.clock.value.week }}
    </span>

    <form class="checkin__card" @submit.prevent="submit">
      <div class="checkin__row">
        <NumberStepper v-model="workoutsDone" label="Workouts done" :max="14" />
        <NumberStepper v-model="nutritionPct" label="Nutrition (%)" :max="100" :step="5" />
      </div>

      <ScaleField v-model="energy" label="Energy this week" />

      <div class="checkin__field">
        <span class="checkin__label">How did training feel?</span>
        <button
          type="button"
          class="checkin__select"
          :class="{ 'checkin__select--empty': !trainingFeel }"
          @click="showFeel = true"
        >
          <span>{{ feelLabel }}</span>
          <AppIcon name="chevronDown" :size="18" />
        </button>
      </div>

      <div class="checkin__field">
        <label class="checkin__label" for="pain">Pain or discomfort</label>
        <textarea id="pain" v-model="pain" class="checkin__area" placeholder="none" rows="2" />
      </div>

      <div class="checkin__field">
        <label class="checkin__label" for="note">Anything else for Coach (optional)</label>
        <textarea
          id="note"
          v-model="note"
          class="checkin__area"
          placeholder="Say something"
          rows="2"
        />
      </div>

      <AppButton glow :disabled="!canSubmit || saving" @click="submit">
        {{ saving ? 'Submitting…' : existing ? 'Update check-in' : 'Submit check-in' }}
      </AppButton>
      <p v-if="!canSubmit" class="checkin__hint">
        Rate your energy and how training felt to submit.
      </p>
    </form>

    <BottomSheet v-model="showFeel" title="How did training feel?">
      <div class="checkin__options">
        <OptionCard
          v-for="option in trainingFeelOptions"
          :key="option.id"
          :label="option.label"
          :desc="option.desc"
          :selected="trainingFeel === option.id"
          @click="
            () => {
              trainingFeel = option.id
              showFeel = false
            }
          "
        />
      </div>
    </BottomSheet>
  </div>
</template>

<style scoped lang="scss">
.checkin {
  padding: var(--screen-pad-top) 20px 0;

  &__title {
    margin: 5px 0 0;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 24px;
    line-height: 1.08;
    letter-spacing: -0.48px;
    color: var(--ink);
  }

  &__sub {
    margin: 3px 0 0;
    font-size: 13.5px;
    line-height: 1.45;
    color: var(--violet-28);
  }

  &__stamp {
    display: inline-block;
    margin: 12px 0 14px;
    padding: 8px 13px;
    border: 1px dashed var(--hairline-strong);
    border-radius: var(--radius-pill);
    background: var(--paper);
    text-transform: uppercase;
    letter-spacing: 0.855px;
    font-size: 9.5px;
    font-weight: 700;
    color: var(--violet-28);
  }

  &__card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 18px;
    background: var(--paper-raised);
    border: 1px solid var(--hairline);
    border-radius: var(--radius-card);
    filter: var(--drop-md);
  }

  &__row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  &__field {
    display: flex;
    flex-direction: column;
  }

  &__label {
    font-family: var(--font-data);
    text-transform: uppercase;
    letter-spacing: 0.81px;
    font-size: 9px;
    color: var(--violet-28);
    padding-bottom: 6px;
  }

  &__area {
    width: 100%;
    padding: 14px 15px;
    background: var(--paper);
    border: 1px solid var(--hairline);
    border-radius: var(--space-16);
    font-family: var(--font-body);
    font-size: 13.5px;
    line-height: 1.45;
    color: var(--ink);
    outline: none;
    resize: none;

    &::placeholder {
      color: var(--text-placeholder);
    }

    &:focus {
      border-color: var(--rose);
    }
  }

  &__select {
    width: 100%;
    height: 50px;
    padding: 0 15px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    background: var(--paper);
    border: 1px solid var(--hairline);
    border-radius: var(--space-16);
    font-family: var(--font-body);
    font-size: 15px;
    color: var(--ink);
    text-align: left;

    &--empty {
      color: var(--text-placeholder);
    }
  }

  &__options {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  &__hint {
    margin: 0;
    text-align: center;
    font-size: 12px;
    color: var(--violet-45);
  }
}

@media (min-width: 1024px) {
  .checkin {
    padding: 0;
    max-width: 640px;

    &__title {
      font-size: 30px;
    }

    &__sub {
      font-size: 15px;
    }

    &__card {
      padding: 24px;
      gap: 16px;
    }
  }
}
</style>
