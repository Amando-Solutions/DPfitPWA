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
  <div class="checkin pt-(--screen-pad-top) px-5 pb-0 [&_.checkin__title]:mt-1.25 [&_.checkin__title]:mx-0 [&_.checkin__title]:mb-0 [&_.checkin__title]:font-display [&_.checkin__title]:font-black [&_.checkin__title]:text-[24px] [&_.checkin__title]:leading-[1.08] [&_.checkin__title]:tracking-[-0.48px] [&_.checkin__title]:text-ink [&_.checkin__sub]:mt-0.75 [&_.checkin__sub]:mx-0 [&_.checkin__sub]:mb-0 [&_.checkin__sub]:text-[13.5px] [&_.checkin__sub]:leading-[1.45] [&_.checkin__sub]:text-soft lg:p-0 lg:max-w-[640px] lg:[&_.checkin__title]:text-[30px] lg:[&_.checkin__sub]:text-[15px]">
    <!-- No berry eyebrow: the week is already in the line below the title, and
         a pink label above every heading stops meaning anything. -->
    <ScreenIntro
      title="How was your week?"
      :subtitle="`Week ${store.clock.value.week}. One quick form covers how the week went and how training felt.`"
      :actions="false"
      class="checkin__header"
    />

    <span class="checkin__stamp inline-block my-3.5 mx-0 py-2 px-3.25 border border-dashed border-hairline-strong rounded-pill bg-surface text-[12px] text-soft">
      Stamped automatically · week {{ store.clock.value.week }}
    </span>

    <form class="checkin__card flex flex-col gap-3 p-4.5 bg-raised border border-hairline rounded-card filter-(--drop-md) lg:p-6 lg:gap-4" @submit.prevent="submit">
      <div class="checkin__row grid grid-cols-[1fr_1fr] gap-3">
        <NumberStepper v-model="workoutsDone" label="Workouts done" :max="14" />
        <NumberStepper v-model="nutritionPct" label="Nutrition (%)" :max="100" :step="5" />
      </div>

      <ScaleField
        v-model="energy"
        label="Energy this week"
        low-label="Running on empty"
        high-label="Full tank"
      />

      <div class="checkin__field flex flex-col">
        <span class="checkin__label text-[13px] text-soft pb-2">How did training feel?</span>
        <button
          type="button"
          class="checkin__select w-full h-12.5 py-0 px-3.75 flex items-center justify-between gap-2.5 bg-surface border border-hairline rounded-(--space-16) font-body text-[15px] text-ink text-left [&.checkin__select--empty]:text-placeholder"
          :class="{ 'checkin__select--empty': !trainingFeel }"
          @click="showFeel = true"
        >
          <span>{{ feelLabel }}</span>
          <AppIcon name="chevronDown" :size="18" />
        </button>
      </div>

      <div class="checkin__field flex flex-col">
        <label class="checkin__label text-[13px] text-soft pb-2" for="pain">Pain or discomfort</label>
        <textarea id="pain" v-model="pain" class="checkin__area w-full py-3.5 px-3.75 bg-surface border border-hairline rounded-(--space-16) font-body text-[13.5px] leading-[1.45] text-ink outline-none resize-none placeholder:text-placeholder focus:border-rose" placeholder="none" rows="2" />
      </div>

      <div class="checkin__field flex flex-col">
        <label class="checkin__label text-[13px] text-soft pb-2" for="note">Anything else for Coach (optional)</label>
        <textarea
          id="note"
          v-model="note"
          class="checkin__area w-full py-3.5 px-3.75 bg-surface border border-hairline rounded-(--space-16) font-body text-[13.5px] leading-[1.45] text-ink outline-none resize-none placeholder:text-placeholder focus:border-rose"
          placeholder="Say something"
          rows="2"
        />
      </div>

      <!-- `type="submit"`, and no `@click`: this is inside a form whose
           `@submit.prevent` already calls `submit`, and a button carrying both
           ran it twice on every click. -->
      <AppButton type="submit" :disabled="!canSubmit || saving">
        {{ saving ? 'Submitting…' : existing ? 'Update check-in' : 'Submit check-in' }}
      </AppButton>
      <p v-if="!canSubmit" class="checkin__hint m-0 text-center text-[12px] text-muted">
        Rate your energy and how training felt to submit.
      </p>
    </form>

    <BottomSheet v-model="showFeel" title="How did training feel?">
      <div class="checkin__options flex flex-col gap-2.5">
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
