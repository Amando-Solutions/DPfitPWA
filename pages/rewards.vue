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
  <div class="rewards">
    <ScreenIntro
      :eyebrow="`${cohort.name} · rewards`"
      title="Your rewards"
      subtitle="RP for showing up, badges for milestones, a streak worth protecting."
      :actions="false"
      class="rewards__header"
    />

    <div class="rewards__left">
      <!-- Rank -->
      <section class="rewards__rank">
      <AppCard variant="ink" class="rank">
        <div class="rank__top">
          <span class="rank__emoji">{{ snapshot.rank.emoji }}</span>
          <div class="rank__id">
            <span class="rank__name">{{ snapshot.rank.name }}</span>
            <span class="rank__points data">{{ snapshot.points }} RP</span>
          </div>
        </div>
        <ProgressBar :value="snapshot.rankProgress" :max="100" :height="6" flame />
        <p class="rank__next">{{ nextRankLabel }}</p>

        <ol class="rank__ladder">
          <li
            v-for="step in ranks"
            :key="step.id"
            class="rank__step"
            :class="{ 'rank__step--reached': snapshot.points >= step.minPoints }"
          >
            <span class="rank__step-emoji">{{ step.emoji }}</span>
            <span class="rank__step-name">{{ step.name }}</span>
            <span class="rank__step-rp data">{{ step.minPoints }}</span>
          </li>
        </ol>
      </AppCard>
    </section>

      <!-- Streak -->
      <section class="rewards__streak">
        <AppCard variant="raised" class="streak">
          <span class="streak__icon"><AppIcon name="flame" :size="20" :stroke="2.2" /></span>
          <div>
            <h2 class="streak__title">{{ snapshot.streakWeeks }}-week streak</h2>
            <p class="streak__body">
              One workout a week keeps it alive — finished sessions only, at
              least {{ QUALIFYING_SET_PERCENT }}% of the sets logged.
            </p>
          </div>
        </AppCard>
      </section>
    </div>

    <!-- Badges / leaderboard -->
    <section class="rewards__panel">
      <SegmentedTabs v-model="tab" :tabs="tabs" class="rewards__tabs" />

      <template v-if="tab === 'badges'">
        <div class="rewards__panel-head">
          <EyebrowLabel tone="muted">Badges</EyebrowLabel>
          <span class="rewards__count data">
            {{ snapshot.badgeCount }} of {{ snapshot.badgeTotal }}
          </span>
        </div>
        <div class="badges">
          <article
            v-for="badge in badgeRows"
            :key="badge.id"
            class="badge"
            :class="{ 'badge--earned': badge.earned }"
          >
            <span class="badge__emoji">{{ badge.emoji }}</span>
            <div class="badge__text">
              <h3 class="badge__name">{{ badge.name }}</h3>
              <p class="badge__desc">{{ badge.description }}</p>
            </div>
            <span v-if="badge.earned" class="badge__earned">Earned</span>
            <span v-else class="badge__reward data">
              +{{ badge.points }}
              <AppIcon name="lock" :size="13" />
            </span>
          </article>
        </div>
      </template>

      <template v-else>
        <div class="rewards__panel-head">
          <EyebrowLabel tone="muted">Sessions logged</EyebrowLabel>
          <span class="rewards__count data">{{ leaderboard.length }} members</span>
        </div>
        <ol class="board">
          <li
            v-for="entry in leaderboard"
            :key="entry.memberId"
            class="board__row"
            :class="{ 'board__row--self': entry.isSelf }"
          >
            <span class="board__rank data">{{ entry.position }}</span>
            <img
              v-if="entry.avatar"
              :src="entry.avatar"
              :alt="entry.name"
              class="board__avatar"
              loading="lazy"
              decoding="async"
            />
            <span v-else class="board__avatar board__avatar--initials">
              {{ initials(entry.name) }}
            </span>
            <span class="board__name">{{ entry.isSelf ? 'You' : entry.name }}</span>
            <span class="board__points data">
              {{ entry.sessions }} {{ entry.sessions === 1 ? 'session' : 'sessions' }}
            </span>
          </li>
        </ol>
      </template>
    </section>
  </div>
</template>

