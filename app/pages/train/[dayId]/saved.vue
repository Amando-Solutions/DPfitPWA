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
  <div class="saved [padding:var(--screen-pad-top)_20px_0] [min-height:100%] lg:[padding:0]">
    <div class="saved__center [display:flex] [flex-direction:column] [align-items:center] [text-align:center] [gap:14px] [margin-top:32px] lg:[margin-top:24px] lg:[padding:48px_24px] lg:[background:var(--paper-raised)] lg:[border-radius:var(--radius-lg)] lg:[box-shadow:var(--shadow-card)]">
      <div class="saved__check [width:96px] [height:96px] [border-radius:50%] [background:var(--rose-soft)] [color:var(--rose)] [display:grid] [place-items:center] [margin-bottom:6px]">
        <AppIcon name="check" :size="34" :stroke="2.6" />
      </div>
      <h1 class="saved__title [margin:0] [font-family:var(--font-display)] [font-weight:900] [font-size:26px] [color:var(--ink)]">Workout saved</h1>
      <p v-if="log" class="saved__desc [margin:0] [max-width:300px] [font-size:14px] [line-height:1.5] [color:var(--violet-45)] lg:[max-width:420px] lg:[font-size:15px]">
        {{ log.dayNumber ? `Day ${log.dayNumber}: ` : '' }}{{ log.label }}, done in
        {{ durationLabel }}.
        {{ log.proofPhoto ? 'Proof photo is with your coach.' : '' }}
      </p>

      <div class="saved__chips [display:flex] [gap:8px] [margin-top:2px]">
        <StatPill :value="`+${log?.rewardPoints ?? 0} RP`" variant="rose" />
        <StatPill
          :label="`${store.rewards.value.streakWeeks}-week streak`"
          icon="flame"
          variant="flame"
        />
      </div>

      <p v-if="!counted" class="saved__short [margin:0] [max-width:320px] [padding:10px_14px] [border-radius:var(--radius-md)] [background:var(--orange-16)] [font-size:12.5px] [line-height:1.45] [color:var(--orange-text)]">
        Saved for your coach, but under {{ QUALIFYING_SET_PERCENT }}% of the sets —
        so it earns no RP and doesn’t count toward badges, your streak or the
        leaderboard.
      </p>

      <div class="saved__stats [display:grid] [grid-template-columns:repeat(3,_1fr)] [gap:10px] [width:100%] [max-width:340px] [margin:10px_0_4px]">
        <div class="saved__stat [display:flex] [flex-direction:column] [gap:4px] [padding:14px_8px] [border-radius:var(--radius-md)] [background:var(--paper-raised)] [box-shadow:var(--shadow-card)]">
          <span class="saved__stat-value data [font-size:18px] [font-weight:700] [color:var(--ink)]">{{ log?.setsDone ?? 0 }}</span>
          <span class="saved__stat-label [font-family:var(--font-eyebrow)] [text-transform:uppercase] [letter-spacing:0.5px] [font-size:8px] [font-weight:700] [color:var(--violet-45)]">Sets logged</span>
        </div>
        <div class="saved__stat [display:flex] [flex-direction:column] [gap:4px] [padding:14px_8px] [border-radius:var(--radius-md)] [background:var(--paper-raised)] [box-shadow:var(--shadow-card)]">
          <span class="saved__stat-value data [font-size:18px] [font-weight:700] [color:var(--ink)]">
            {{ formatVolume(log?.volumeKg ?? 0, units) }}
          </span>
          <span class="saved__stat-label [font-family:var(--font-eyebrow)] [text-transform:uppercase] [letter-spacing:0.5px] [font-size:8px] [font-weight:700] [color:var(--violet-45)]">Volume {{ unitLabel(units) }}</span>
        </div>
        <div class="saved__stat [display:flex] [flex-direction:column] [gap:4px] [padding:14px_8px] [border-radius:var(--radius-md)] [background:var(--paper-raised)] [box-shadow:var(--shadow-card)]">
          <span class="saved__stat-value data [font-size:18px] [font-weight:700] [color:var(--ink)]">{{ store.rewards.value.points }}</span>
          <span class="saved__stat-label [font-family:var(--font-eyebrow)] [text-transform:uppercase] [letter-spacing:0.5px] [font-size:8px] [font-weight:700] [color:var(--violet-45)]">Total RP</span>
        </div>
      </div>

      <div class="saved__actions [width:100%] [max-width:340px] [display:flex] [flex-direction:column] [gap:4px] [margin-top:8px]">
        <AppButton glow @click="back">Back to workouts</AppButton>
        <AppButton variant="ghost" to="/rewards">See your rewards</AppButton>
      </div>
    </div>

    <BottomSheet v-model="showCelebration" title="Badge unlocked">
      <div v-if="celebrated" class="celebrate [display:flex] [flex-direction:column] [align-items:center] [text-align:center] [gap:10px]">
        <span class="celebrate__emoji [font-size:56px] [line-height:1]">{{ celebrated.emoji }}</span>
        <h2 class="celebrate__name [margin:0] [font-family:var(--font-display)] [font-weight:900] [font-size:22px] [color:var(--ink)]">{{ celebrated.name }}</h2>
        <p class="celebrate__desc [margin:0_0_8px] [font-size:14px] [color:var(--violet-45)]">{{ celebrated.description }}</p>
        <AppButton glow @click="showCelebration = false">Nice</AppButton>
      </div>
    </BottomSheet>
  </div>
</template>
