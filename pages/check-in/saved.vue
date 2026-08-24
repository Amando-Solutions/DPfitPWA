<script setup lang="ts">
// 22 · Weekly Check-in · Success
definePageMeta({ layout: 'app' })

import { trainingFeelOptions } from '~/data/program'
import type { BadgeDef } from '~/data/types'

const store = useAppStore()
const record = computed(() => store.currentCheckIn.value)

const feelLabel = computed(
  () =>
    trainingFeelOptions.find((o) => o.id === record.value?.trainingFeel)?.label ?? '-',
)

const celebrated = ref<BadgeDef | null>(null)
const showCelebration = ref(false)
onMounted(() => {
  const badge = store.consumePendingBadge()
  if (badge) {
    celebrated.value = badge
    showCelebration.value = true
  }
})
</script>

<template>
  <div class="done">
    <div class="done__center">
      <div class="done__check">
        <AppIcon name="check" :size="34" :stroke="2.6" />
      </div>
      <h1 class="done__title">Check-in sent</h1>
      <p class="done__desc">
        Week {{ store.clock.value.week }} is with your coach. They’ll reply in Cohort Chat
        if anything needs adjusting.
      </p>

      <div class="done__chips">
        <StatPill :value="`+${record?.rewardPoints ?? 0} RP`" variant="rose" />
        <StatPill
          :label="`${store.rewards.value.streakWeeks}-week streak`"
          icon="flame"
          variant="flame"
        />
      </div>

      <div v-if="record" class="done__summary">
        <div class="done__row">
          <span>Workouts done</span><span class="data">{{ record.workoutsDone }}</span>
        </div>
        <div class="done__row">
          <span>Nutrition</span><span class="data">{{ record.nutritionPct }}%</span>
        </div>
        <div class="done__row">
          <span>Energy</span><span class="data">{{ record.energy }}/5</span>
        </div>
        <div class="done__row">
          <span>Training felt</span><span class="data">{{ feelLabel }}</span>
        </div>
      </div>

      <div class="done__actions">
        <AppButton glow to="/home">Back to home</AppButton>
        <AppButton variant="ghost" to="/progress">Add a progress photo</AppButton>
      </div>
    </div>

    <BottomSheet v-model="showCelebration" title="Badge unlocked">
      <div v-if="celebrated" class="celebrate">
        <span class="celebrate__emoji">{{ celebrated.emoji }}</span>
        <h2 class="celebrate__name">{{ celebrated.name }}</h2>
        <p class="celebrate__desc">{{ celebrated.description }}</p>
        <AppButton glow @click="showCelebration = false">Nice</AppButton>
      </div>
    </BottomSheet>
  </div>
</template>

<style scoped lang="scss">
.done {
  padding: var(--screen-pad-top) 20px 0;
  min-height: 100%;

  &__center {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 14px;
    margin-top: 32px;
  }

  &__check {
    width: 96px;
    height: 96px;
    border-radius: 50%;
    background: var(--rose-soft);
    color: var(--rose);
    display: grid;
    place-items: center;
  }

  &__title {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 26px;
    color: var(--ink);
  }

  &__desc {
    margin: 0;
    max-width: 320px;
    font-size: 14px;
    line-height: 1.5;
    color: var(--violet-45);
  }

  &__chips {
    display: flex;
    gap: 8px;
  }

  &__summary {
    width: 100%;
    max-width: 340px;
    padding: 8px 16px;
    border-radius: var(--radius-card);
    background: var(--paper-raised);
    box-shadow: var(--shadow-card);
  }

  &__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 9px 0;
    font-size: 13px;
    color: var(--violet-45);

    & + & {
      border-top: 1px solid var(--hairline);
    }

    .data {
      font-weight: 700;
      color: var(--ink);
    }
  }

  &__actions {
    width: 100%;
    max-width: 340px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 4px;
  }
}

.celebrate {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;

  &__emoji {
    font-size: 56px;
    line-height: 1;
  }

  &__name {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 22px;
    color: var(--ink);
  }

  &__desc {
    margin: 0 0 8px;
    font-size: 14px;
    color: var(--violet-45);
  }
}

@media (min-width: 1024px) {
  .done {
    padding: 0;

    &__center {
      margin-top: 24px;
      padding: 48px 24px;
      background: var(--paper-raised);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-card);
    }
  }
}
</style>
