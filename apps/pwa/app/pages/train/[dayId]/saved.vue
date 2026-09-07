<script setup lang="ts">
// 19 · Workout · Saved (+ 32 · Badge Celebration when one was just unlocked)
definePageMeta({ layout: 'app' })

import type { BadgeDef } from '~/data/types'
import { formatVolume, unitLabel } from '~/lib/domain/nutrition'
import { QUALIFYING_SET_PERCENT, isQualifying } from '~/lib/domain/rewards'

const router = useRouter()
const store = useAppStore()

const units = computed(() => store.prefs.value.units)

// The log that was just written is the newest one.
const log = computed(() => store.sessions.value[0] ?? null)

/** A short session saves in full, it just doesn't count. Say so plainly. */
const counted = computed(() => (log.value ? isQualifying(log.value) : true))

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
  <div class="saved pt-(--screen-pad-top) px-5 pb-0 min-h-full lg:p-0">
    <div class="saved__center flex flex-col items-center text-center gap-3.5 mt-8 lg:mt-6 lg:py-12 lg:px-6 lg:bg-raised lg:rounded-lg lg:shadow-card">
      <div class="saved__check w-[96px] h-[96px] rounded-full bg-rose-soft text-rose grid place-items-center mb-1.5">
        <AppIcon name="check" :size="34" :stroke="2.6" />
      </div>
      <h1 class="saved__title m-0 font-display font-black text-[26px] text-ink">Workout saved</h1>
      <p v-if="log" class="saved__desc m-0 max-w-[300px] text-[14px] leading-[1.5] text-muted lg:max-w-[420px] lg:text-[15px]">
        {{ log.dayNumber ? `Day ${log.dayNumber}: ` : '' }}{{ log.label }}, done in
        {{ durationLabel }}.
        {{ log.proofPhoto ? 'Proof photo is with your coach.' : '' }}
      </p>

      <div class="saved__chips flex gap-2 mt-0.5">
        <StatPill :value="`+${log?.rewardPoints ?? 0} RP`" variant="rose" />
        <StatPill
          :label="`${store.rewards.value.streakWeeks} week streak`"
          icon="flame"
          variant="rose"
        />
      </div>

      <p v-if="!counted" class="saved__short m-0 max-w-[320px] py-2.5 px-3.5 rounded-md bg-sunken shadow-[inset_0_0_0_1px_var(--hairline)] text-[12.5px] leading-[1.45] text-soft">
        Saved for your coach, but under {{ QUALIFYING_SET_PERCENT }}% of the sets —
        so it earns no RP and doesn’t count toward badges, your streak or the
        leaderboard.
      </p>

      <div class="saved__stats grid grid-cols-[repeat(3,_1fr)] gap-2.5 w-full max-w-[340px] mt-2.5 mx-0 mb-1">
        <div class="saved__stat flex flex-col gap-1 py-3.5 px-2 rounded-md bg-raised shadow-card">
          <span class="saved__stat-value tabular-nums text-[18px] font-bold text-ink">{{ log?.setsDone ?? 0 }}</span>
          <span class="saved__stat-label text-[11.5px] text-muted">Sets logged</span>
        </div>
        <div class="saved__stat flex flex-col gap-1 py-3.5 px-2 rounded-md bg-raised shadow-card">
          <span class="saved__stat-value tabular-nums text-[18px] font-bold text-ink">
            {{ formatVolume(log?.volumeKg ?? 0, units) }}
          </span>
          <span class="saved__stat-label text-[11.5px] text-muted">Volume {{ unitLabel(units) }}</span>
        </div>
        <div class="saved__stat flex flex-col gap-1 py-3.5 px-2 rounded-md bg-raised shadow-card">
          <span class="saved__stat-value tabular-nums text-[18px] font-bold text-ink">{{ store.rewards.value.points }}</span>
          <span class="saved__stat-label text-[11.5px] text-muted">Total RP</span>
        </div>
      </div>

      <div class="saved__actions w-full max-w-[340px] flex flex-col gap-1 mt-2">
        <AppButton @click="back">Back to workouts</AppButton>
        <AppButton variant="ghost" to="/rewards">See your rewards</AppButton>
      </div>
    </div>

    <BottomSheet v-model="showCelebration" title="Badge unlocked">
      <div v-if="celebrated" class="celebrate flex flex-col items-center text-center gap-2.5">
        <span class="celebrate__emoji text-[56px] leading-none">{{ celebrated.emoji }}</span>
        <h2 class="celebrate__name m-0 font-display font-black text-[22px] text-ink">{{ celebrated.name }}</h2>
        <p class="celebrate__desc mt-0 mx-0 mb-2 text-[14px] text-muted">{{ celebrated.description }}</p>
        <AppButton @click="showCelebration = false">Nice</AppButton>
      </div>
    </BottomSheet>
  </div>
</template>