<style scoped lang="scss">
.rewards {
  padding: var(--screen-pad-top) 20px 0;
  display: flex;
  flex-direction: column;
  gap: 16px;

  // Transparent on mobile so the cards keep their single-column order.
  &__left {
    display: contents;
  }

  &__title {
    margin: 8px 0 6px;
  }

  &__sub {
    margin: 0;
    font-size: 13.5px;
    line-height: 1.45;
    max-width: 320px;
  }

  &__tabs {
    margin-bottom: 16px;
  }

  &__panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  &__count {
    font-size: 12px;
    font-weight: 700;
    color: var(--rose);
  }
}

.rank {
  display: flex;
  flex-direction: column;
  gap: 12px;

  &__top {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  &__emoji {
    font-size: 34px;
    line-height: 1;
  }

  &__id {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__name {
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 18px;
    color: var(--on-inverse);
  }

  &__points {
    font-size: 26px;
    font-weight: 700;
    line-height: 1.1;
    color: var(--on-inverse);
  }

  &__next {
    margin: -4px 0 0;
    font-size: 12.5px;
    color: var(--on-inverse-soft);
  }

  &__ladder {
    list-style: none;
    margin: 6px 0 0;
    padding: 12px 0 0;
    border-top: 1px solid var(--hairline-inverse);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__step {
    display: flex;
    align-items: center;
    gap: 10px;
    opacity: 0.4;

    &--reached {
      opacity: 1;
    }
  }

  &__step-emoji {
    font-size: 15px;
    line-height: 1;
  }

  &__step-name {
    flex: 1;
    font-size: 13px;
    font-weight: 600;
    color: var(--on-inverse);
  }

  &__step-rp {
    font-size: 11px;
    color: var(--on-inverse-soft);
  }
}

.streak {
  display: flex;
  align-items: center;
  gap: 14px;

  &__icon {
    width: 44px;
    height: 44px;
    border-radius: var(--radius-pill);
    background: var(--orange-16);
    color: var(--orange-text);
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }

  &__title {
    margin: 0 0 3px;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 16px;
    color: var(--ink);
  }

  &__body {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.45;
    color: var(--violet-45);
  }
}

.badges {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.badge {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: var(--radius-card);
  background: var(--paper-raised);
  border: 1px solid var(--hairline);
  opacity: 0.65;

  &--earned {
    opacity: 1;
    border-color: var(--rose-ring);
  }

  &__emoji {
    font-size: 24px;
    line-height: 1;
    flex-shrink: 0;
  }

  &__text {
    flex: 1;
    min-width: 0;
  }

  &__name {
    margin: 0 0 2px;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 14.5px;
    color: var(--ink);
  }

  &__desc {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.4;
    color: var(--violet-45);
  }

  &__earned {
    flex-shrink: 0;
    font-family: var(--font-data);
    text-transform: uppercase;
    letter-spacing: 0.85px;
    font-size: 8.5px;
    font-weight: 700;
    color: var(--rose);
    background: var(--rose-soft);
    padding: 4px 8px;
    border-radius: var(--radius-pill);
  }

  // What it pays out, shown while it is still locked.
  &__reward {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11.5px;
    font-weight: 700;
    color: var(--violet-45);
  }
}

.board {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;

  &__row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-radius: var(--radius-md);
    background: var(--paper-raised);

    &--self {
      background: var(--surface-inverse);
      color: var(--on-inverse);

      .board__rank,
      .board__points {
        color: var(--on-inverse);
      }
    }
  }

  &__rank {
    width: 20px;
    font-size: 12px;
    font-weight: 700;
    color: var(--violet-45);
  }

  &__avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;

    &--initials {
      display: grid;
      place-items: center;
      background: var(--rose-fill);
      color: var(--on-rose);
      font-family: var(--font-eyebrow);
      font-size: 11px;
      font-weight: 700;
    }
  }

  &__name {
    flex: 1;
    font-size: 13.5px;
    font-weight: 600;
  }

  &__points {
    font-size: 12.5px;
    font-weight: 700;
    color: var(--rose);
  }
}

@media (min-width: 1024px) {
  .rewards {
    display: grid;
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
    grid-template-areas:
      'header header'
      'left   panel';
    align-content: start;
    align-items: start;
    column-gap: 24px;
    row-gap: 18px;
    padding: 0 0 8px;

    &__header {
      grid-area: header;
    }

    &__sub {
      max-width: 520px;
      font-size: 15px;
    }

    &__left {
      grid-area: left;
      display: flex;
      flex-direction: column;
      gap: 18px;
      align-self: start;
    }

    &__panel {
      grid-area: panel;
    }
  }

  .rank__points {
    font-size: 32px;
  }
}
</style>
