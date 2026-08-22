<script setup lang="ts">
// 30 · More — the hub the tab bar's "More" opens onto.
definePageMeta({ layout: 'app' })

import { cohort } from '~/data/program'

const store = useAppStore()

const links = computed(() => [
  {
    to: '/rewards',
    icon: 'trophy',
    label: 'Rewards',
    meta: `${store.rewards.value.points} RP · ${store.rewards.value.rank.name}`,
  },
  {
    to: '/progress',
    icon: 'image',
    label: 'Progress photos',
    meta: store.photos.value.length
      ? `${store.photos.value.length} saved`
      : 'Nothing yet — start your before',
  },
  {
    to: '/check-in',
    icon: 'calendar',
    label: 'Weekly check-in',
    meta: store.checkInDue.value
      ? `Week ${store.clock.value.week} is open`
      : `Week ${store.clock.value.week} submitted`,
  },
  {
    to: '/guides',
    icon: 'info',
    label: 'Program guides',
    meta: 'Warm-ups, core, cardio, overload',
  },
  {
    to: '/notifications',
    icon: 'bell',
    label: 'Notifications',
    meta: store.unreadNotifications.value
      ? `${store.unreadNotifications.value} unread`
      : 'All caught up',
  },
  {
    to: '/chat/coach',
    icon: 'chat',
    label: 'Message your coach',
    meta: cohort.coach.name,
  },
  {
    to: '/profile',
    icon: 'settings',
    label: 'Profile & settings',
    meta: 'Weight, goal, units, sign out',
  },
])

const initials = computed(() =>
  store.displayName.value
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase(),
)
</script>

<template>
  <div class="more">
    <ScreenIntro
      :eyebrow="`${cohort.name} · ${cohort.coach.name}`"
      title="More"
      :actions="false"
      class="more__header"
    />

    <section class="more__profile">
      <AppCard variant="raised" class="more__profile-card">
        <img
          v-if="store.profile.value?.avatar"
          :src="store.profile.value.avatar"
          :alt="store.displayName.value"
          class="more__avatar"
          decoding="async"
        />
        <span v-else class="more__avatar more__avatar--initials">{{ initials }}</span>
        <div class="more__profile-text">
          <h2 class="more__name">{{ store.displayName.value }}</h2>
          <p class="more__meta muted">
            Week {{ store.clock.value.week }} of {{ store.clock.value.totalWeeks }} ·
            {{ store.clock.value.title }}
          </p>
        </div>
        <div class="more__profile-pills">
          <StatPill icon="flame" :value="store.rewards.value.streakWeeks" variant="flame" />
          <StatPill icon="trophy" :value="store.rewards.value.badgeCount" variant="rose" />
        </div>
      </AppCard>
    </section>

    <section class="more__rewards">
      <AppCard variant="ink" class="more__rewards-card">
        <EyebrowLabel tone="rose-on-inverse">Reward points</EyebrowLabel>
        <div class="more__points data">{{ store.rewards.value.points }}</div>
        <p class="more__tier">
          {{ store.rewards.value.rank.emoji }} {{ store.rewards.value.rank.name }}
          <template v-if="store.rewards.value.nextRank">
            · {{ store.rewards.value.pointsToNextRank }} RP to
            {{ store.rewards.value.nextRank.name }}
          </template>
          <template v-else>· top rank reached</template>
        </p>
        <ProgressBar :value="store.rewards.value.rankProgress" :max="100" :height="6" flame />
      </AppCard>
    </section>

    <section class="more__links">
      <NuxtLink v-for="link in links" :key="link.to" :to="link.to" class="more__link">
        <span class="more__link-icon">
          <AppIcon :name="link.icon" :size="18" />
        </span>
        <span class="more__link-text">
          <strong>{{ link.label }}</strong>
          <small>{{ link.meta }}</small>
        </span>
        <AppIcon name="chevronRight" :size="18" class="more__link-chev" />
      </NuxtLink>
    </section>
  </div>
</template>

<style scoped lang="scss">
.more {
  padding: var(--screen-pad-top) 20px 0;
  display: flex;
  flex-direction: column;
  gap: 18px;

  &__title {
    margin: 8px 0 0;
  }

  &__profile-card {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  &__avatar {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;

    &--initials {
      display: grid;
      place-items: center;
      background: var(--rose-fill);
      color: var(--on-rose);
      font-family: var(--font-display);
      font-weight: 900;
      font-size: 18px;
    }
  }

  &__profile-text {
    flex: 1;
    min-width: 0;
  }

  &__name {
    margin: 0 0 4px;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 17px;
    color: var(--ink);
  }

  &__meta {
    margin: 0;
    font-size: 12.5px;
  }

  &__profile-pills {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-shrink: 0;
  }

  &__rewards-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__points {
    font-size: 40px;
    font-weight: 700;
    line-height: 1;
    color: var(--on-inverse);
  }

  &__tier {
    margin: 0 0 4px;
    font-size: 13px;
    color: var(--on-inverse-soft);
  }

  &__links {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  &__link {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    border-radius: var(--radius-card);
    background: var(--paper-raised);
    box-shadow: var(--shadow-card);
    color: var(--ink);
  }

  &__link-icon {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: var(--rose-soft);
    color: var(--rose);
    flex-shrink: 0;
  }

  &__link-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;

    strong {
      font-size: 14px;
      font-weight: 600;
    }
    small {
      font-size: 12px;
      color: var(--violet-45);
    }
  }

  &__link-chev {
    color: var(--violet-45);
    flex-shrink: 0;
  }
}

// Desktop: profile + rewards side by side, links as a two-up list.
@media (min-width: 1024px) {
  .more {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    grid-template-areas:
      'header  header'
      'profile rewards'
      'links   links';
    align-content: start;
    align-items: start;
    column-gap: 24px;
    row-gap: 18px;
    padding: 0 0 8px;

    &__header {
      grid-area: header;
    }

    &__profile {
      grid-area: profile;
    }

    &__rewards {
      grid-area: rewards;
      align-self: start;
    }

    &__links {
      grid-area: links;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin-top: 6px;
    }

    &__link {
      transition:
        transform 0.15s ease,
        box-shadow 0.15s ease;

      &:hover {
        transform: translateY(-2px);
        box-shadow: var(--shadow-raised);
      }
    }
  }
}
</style>
