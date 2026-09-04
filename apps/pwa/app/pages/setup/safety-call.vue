<script setup lang="ts">
// 09 · Setup · Safety: the last step, which opens the app.
definePageMeta({ layout: 'default' })

const router = useRouter()
const store = useAppStore()

const healthConditions = ref(store.profile.value?.healthConditions ?? '')
const injuries = ref(store.profile.value?.injuries ?? '')

const busy = ref(false)
const finish = async () => {
  busy.value = true
  await store.saveProfile({
    healthConditions: healthConditions.value.trim(),
    injuries: injuries.value.trim(),
  })
  await store.completeSetup()
  busy.value = false
  await router.push('/home')
}

const LABEL = 'mb-2.5 block text-[13px] text-soft'
const AREA =
  'w-full resize-none rounded-2xl border border-hairline bg-sunken p-[14px_16px] font-body text-[15px] text-ink outline-none focus:border-rose placeholder:text-placeholder'
</script>

<template>
  <SetupStepShell
    :step="4"
    :total="4"
    eyebrow="Personalise"
    title="Anything we should know?"
    subtitle="Health conditions shape your food swaps. Injuries go straight to your coach, privately."
    cta="Save & enter app"
    :busy="busy"
    @continue="finish"
  >
    <AppCard variant="raised" class="flex flex-col gap-5">
      <div>
        <label :class="LABEL" for="health">Health conditions</label>
        <textarea
          id="health"
          v-model="healthConditions"
          :class="AREA"
          placeholder="e.g. asthma, lactose intolerance, iron deficiency"
          rows="2"
        />
      </div>

      <div>
        <label :class="LABEL" for="injuries">Injuries or limitations · coach only</label>
        <textarea
          id="injuries"
          v-model="injuries"
          :class="AREA"
          placeholder="e.g. slight knee tenderness"
          rows="2"
        />
      </div>
    </AppCard>
  </SetupStepShell>
</template>
