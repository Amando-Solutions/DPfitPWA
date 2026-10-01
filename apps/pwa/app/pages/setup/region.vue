<script setup lang="ts">
// Setup · Your region
definePageMeta({ layout: 'default' })

import { choiceOf, isCompleteChoice, type RegionChoice } from '~/lib/domain/region'

const router = useRouter()
const store = useAppStore()

/*
  The one setup answer that is not fixed once setup ends. The rest of setup is
  asked once; this one can be changed from Profile, because members travel —
  somebody based in the US flying home to Lagos for a cohort needs their days to
  follow them, and has to be able to say so before the trip.

  West Africa is preselected, and is what a member who never came here is on.
  Seeded from whatever is already stored, so backing out and returning is
  lossless.
*/
const choice = ref<RegionChoice>(choiceOf(store.member.value?.region))

const canContinue = computed(() => isCompleteChoice(choice.value))

/*
  Frozen for the whole write, like every step; `busy` is only put back on the
  failure path, because on the way through the next route replaces the screen.
*/
const busy = ref(false)
const error = ref('')
const next = async () => {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await store.setRegion({ ...choice.value })
    await router.push('/setup/body-metrics')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not save that. Check your connection and try again.'
    busy.value = false
  }
}
</script>

<template>
  <SetupStepShell
    :step="2"
    :total="4"
    back="/setup/about-you"
    eyebrow="Your region"
    title="Where are you training from?"
    subtitle="Each training day opens at midnight where you are. Travelling during the cohort? You can change this later in Profile."
    :can-continue="canContinue"
    :busy="busy"
    :error="error"
    @continue="next"
  >
    <AppCard variant="raised" class="form-card">
      <RegionPicker v-model="choice" />
    </AppCard>
  </SetupStepShell>
</template>
