<script setup lang="ts">
// 09 · Setup · Safety & Call — the last step, which opens the app.
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
    <AppCard variant="raised" class="form-card">
      <div>
        <span class="form-card__label">Allergies / restrictions</span>
        <textarea
          v-model="allergies"
          class="area"
          placeholder="e.g. dairy, shellfish"
          rows="2"
        />
      </div>

      <div>
        <span class="form-card__label">Injuries / limitations · coach only</span>
        <textarea
          v-model="injuries"
          class="area"
          placeholder="e.g. slight knee tenderness"
          rows="2"
        />
      </div>

      <div>
        <span class="form-card__label">Preferred live call</span>
        <div class="slots">
          <button
            v-for="slot in callSlots"
            :key="slot.id"
            class="slot"
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

<style scoped lang="scss">
.form-card {
  display: flex;
  flex-direction: column;
  gap: 20px;

  &__label {
    display: block;
    font-family: var(--font-eyebrow);
    text-transform: uppercase;
    letter-spacing: 1px;
    font-size: 10px;
    font-weight: 700;
    color: var(--violet-45);
    margin-bottom: 10px;
  }
}
.area {
  width: 100%;
  padding: 14px 16px;
  background: var(--paper);
  border: 1px solid rgba(36, 27, 46, 0.11);
  border-radius: var(--space-16);
  font-size: 15px;
  color: var(--ink);
  outline: none;
  resize: none;
  font-family: var(--font-body);

  &::placeholder {
    color: rgba(36, 27, 46, 0.35);
  }
}
.slots {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.slot {
  height: 52px;
  border-radius: var(--space-16);
  background: var(--paper);
  box-shadow: inset 0 0 0 1px rgba(36, 27, 46, 0.11);
  font-weight: 700;
  font-size: 14px;
  color: var(--ink);

  &--active {
    background: rgba(200, 30, 92, 0.06);
    box-shadow: inset 0 0 0 1.5px var(--rose);
    color: var(--rose);
  }
}
</style>
