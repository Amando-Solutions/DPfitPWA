<script setup lang="ts">
// 06 · Setup · About You
definePageMeta({ layout: 'default' })

import { sexOptions } from '~/data/onboarding'
import type { Sex } from '~/data/types'

const router = useRouter()
const store = useAppStore()

// Seeded from whatever is already saved, so backing out and returning is lossless.
const displayName = ref(store.profile.value?.displayName ?? '')
const age = ref<number | null>(store.profile.value?.age ?? null)
const sex = ref<Sex | ''>(store.profile.value?.sex ?? '')

const canContinue = computed(
  () => displayName.value.trim().length > 1 && !!age.value && age.value > 12 && !!sex.value,
)

const busy = ref(false)
const next = async () => {
  busy.value = true
  await store.saveProfile({
    displayName: displayName.value.trim(),
    age: age.value,
    sex: sex.value as Sex,
  })
  busy.value = false
  router.push('/setup/body-metrics')
}
</script>

<template>
  <SetupStepShell
    :step="1"
    :total="4"
    eyebrow="About you"
    title="What should we call you?"
    subtitle="This name shows up in Cohort Chat and nowhere else."
    :can-continue="canContinue"
    :busy="busy"
    @continue="next"
  >
    <AppCard variant="raised" class="form-card flex flex-col gap-4">
      <TextField v-model="displayName" label="Display name" placeholder="Ada" />
      <TextField v-model.number="age" label="Age" type="number" placeholder="26" />
      <div>
        <span class="form-card__label block font-eyebrow uppercase tracking-[1px] text-[10px] font-bold text-muted mb-2.5">Sex</span>
        <SegmentedTabs v-model="sex" :tabs="sexOptions" />
        <p class="form-card__hint mt-2.5 mx-0 mb-0 text-[12.5px] text-muted">Used only to size your calorie baseline.</p>
      </div>
    </AppCard>
  </SetupStepShell>
</template>
