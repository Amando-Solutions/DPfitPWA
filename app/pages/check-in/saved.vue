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
  <div class="done [padding:var(--screen-pad-top)_20px_0] [min-height:100%] lg:[padding:0]">
    <div class="done__center [display:flex] [flex-direction:column] [align-items:center] [text-align:center] [gap:14px] [margin-top:32px] lg:[margin-top:24px] lg:[padding:48px_24px] lg:[background:var(--paper-raised)] lg:[border-radius:var(--radius-lg)] lg:[box-shadow:var(--shadow-card)]">
      <div class="done__check [width:96px] [height:96px] [border-radius:50%] [background:var(--rose-soft)] [color:var(--rose)] [display:grid] [place-items:center]">
        <AppIcon name="check" :size="34" :stroke="2.6" />
      </div>
      <h1 class="done__title [margin:0] [font-family:var(--font-display)] [font-weight:900] [font-size:26px] [color:var(--ink)]">Check-in sent</h1>
      <p class="done__desc [margin:0] [max-width:320px] [font-size:14px] [line-height:1.5] [color:var(--violet-45)]">
        Week {{ store.clock.value.week }} is with your coach. They’ll reply in Cohort Chat
        if anything needs adjusting.
      </p>

      <div class="done__chips [display:flex] [gap:8px]">
        <StatPill :value="`+${record?.rewardPoints ?? 0} RP`" variant="rose" />
        <StatPill
          :label="`${store.rewards.value.streakWeeks}-week streak`"
          icon="flame"
          variant="flame"
        />
      </div>

      <div v-if="record" class="done__summary [width:100%] [max-width:340px] [padding:8px_16px] [border-radius:var(--radius-card)] [background:var(--paper-raised)] [box-shadow:var(--shadow-card)]">
        <div class="done__row [display:flex] [align-items:center] [justify-content:space-between] [padding:9px_0] [font-size:13px] [color:var(--violet-45)] [&_+_.done__row]:[border-top:1px_solid_var(--hairline)] [&_.data]:[font-weight:700] [&_.data]:[color:var(--ink)]">
          <span>Workouts done</span><span class="data">{{ record.workoutsDone }}</span>
        </div>
        <div class="done__row [display:flex] [align-items:center] [justify-content:space-between] [padding:9px_0] [font-size:13px] [color:var(--violet-45)] [&_+_.done__row]:[border-top:1px_solid_var(--hairline)] [&_.data]:[font-weight:700] [&_.data]:[color:var(--ink)]">
          <span>Nutrition</span><span class="data">{{ record.nutritionPct }}%</span>
        </div>
        <div class="done__row [display:flex] [align-items:center] [justify-content:space-between] [padding:9px_0] [font-size:13px] [color:var(--violet-45)] [&_+_.done__row]:[border-top:1px_solid_var(--hairline)] [&_.data]:[font-weight:700] [&_.data]:[color:var(--ink)]">
          <span>Energy</span><span class="data">{{ record.energy }}/5</span>
        </div>
        <div class="done__row [display:flex] [align-items:center] [justify-content:space-between] [padding:9px_0] [font-size:13px] [color:var(--violet-45)] [&_+_.done__row]:[border-top:1px_solid_var(--hairline)] [&_.data]:[font-weight:700] [&_.data]:[color:var(--ink)]">
          <span>Training felt</span><span class="data">{{ feelLabel }}</span>
        </div>
      </div>

      <div class="done__actions [width:100%] [max-width:340px] [display:flex] [flex-direction:column] [gap:4px] [margin-top:4px]">
        <AppButton glow to="/home">Back to home</AppButton>
        <AppButton variant="ghost" to="/progress">Add a progress photo</AppButton>
      </div>
    </div>

    <BottomSheet v-model="showCelebration" title="Badge unlocked">
      <div v-if="celebrated" class="celebrate [display:flex] [flex-direction:column] [align-items:center] [text-align:center] [gap:10px]">
        <span class="celebrate__emoji [font-size:56px] [line-height:1]">{{ celebrated.emoji }}</span>
        <h2 class="celebrate__name [margin:0] [font-family:var(--font-display)] [font-weight:900] [font-size:22px] [color:var(--ink)]">{{ celebrated.name }}</h2>
        <p class="celebrate__desc [margin:0_0_8px] [font-size:14px] [color:var(--violet-45)]">{{ celebrated.description }}</p>
        <AppButton glow @click="showCelebration = false">Nice</AppButton>
      </div>
    </BottomSheet>
  </div>
</template>
