<script setup lang="ts">
// 19 · Rewards (+ 33 to 35 badge / leaderboard tabs, 37 to 40 rank states)
definePageMeta({ layout: 'app' })

import {
  badgeTierPoints,
  badges as badgeDefs,
  leaderboardRevealWeek,
  leaderboardVisible,
  ranks,
} from '~/data/program'
import { QUALIFYING_SET_PERCENT } from '~/lib/domain/rewards'

const store = useAppStore()
const route = useRoute()

/*
  The leaderboard is off for the opening weeks, and while it is off it does not
  exist on this screen — no tab, no placeholder, no padlock.

  A greyed-out "Leaderboard" tab would be worse than showing the board. It
  advertises that a ranking exists and invites people to wonder where they sit
  on it, which is precisely the competitive anticipation the delay is meant to
  avoid. Absent is the honest version of "we're not making this the point right
  now". The board is still computed and written throughout, so the week it is
  switched on it arrives with real history rather than starting from zero.
*/
const showLeaderboard = leaderboardVisible

// Refreshed on load rather than pushed: the board only has to be right when
// someone is looking at it.
onMounted(() => {
  if (showLeaderboard) store.refreshLeaderboard()
})

// Badges stay the default even after the board is revealed. Available to
// anybody curious, never the first thing a member lands on.
const tab = ref<'badges' | 'leaderboard'>(
  showLeaderboard && route.query.tab === 'leaderboard' ? 'leaderboard' : 'badges',
)
const tabs = [
  { id: 'badges', label: 'Badges' },
  { id: 'leaderboard', label: 'Leaderboard' },
]

const snapshot = computed(() => store.rewards.value)

const badgeRows = computed(() =>
  badgeDefs.map((badge) => ({
    ...badge,
    earned: Boolean(store.earnedBadges.value[badge.id]),
    points: badgeTierPoints[badge.tier],
  })),
)

const nextRankLabel = computed(() =>
  snapshot.value.nextRank
    ? `${snapshot.value.pointsToNextRank} RP to ${snapshot.value.nextRank.name}`
    : 'Top rank reached',
)

const leaderboard = computed(() => store.leaderboard.value)

/** Shown the first time the board appears, so it doesn't just turn up unannounced. */
const justRevealed = computed(
  () => showLeaderboard && store.clock.value.week <= leaderboardRevealWeek,
)

const initials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

const PANEL_LABEL = 'text-[13px] text-muted'
const PANEL_COUNT = 'text-[13px] text-rose tabular-nums'
</script>

