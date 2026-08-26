<script setup lang="ts">
// 07 · Setup · Body Metrics
definePageMeta({ layout: 'default' })

const router = useRouter()
const store = useAppStore()

const weightKg = ref<number | null>(store.profile.value?.weightKg ?? null)
const heightCm = ref<number | null>(store.profile.value?.heightCm ?? null)

const inRange = (value: number | null, min: number, max: number) =>
  value !== null && value >= min && value <= max

const canContinue = computed(
  () => inRange(weightKg.value, 30, 300) && inRange(heightCm.value, 100, 250),
)

const busy = ref(false)
const next = async () => {
  busy.value = true
  await store.saveProfile({
    weightKg: weightKg.value,
    heightCm: heightCm.value,
    // The weight they started at is fixed here, and every later check-in compares
    // against it rather than overwriting it.
    startWeightKg: store.profile.value?.startWeightKg ?? weightKg.value,
  })
  busy.value = false
  router.push('/setup/activity-goal')
}
</script>

<template>
  <SetupStepShell
    :step="2"
    :total="4"
    eyebrow="Your numbers"
    title="What's your starting point?"
    subtitle="Weight and height set your daily food targets. Nothing here is shared with the group."
    :can-continue="canContinue"
    :busy="busy"
    @continue="next"
  >
    <AppCard variant="raised" class="form-card [display:flex] [flex-direction:column] [gap:14px] [padding:19px]">
      <div class="form-card__row [display:grid] [grid-template-columns:1fr_1fr] [gap:12px]">
        <TextField v-model.number="weightKg" label="Weight (kg)" type="number" placeholder="63" />
        <TextField v-model.number="heightCm" label="Height (cm)" type="number" placeholder="164" />
      </div>

      <p class="form-card__tip [margin:0] [padding:13px_15px] [background:var(--paper)] [border-radius:var(--space-16)] [font-size:12.5px] [line-height:1.5] [color:var(--violet-28)]">
        These two numbers set your calorie and protein targets. Update them any time
        from Profile &amp; Settings, and your daily fuel recalculates itself.
      </p>
    </AppCard>
  </SetupStepShell>
</template>
