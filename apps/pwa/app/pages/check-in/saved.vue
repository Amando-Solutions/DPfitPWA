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
  <div class="done pt-(--screen-pad-top) px-5 pb-0 min-h-full lg:p-0">
    <div class="done__center flex flex-col items-center text-center gap-3.5 mt-8 lg:mt-6 lg:py-12 lg:px-6 lg:bg-raised lg:rounded-lg lg:shadow-card">
      <div class="done__check w-[96px] h-[96px] rounded-full bg-rose-soft text-rose grid place-items-center">
        <AppIcon name="check" :size="34" :stroke="2.6" />
      </div>
      <h1 class="done__title m-0 font-display font-black text-[26px] text-ink">Check-in sent</h1>
      <p class="done__desc m-0 max-w-[320px] text-[14px] leading-[1.5] text-muted">
        Week {{ store.clock.value.week }} is with your coach. They’ll reply in Cohort Chat
        if anything needs adjusting.
      </p>

      <div class="done__chips flex gap-2">
        <StatPill :value="`+${record?.rewardPoints ?? 0} RP`" variant="rose" />
        <StatPill
          :label="`${store.rewards.value.streakWeeks}-week streak`"
          icon="flame"
          variant="flame"
        />
      </div>

      <div v-if="record" class="done__summary w-full max-w-[340px] py-2 px-4 rounded-card bg-raised shadow-card">
        <div class="done__row flex items-center justify-between py-2.25 px-0 text-[13px] text-muted [&_+_.done__row]:border-t [&_+_.done__row]:border-hairline [&_.data]:font-bold [&_.data]:text-ink">
          <span>Workouts done</span><span class="data">{{ record.workoutsDone }}</span>
        </div>
        <div class="done__row flex items-center justify-between py-2.25 px-0 text-[13px] text-muted [&_+_.done__row]:border-t [&_+_.done__row]:border-hairline [&_.data]:font-bold [&_.data]:text-ink">
          <span>Nutrition</span><span class="data">{{ record.nutritionPct }}%</span>
        </div>
        <div class="done__row flex items-center justify-between py-2.25 px-0 text-[13px] text-muted [&_+_.done__row]:border-t [&_+_.done__row]:border-hairline [&_.data]:font-bold [&_.data]:text-ink">
          <span>Energy</span><span class="data">{{ record.energy }}/10</span>
        </div>
        <div class="done__row flex items-center justify-between py-2.25 px-0 text-[13px] text-muted [&_+_.done__row]:border-t [&_+_.done__row]:border-hairline [&_.data]:font-bold [&_.data]:text-ink">
          <span>Training felt</span><span class="data">{{ feelLabel }}</span>
        </div>
      </div>

      <div class="done__actions w-full max-w-[340px] flex flex-col gap-1 mt-1">
        <AppButton to="/home">Back to home</AppButton>
        <AppButton variant="ghost" to="/progress">Add a progress photo</AppButton>
      </div>
    </div>

    <BottomSheet v-model="showCelebration" title="Badge unlocked">
      <div v-if="celebrated" class="celebrate flex flex-col items-center text-center gap-2.5">
        <span class="celebrate__emoji text-[56px] leading-none">{{ celebrated.emoji }}</span>
        <h2 class="celebrate__name m-0 font-display font-black text-[22px] text-ink">{{ celebrated.name }}</h2>
        <p class="celebrate__desc mt-0 mx-0 mb-2 text-[14px] text-muted">{{ celebrated.description }}</p>
        <AppButton @click="showCelebration = false">Nice</AppButton>
      </div>
    </BottomSheet>
  </div>
</template>