<template>
  <div class="rewards p-[var(--screen-pad-top)_20px_0] flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:[grid-template-areas:'header_header'_'left_panel'] lg:content-start lg:items-start lg:gap-x-6 lg:gap-y-4.5 lg:p-[0_0_8px]">
    <!-- The "Cohort 01 · rewards" eyebrow is gone; the title says what this is. -->
    <ScreenIntro
      title="Your rewards"
      subtitle="RP for showing up, badges for milestones, a streak worth protecting."
      :actions="false"
      class="rewards__header lg:[grid-area:header]"
    />

    <div class="rewards__left contents lg:[grid-area:left] lg:flex lg:flex-col lg:gap-4.5 lg:self-start">
      <!-- Rank -->
      <section class="rewards__rank">
        <AppCard variant="ink" class="flex flex-col gap-3">
          <div class="flex items-center gap-3.5">
            <span class="text-[34px] leading-none">{{ snapshot.rank.emoji }}</span>
            <div class="flex flex-col gap-0.5">
              <span class="font-display text-[18px] font-black text-on-inverse">
                {{ snapshot.rank.name }}
              </span>
              <span class="text-[26px] leading-[1.1] font-bold text-on-inverse tabular-nums lg:text-[32px]">
                {{ snapshot.points }} RP
              </span>
            </div>
          </div>
          <ProgressBar :value="snapshot.rankProgress" :max="100" :height="6" flame />
          <p class="-mt-1 mb-0 text-[12.5px] text-on-inverse-soft">{{ nextRankLabel }}</p>

          <ol class="mt-1.5 flex list-none flex-col gap-2 border-t border-hairline-inverse p-[12px_0_0]">
            <li
              v-for="step in ranks"
              :key="step.id"
              class="flex items-center gap-2.5"
              :class="snapshot.points >= step.minPoints ? 'opacity-100' : 'opacity-40'"
            >
              <span class="text-[15px] leading-none">{{ step.emoji }}</span>
              <span class="flex-1 text-[13px] text-on-inverse">{{ step.name }}</span>
              <span class="text-[12px] text-on-inverse-soft tabular-nums">{{ step.minPoints }}</span>
            </li>
          </ol>
        </AppCard>
      </section>

      <!-- Streak -->
      <section class="rewards__streak">
        <AppCard variant="raised" class="flex items-center gap-3.5">
          <span class="grid size-11 shrink-0 place-items-center rounded-pill bg-rose-soft text-rose">
            <AppIcon name="flame" :size="20" :stroke="2.2" />
          </span>
          <div>
            <!-- "0-week streak" hyphenated a number to a noun and read as a
                 compound adjective with nothing to modify. -->
            <h2 class="m-[0_0_3px] font-display text-[16px] font-black text-ink">
              {{ snapshot.streakWeeks }} week streak
            </h2>
            <p class="m-0 text-[12.5px] leading-[1.45] text-muted">
              One workout a week keeps it alive. Finished sessions only, with at
              least {{ QUALIFYING_SET_PERCENT }}% of the sets logged.
            </p>
          </div>
        </AppCard>
      </section>
    </div>

    <div class="rewards__panel lg:[grid-area:panel]">
      <!--
        While the board is hidden there is no tab switcher at all: Rewards is
        badges and the streak card, and this renders as a plain section.
      -->
      <template v-if="!showLeaderboard">
        <div class="mb-2.5 flex items-center justify-between">
          <span :class="PANEL_LABEL">Badges</span>
          <span :class="PANEL_COUNT">{{ snapshot.badgeCount }} of {{ snapshot.badgeTotal }}</span>
        </div>
        <RewardBadgeGrid :badges="badgeRows" />
      </template>

      <!--
        Once it is on, these really are tab panels, so they use shadcn's Tabs
        rather than the SegmentedTabs pill (which is a radio group). Reka wires
        `role="tablist"`, arrow-key movement between the triggers, and an
        `aria-labelledby` link from each panel back to the tab that opened it.
      -->
      <Tabs
        v-else
        :model-value="tab"
        @update:model-value="tab = $event as typeof tab"
      >
        <TabsList class="mb-4">
          <TabsTrigger v-for="t in tabs" :key="t.id" :value="t.id">
            {{ t.label }}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="badges">
          <div class="mb-2.5 flex items-center justify-between">
            <span :class="PANEL_LABEL">Badges</span>
            <span :class="PANEL_COUNT">{{ snapshot.badgeCount }} of {{ snapshot.badgeTotal }}</span>
          </div>
          <RewardBadgeGrid :badges="badgeRows" />
        </TabsContent>

        <TabsContent value="leaderboard">
          <!-- The board doesn't get to appear silently the week it opens. -->
          <AppCard v-if="justRevealed" variant="raised" class="mb-3">
            <h3 class="m-[0_0_4px] font-display text-[15px] font-black text-ink">
              Curious how the cohort's doing? The leaderboard's live now.
            </h3>
            <p class="m-0 text-[12.5px] leading-[1.45] text-muted">
              Ranked by sessions logged, not by results. Everyone's recomp looks
              different.
            </p>
          </AppCard>

          <div class="mb-2.5 flex items-center justify-between">
            <span :class="PANEL_LABEL">Sessions logged</span>
            <span :class="PANEL_COUNT">{{ leaderboard.length }} members</span>
          </div>

          <ol class="m-0 flex list-none flex-col gap-2 p-0">
            <li
              v-for="entry in leaderboard"
              :key="entry.memberId"
              class="flex items-center gap-3 rounded-md p-[12px_14px]"
              :class="entry.isSelf ? 'bg-inverse text-on-inverse' : 'bg-raised text-ink'"
            >
              <span
                class="w-5 text-[13px] tabular-nums"
                :class="entry.isSelf ? 'text-on-inverse-soft' : 'text-muted'"
              >
                {{ entry.position }}
              </span>
              <Avatar size="sm" class="size-8 shrink-0 rounded-full object-cover">
                <AvatarImage :src="entry.avatarUrl ?? ''" :alt="entry.name" loading="lazy" />
                <AvatarFallback class="bg-rose-fill text-[11px] font-semibold text-on-rose">
                  {{ initials(entry.name) }}
                </AvatarFallback>
              </Avatar>
              <span class="flex-1 truncate text-[13.5px]">
                {{ entry.isSelf ? 'You' : entry.name }}
              </span>
              <span
                class="text-[13px] tabular-nums"
                :class="entry.isSelf ? 'text-on-inverse' : 'text-rose'"
              >
                {{ entry.sessions }} {{ entry.sessions === 1 ? 'session' : 'sessions' }}
              </span>
            </li>
          </ol>

          <p class="mt-3 mb-0 text-center text-[12px] leading-[1.45] text-muted">
            Ranked by sessions logged, not by results. Everyone's recomp looks
            different.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  </div>
</template>
