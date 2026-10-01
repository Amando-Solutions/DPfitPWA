<script setup lang="ts">
import type { Challenge } from '~/data/challenge'

const challenge = useChallenge()
const { data } = await useFetch<Challenge | null>('/api/challenge', { default: () => null })
challenge.value = data.value

// Refresh long-lived tabs, including after returning from checkout. Clear stale
// information on failure so a previous cohort never looks available to buy.
let timer: ReturnType<typeof setInterval> | undefined
let refreshing = false
let disposed = false
async function refreshChallenge() {
  if (refreshing || document.hidden) return
  refreshing = true
  try {
    const next = await $fetch<Challenge | null>('/api/challenge')
    if (!disposed) challenge.value = next
  } catch {
    if (!disposed) challenge.value = null
  } finally { refreshing = false }
}
onMounted(() => {
  void refreshChallenge()
  timer = setInterval(refreshChallenge, 60_000)
  document.addEventListener('visibilitychange', refreshChallenge)
})
onBeforeUnmount(() => {
  disposed = true
  clearInterval(timer)
  document.removeEventListener('visibilitychange', refreshChallenge)
})
</script>

<template>
  <!-- `id="top"` is the target of "back to top" and the header logo. -->
  <div id="top" class="w-full bg-lp-paper font-landing text-lp-ink antialiased">
    <CountdownBar />
    <SiteHeader />
    <main>
      <HeroSection />
      <CohortBanner />
      <ResultsSection />
      <ManifestoSection />
      <IncludedSection />
      <WeeksSection />
      <FitSection />
      <CoachSection />
      <RegisterSection />
      <FaqSection />
    </main>
    <SiteFooter />
    <MobileCta />
  </div>
</template>
