<script setup lang="ts">
// 19 · Rewards (+ 33 to 35 badge / leaderboard tabs, 37 to 40 rank states)
definePageMeta({ layout: 'app' })

import { badgeTierPoints, badges as badgeDefs, cohort, ranks } from '~/data/program'
import { QUALIFYING_SET_PERCENT } from '~/lib/domain/rewards'

const store = useAppStore()
const route = useRoute()

// Refreshed on load rather than pushed: the board only has to be right when
// someone is looking at it.
onMounted(() => store.refreshLeaderboard())

const tab = ref<'badges' | 'leaderboard'>(
  route.query.tab === 'leaderboard' ? 'leaderboard' : 'badges',
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

const initials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
</script>

<template>
  <div class="rewards [padding:var(--screen-pad-top)_20px_0] [display:flex] [flex-direction:column] [gap:16px] [&_.rewards__title]:[margin:8px_0_6px] [&_.rewards__sub]:[margin:0] [&_.rewards__sub]:[font-size:13.5px] [&_.rewards__sub]:[line-height:1.45] [&_.rewards__sub]:[max-width:320px] lg:[display:grid] lg:[grid-template-columns:minmax(0,_0.9fr)_minmax(0,_1.1fr)] lg:[grid-template-areas:'header_header'_'left_panel'] lg:[align-content:start] lg:[align-items:start] lg:[column-gap:24px] lg:[row-gap:18px] lg:[padding:0_0_8px] lg:[&_.rewards__sub]:[max-width:520px] lg:[&_.rewards__sub]:[font-size:15px]">
    <ScreenIntro
      :eyebrow="`${cohort.name} · rewards`"
      title="Your rewards"
      subtitle="RP for showing up, badges for milestones, a streak worth protecting."
      :actions="false"
      class="rewards__header lg:[grid-area:header]"
    />

    <div class="rewards__left [display:contents] lg:[grid-area:left] lg:[display:flex] lg:[flex-direction:column] lg:[gap:18px] lg:[align-self:start]">
      <!-- Rank -->
      <section class="rewards__rank">
      <AppCard variant="ink" class="rank [display:flex] [flex-direction:column] [gap:12px]">
        <div class="rank__top [display:flex] [align-items:center] [gap:14px]">
          <span class="rank__emoji [font-size:34px] [line-height:1]">{{ snapshot.rank.emoji }}</span>
          <div class="rank__id [display:flex] [flex-direction:column] [gap:2px]">
            <span class="rank__name [font-family:var(--font-display)] [font-weight:900] [font-size:18px] [color:var(--on-inverse)]">{{ snapshot.rank.name }}</span>
            <span class="rank__points data [font-size:26px] [font-weight:700] [line-height:1.1] [color:var(--on-inverse)] lg:[font-size:32px]">{{ snapshot.points }} RP</span>
          </div>
        </div>
        <ProgressBar :value="snapshot.rankProgress" :max="100" :height="6" flame />
        <p class="rank__next [margin:-4px_0_0] [font-size:12.5px] [color:var(--on-inverse-soft)]">{{ nextRankLabel }}</p>

        <ol class="rank__ladder [list-style:none] [margin:6px_0_0] [padding:12px_0_0] [border-top:1px_solid_var(--hairline-inverse)] [display:flex] [flex-direction:column] [gap:8px]">
          <li
            v-for="step in ranks"
            :key="step.id"
            class="rank__step [display:flex] [align-items:center] [gap:10px] [opacity:0.4] [&.rank__step--reached]:[opacity:1]"
            :class="{ 'rank__step--reached': snapshot.points >= step.minPoints }"
          >
            <span class="rank__step-emoji [font-size:15px] [line-height:1]">{{ step.emoji }}</span>
            <span class="rank__step-name [flex:1] [font-size:13px] [font-weight:600] [color:var(--on-inverse)]">{{ step.name }}</span>
            <span class="rank__step-rp data [font-size:11px] [color:var(--on-inverse-soft)]">{{ step.minPoints }}</span>
          </li>
        </ol>
      </AppCard>
    </section>

      <!-- Streak -->
      <section class="rewards__streak">
        <AppCard variant="raised" class="streak [display:flex] [align-items:center] [gap:14px]">
          <span class="streak__icon [width:44px] [height:44px] [border-radius:var(--radius-pill)] [background:var(--orange-16)] [color:var(--orange-text)] [display:grid] [place-items:center] [flex-shrink:0]"><AppIcon name="flame" :size="20" :stroke="2.2" /></span>
          <div>
            <h2 class="streak__title [margin:0_0_3px] [font-family:var(--font-display)] [font-weight:900] [font-size:16px] [color:var(--ink)]">{{ snapshot.streakWeeks }}-week streak</h2>
            <p class="streak__body [margin:0] [font-size:12.5px] [line-height:1.45] [color:var(--violet-45)]">
              One workout a week keeps it alive — finished sessions only, at
              least {{ QUALIFYING_SET_PERCENT }}% of the sets logged.
            </p>
          </div>
        </AppCard>
      </section>
    </div>

    <!-- Badges / leaderboard -->
    <!--
      These two really are tab panels, so they use shadcn's Tabs rather than the
      SegmentedTabs pill (which is a radio group). Reka wires `role="tablist"`,
      arrow-key movement between the triggers, and an `aria-labelledby` link
      from each panel back to the tab that opened it — none of which a pair of
      `v-if` blocks behind two plain buttons could express.
    -->
    <Tabs
      :model-value="tab"
      class="rewards__panel lg:[grid-area:panel]"
      @update:model-value="tab = $event as typeof tab"
    >
      <TabsList class="rewards__tabs [margin-bottom:16px]">
        <TabsTrigger v-for="t in tabs" :key="t.id" :value="t.id">
          {{ t.label }}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="badges">
        <div class="rewards__panel-head [display:flex] [align-items:center] [justify-content:space-between] [margin-bottom:10px]">
          <EyebrowLabel tone="muted">Badges</EyebrowLabel>
          <span class="rewards__count data [font-size:12px] [font-weight:700] [color:var(--rose)]">
            {{ snapshot.badgeCount }} of {{ snapshot.badgeTotal }}
          </span>
        </div>
        <div class="badges [display:flex] [flex-direction:column] [gap:10px]">
          <article
            v-for="badge in badgeRows"
            :key="badge.id"
            class="badge [display:flex] [align-items:center] [gap:12px] [padding:14px_16px] [border-radius:var(--radius-card)] [background:var(--paper-raised)] [border:1px_solid_var(--hairline)] [opacity:0.65] [&.badge--earned]:[opacity:1] [&.badge--earned]:[border-color:var(--rose-ring)]"
            :class="{ 'badge--earned': badge.earned }"
          >
            <span class="badge__emoji [font-size:24px] [line-height:1] [flex-shrink:0]">{{ badge.emoji }}</span>
            <div class="badge__text [flex:1] [min-width:0]">
              <h3 class="badge__name [margin:0_0_2px] [font-family:var(--font-display)] [font-weight:900] [font-size:14.5px] [color:var(--ink)]">{{ badge.name }}</h3>
              <p class="badge__desc [margin:0] [font-size:12.5px] [line-height:1.4] [color:var(--violet-45)]">{{ badge.description }}</p>
            </div>
            <span v-if="badge.earned" class="badge__earned [flex-shrink:0] [font-family:var(--font-data)] [text-transform:uppercase] [letter-spacing:0.85px] [font-size:8.5px] [font-weight:700] [color:var(--rose)] [background:var(--rose-soft)] [padding:4px_8px] [border-radius:var(--radius-pill)]">Earned</span>
            <span v-else class="badge__reward data [flex-shrink:0] [display:inline-flex] [align-items:center] [gap:5px] [font-size:11.5px] [font-weight:700] [color:var(--violet-45)]">
              +{{ badge.points }}
              <AppIcon name="lock" :size="13" />
            </span>
          </article>
        </div>
      </TabsContent>

      <TabsContent value="leaderboard">
        <div class="rewards__panel-head [display:flex] [align-items:center] [justify-content:space-between] [margin-bottom:10px]">
          <EyebrowLabel tone="muted">Sessions logged</EyebrowLabel>
          <span class="rewards__count data [font-size:12px] [font-weight:700] [color:var(--rose)]">{{ leaderboard.length }} members</span>
        </div>
        <ol class="board [list-style:none] [margin:0] [padding:0] [display:flex] [flex-direction:column] [gap:8px]">
          <li
            v-for="entry in leaderboard"
            :key="entry.memberId"
            class="board__row [display:flex] [align-items:center] [gap:12px] [padding:12px_14px] [border-radius:var(--radius-md)] [background:var(--paper-raised)] [&.board__row--self]:[background:var(--surface-inverse)] [&.board__row--self]:[color:var(--on-inverse)] [&.board__row--self_.board__rank]:[color:var(--on-inverse)] [&.board__row--self_.board__points]:[color:var(--on-inverse)]"
            :class="{ 'board__row--self': entry.isSelf }"
          >
            <span class="board__rank data [width:20px] [font-size:12px] [font-weight:700] [color:var(--violet-45)]">{{ entry.position }}</span>
            <Avatar size="sm" class="board__avatar [width:32px] [height:32px] [border-radius:50%] [object-fit:cover] [flex-shrink:0] [&.board__avatar--initials]:[display:grid] [&.board__avatar--initials]:[place-items:center] [&.board__avatar--initials]:[background:var(--rose-fill)] [&.board__avatar--initials]:[color:var(--on-rose)] [&.board__avatar--initials]:[font-family:var(--font-eyebrow)] [&.board__avatar--initials]:[font-size:11px] [&.board__avatar--initials]:[font-weight:700]">
              <AvatarImage :src="entry.avatarUrl ?? ''" :alt="entry.name" loading="lazy" />
              <AvatarFallback class="font-eyebrow font-bold">
                {{ initials(entry.name) }}
              </AvatarFallback>
            </Avatar>
            <span class="board__name [flex:1] [font-size:13.5px] [font-weight:600]">{{ entry.isSelf ? 'You' : entry.name }}</span>
            <span class="board__points data [font-size:12.5px] [font-weight:700] [color:var(--rose)]">
              {{ entry.sessions }} {{ entry.sessions === 1 ? 'session' : 'sessions' }}
            </span>
          </li>
        </ol>
      </TabsContent>
    </Tabs>
  </div>
</template>
