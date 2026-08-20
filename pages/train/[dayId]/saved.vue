<script setup lang="ts">
// 19 · Workout · Saved (+ 32 · Badge Celebration when one was just unlocked)
definePageMeta({ layout: 'app' })

import type { BadgeDef } from '~/data/types'
import { formatVolume, unitLabel } from '~/lib/domain/nutrition'

const router = useRouter()
const store = useAppStore()

const units = computed(() => store.settings.value.units)

// The log that was just written is the newest one.
const log = computed(() => store.sessions.value[0] ?? null)

const durationLabel = computed(() => {
  const total = log.value?.durationSeconds ?? 0
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}m ${s}s`
})

// A badge unlocked by this save gets its moment before we move on.
const celebrated = ref<BadgeDef | null>(null)
const showCelebration = ref(false)
onMounted(() => {
  const badge = store.consumePendingBadge()
  if (badge) {
    celebrated.value = badge
    showCelebration.value = true
  }
})

const back = () => router.push('/train')
</script>

<template>
  <div class="saved">
    <div class="saved__center">
      <div class="saved__check">
        <AppIcon name="check" :size="34" :stroke="2.6" />
      </div>
      <h1 class="saved__title">Workout saved</h1>
      <p v-if="log" class="saved__desc">
        {{ log.dayNumber ? `Day ${log.dayNumber} — ` : '' }}{{ log.label }} — done in
        {{ durationLabel }}.
        {{ log.proofPhoto ? 'Proof photo is with your coach.' : '' }}
      </p>

      <div class="saved__chips">
        <StatPill :value="`+${log?.rewardPoints ?? 0} RP`" variant="rose" />
        <StatPill
          :label="`${store.rewards.value.streakWeeks}-week streak`"
          icon="flame"
          variant="flame"
        />
      </div>

      <div class="saved__stats">
        <div class="saved__stat">
          <span class="saved__stat-value data">{{ log?.setsDone ?? 0 }}</span>
          <span class="saved__stat-label">Sets logged</span>
        </div>
        <div class="saved__stat">
          <span class="saved__stat-value data">
            {{ formatVolume(log?.volumeKg ?? 0, units) }}
          </span>
          <span class="saved__stat-label">Volume {{ unitLabel(units) }}</span>
        </div>
        <div class="saved__stat">
          <span class="saved__stat-value data">{{ store.rewards.value.points }}</span>
          <span class="saved__stat-label">Total RP</span>
        </div>
      </div>

      <div class="saved__actions">
        <AppButton glow @click="back">Back to workouts</AppButton>
        <AppButton variant="ghost" to="/rewards">See your rewards</AppButton>
      </div>
    </div>

    <BottomSheet v-model="showCelebration" title="Badge unlocked">
      <div v-if="celebrated" class="celebrate">
        <span class="celebrate__emoji">{{ celebrated.emoji }}</span>
        <h2 class="celebrate__name">{{ celebrated.name }}</h2>
        <p class="celebrate__desc">{{ celebrated.description }}</p>
        <AppButton glow @click="showCelebration = false">Nice</AppButton>
      </div>
    </BottomSheet>
  </div>
</template>

<style scoped lang="scss">
.saved {
  padding: var(--screen-pad-top) 20px 0;
  min-height: 100%;

  &__center {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 14px;
    margin-top: 32px;
  }

  &__check {
    width: 96px;
    height: 96px;
    border-radius: 50%;
    background: var(--rose-soft);
    color: var(--rose);
    display: grid;
    place-items: center;
    margin-bottom: 6px;
  }

  &__title {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 26px;
    color: var(--ink);
  }

  &__desc {
    margin: 0;
    max-width: 300px;
    font-size: 14px;
    line-height: 1.5;
    color: var(--violet-45);
  }

  &__chips {
    display: flex;
    gap: 8px;
    margin-top: 2px;
  }

  &__stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    width: 100%;
    max-width: 340px;
    margin: 10px 0 4px;
  }

  &__stat {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 14px 8px;
    border-radius: var(--radius-md);
    background: var(--paper-raised);
    box-shadow: var(--shadow-card);
  }

  &__stat-value {
    font-size: 18px;
    font-weight: 700;
    color: var(--ink);
  }

  &__stat-label {
    font-family: var(--font-eyebrow);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-size: 8px;
    font-weight: 700;
    color: var(--violet-45);
  }

  &__actions {
    width: 100%;
    max-width: 340px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 8px;
  }
}

.celebrate {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;

  &__emoji {
    font-size: 56px;
    line-height: 1;
  }

  &__name {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 22px;
    color: var(--ink);
  }

  &__desc {
    margin: 0 0 8px;
    font-size: 14px;
    color: var(--violet-45);
  }
}

@media (min-width: 1024px) {
  .saved {
    padding: 0;

    &__center {
      margin-top: 24px;
      padding: 48px 24px;
      background: var(--paper-raised);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-card);
    }

    &__desc {
      max-width: 420px;
      font-size: 15px;
    }
  }
}
</style>
