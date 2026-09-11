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

// Frozen for the write, released only if it fails — see `about-you`.
const busy = ref(false)
const error = ref('')
const next = async () => {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await store.saveProfile({
      activity: activity.value as ActivityLevel,
      goal: goal.value as Goal,
    })
    await router.push('/setup/safety-call')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not save that. Check your connection and try again.'
    busy.value = false
  }
}
</script>

<template>
  <SetupStepShell
    :step="3"
    :total="4"
    eyebrow="Your rhythm"
    title="What's your main focus this round?"
    subtitle="This just fine-tunes your daily numbers — everyone's doing the same challenge either way."
    :can-continue="canContinue"
    :busy="busy"
    :error="error"
    @continue="next"
  >
    <AppCard variant="raised" class="form-card flex flex-col gap-5.5">
      <div>
        <span class="form-card__label block font-eyebrow uppercase tracking-[1px] text-[10px] font-bold text-(--violet-45) mb-2.5">How active are your days?</span>
        <button
          class="dropdown w-full h-13 p-[0_16px] flex items-center justify-between [background:var(--paper)] [border:1px_solid_var(--hairline)] rounded-(--space-16) text-[15px] font-semibold text-(--ink) [&.dropdown--empty]:text-placeholder"
          :class="{ 'dropdown--empty': !activity }"
          @click="showActivity = true"
        >
          <span>{{ activityLabel }}</span>
          <AppIcon name="chevronDown" :size="18" />
        </button>
      </div>

      <div>
        <span class="form-card__label block font-eyebrow uppercase tracking-[1px] text-[10px] font-bold text-(--violet-45) mb-2.5">What are you here for?</span>
        <div class="goals flex flex-col gap-2.5">
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
      <div class="sheet-list flex flex-col gap-2.5">
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
