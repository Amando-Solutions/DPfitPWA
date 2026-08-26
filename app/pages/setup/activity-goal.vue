<script setup lang="ts">
// 08 · Setup · Activity & Goal
definePageMeta({ layout: 'default' })

import { activityOptions, goalOptions } from '~/data/onboarding'
import type { ActivityLevel, Goal } from '~/data/types'

const router = useRouter()
const store = useAppStore()

const activity = ref<ActivityLevel | ''>(store.profile.value?.activity ?? '')
const goal = ref<Goal | ''>(store.profile.value?.goal ?? '')

const activityLabel = computed(
  () => activityOptions.find((a) => a.id === activity.value)?.label ?? 'Choose one',
)
const showActivity = ref(false)

const canContinue = computed(() => !!activity.value && !!goal.value)

const busy = ref(false)
const next = async () => {
  busy.value = true
  await store.saveProfile({
    activity: activity.value as ActivityLevel,
    goal: goal.value as Goal,
  })
  busy.value = false
  router.push('/setup/safety-call')
}
</script>

<template>
  <SetupStepShell
    :step="3"
    :total="4"
    eyebrow="Your rhythm"
    title="What's the finish line?"
    subtitle="Be honest rather than optimistic. You can adjust it any time."
    :can-continue="canContinue"
    :busy="busy"
    @continue="next"
  >
    <AppCard variant="raised" class="form-card [display:flex] [flex-direction:column] [gap:22px]">
      <div>
        <span class="form-card__label [display:block] [font-family:var(--font-eyebrow)] [text-transform:uppercase] [letter-spacing:1px] [font-size:10px] [font-weight:700] [color:var(--violet-45)] [margin-bottom:10px]">How active are your days?</span>
        <button
          class="dropdown [width:100%] [height:52px] [padding:0_16px] [display:flex] [align-items:center] [justify-content:space-between] [background:var(--paper)] [border:1px_solid_var(--hairline)] [border-radius:var(--space-16)] [font-size:15px] [font-weight:600] [color:var(--ink)] [&.dropdown--empty]:[color:var(--text-placeholder)]"
          :class="{ 'dropdown--empty': !activity }"
          @click="showActivity = true"
        >
          <span>{{ activityLabel }}</span>
          <AppIcon name="chevronDown" :size="18" />
        </button>
      </div>

      <div>
        <span class="form-card__label [display:block] [font-family:var(--font-eyebrow)] [text-transform:uppercase] [letter-spacing:1px] [font-size:10px] [font-weight:700] [color:var(--violet-45)] [margin-bottom:10px]">What are you here for?</span>
        <div class="goals [display:flex] [flex-direction:column] [gap:10px]">
          <OptionCard
            v-for="option in goalOptions"
            :key="option.id"
            :label="option.label"
            :desc="option.desc"
            :icon="option.icon"
            :selected="goal === option.id"
            @click="goal = option.id"
          />
        </div>
      </div>
    </AppCard>

    <BottomSheet v-model="showActivity" title="How active are your days?">
      <div class="sheet-list [display:flex] [flex-direction:column] [gap:10px]">
        <OptionCard
          v-for="option in activityOptions"
          :key="option.id"
          :label="option.label"
          :desc="option.desc"
          :selected="activity === option.id"
          @click="
            () => {
              activity = option.id
              showActivity = false
            }
          "
        />
      </div>
    </BottomSheet>
  </SetupStepShell>
</template>
