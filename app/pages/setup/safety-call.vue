<script setup lang="ts">
// 09 · Setup · Safety & Call: the last step, which opens the app.
definePageMeta({ layout: 'default' })

import { callSlots } from '~/data/onboarding'

const router = useRouter()
const store = useAppStore()

const allergies = ref(store.profile.value?.allergies ?? '')
const injuries = ref(store.profile.value?.injuries ?? '')
const callSlot = ref(store.profile.value?.callSlot ?? '')

const busy = ref(false)
const finish = async () => {
  busy.value = true
  await store.saveProfile({
    allergies: allergies.value.trim(),
    injuries: injuries.value.trim(),
    callSlot: callSlot.value,
  })
  await store.completeSetup()
  busy.value = false
  await router.push('/home')
}
</script>

<template>
  <SetupStepShell
    :step="4"
    :total="4"
    eyebrow="Personalise"
    title="Anything we should know?"
    subtitle="Allergies shape your food swaps. Injuries go straight to your coach, privately."
    cta="Save & enter app"
    :busy="busy"
    @continue="finish"
  >
    <AppCard variant="raised" class="form-card [display:flex] [flex-direction:column] [gap:20px]">
      <div>
        <span class="form-card__label [display:block] [font-family:var(--font-eyebrow)] [text-transform:uppercase] [letter-spacing:1px] [font-size:10px] [font-weight:700] [color:var(--violet-45)] [margin-bottom:10px]">Allergies / restrictions</span>
        <textarea
          v-model="allergies"
          class="area [width:100%] [padding:14px_16px] [background:var(--paper)] [border:1px_solid_var(--hairline)] [border-radius:var(--space-16)] [font-size:15px] [color:var(--ink)] [outline:none] [resize:none] [font-family:var(--font-body)] placeholder:[color:var(--text-placeholder)]"
          placeholder="e.g. dairy, shellfish"
          rows="2"
        />
      </div>

      <div>
        <span class="form-card__label [display:block] [font-family:var(--font-eyebrow)] [text-transform:uppercase] [letter-spacing:1px] [font-size:10px] [font-weight:700] [color:var(--violet-45)] [margin-bottom:10px]">Injuries / limitations · coach only</span>
        <textarea
          v-model="injuries"
          class="area [width:100%] [padding:14px_16px] [background:var(--paper)] [border:1px_solid_var(--hairline)] [border-radius:var(--space-16)] [font-size:15px] [color:var(--ink)] [outline:none] [resize:none] [font-family:var(--font-body)] placeholder:[color:var(--text-placeholder)]"
          placeholder="e.g. slight knee tenderness"
          rows="2"
        />
      </div>

      <div>
        <span class="form-card__label [display:block] [font-family:var(--font-eyebrow)] [text-transform:uppercase] [letter-spacing:1px] [font-size:10px] [font-weight:700] [color:var(--violet-45)] [margin-bottom:10px]">Preferred live call</span>
        <div class="slots [display:grid] [grid-template-columns:1fr_1fr] [gap:12px]">
          <button
            v-for="slot in callSlots"
            :key="slot.id"
            class="slot [height:52px] [border-radius:var(--space-16)] [background:var(--paper)] [box-shadow:inset_0_0_0_1px_var(--hairline)] [font-weight:700] [font-size:14px] [color:var(--ink)] [&.slot--active]:[background:var(--rose-softer)] [&.slot--active]:[box-shadow:inset_0_0_0_1.5px_var(--rose)] [&.slot--active]:[color:var(--rose)]"
            :class="{ 'slot--active': callSlot === slot.id }"
            @click="callSlot = slot.id"
          >
            {{ slot.label }}
          </button>
        </div>
      </div>
    </AppCard>
  </SetupStepShell>
</template>
