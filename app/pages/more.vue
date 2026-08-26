<script setup lang="ts">
// 30 · More: the hub the tab bar's "More" opens onto.
definePageMeta({ layout: 'app' })

import { cohort } from '~/data/program'

const store = useAppStore()
const install = useInstallApp()

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
      : 'Nothing yet. Start your before',
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
  <div class="more p-[var(--screen-pad-top)_20px_0] flex flex-col gap-4.5 [&_.more__title]:m-[8px_0_0] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:[grid-template-areas:'header_header'_'profile_rewards'_'links_links'] lg:[align-content:start] lg:[align-items:start] lg:gap-x-6 lg:gap-y-4.5 lg:p-[0_0_8px]">
    <ScreenIntro
      :eyebrow="`${cohort.name} · ${cohort.coach.name}`"
      title="More"
      :actions="false"
      class="more__header lg:[grid-area:header]"
    />

    <section class="more__profile lg:[grid-area:profile]">
      <AppCard variant="raised" class="more__profile-card flex items-center gap-3.5">
        <Avatar size="lg" class="more__avatar w-13 h-13 rounded-[50%] object-cover shrink-0 [&.more__avatar--initials]:grid [&.more__avatar--initials]:place-items-center [&.more__avatar--initials]:[background:var(--rose-fill)] [&.more__avatar--initials]:text-on-rose [&.more__avatar--initials]:font-display [&.more__avatar--initials]:font-black [&.more__avatar--initials]:text-[18px]">
          <AvatarImage :src="store.profile.value?.avatarUrl ?? ''" :alt="store.displayName.value" />
          <AvatarFallback>{{ initials }}</AvatarFallback>
        </Avatar>
        <div class="more__profile-text flex-1 min-w-0">
          <h2 class="more__name m-[0_0_4px] font-display font-black text-[17px] text-(--ink)">{{ store.displayName.value }}</h2>
          <p class="more__meta muted m-0 text-[12.5px]">
            Week {{ store.clock.value.week }} of {{ store.clock.value.totalWeeks }} ·
            {{ store.clock.value.title }}
          </p>
        </div>
        <div class="more__profile-pills flex flex-col gap-1.5 shrink-0">
          <StatPill icon="flame" :value="store.rewards.value.streakWeeks" variant="flame" />
          <StatPill icon="trophy" :value="store.rewards.value.badgeCount" variant="rose" />
        </div>
      </AppCard>
    </section>

    <section class="more__rewards lg:[grid-area:rewards] lg:[align-self:start]">
      <AppCard variant="ink" class="more__rewards-card flex flex-col gap-2">
        <EyebrowLabel tone="rose-on-inverse">Reward points</EyebrowLabel>
        <div class="more__points data text-[40px] font-bold leading-none text-on-inverse">{{ store.rewards.value.points }}</div>
        <p class="more__tier m-[0_0_4px] text-[13px] text-on-inverse-soft">
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

    <section class="more__links flex flex-col gap-2.5 lg:[grid-area:links] lg:grid lg:grid-cols-2 lg:gap-3 lg:mt-1.5">
      <NuxtLink v-for="link in links" :key="link.to" :to="link.to" class="more__link flex items-center gap-3 p-[14px_16px] rounded-card [background:var(--paper-raised)] [box-shadow:var(--shadow-card)] text-(--ink) lg:[transition:transform_0.15s_ease,box-shadow_0.15s_ease] lg:hover:transform-[translateY(-2px)] lg:hover:[box-shadow:var(--shadow-raised)]">
        <span class="more__link-icon grid place-items-center w-8.5 h-8.5 rounded-[50%] [background:var(--rose-soft)] text-rose shrink-0">
          <AppIcon :name="link.icon" :size="18" />
        </span>
        <span class="more__link-text flex-1 min-w-0 flex flex-col gap-0.5 [&_strong]:text-[14px] [&_strong]:font-semibold [&_small]:text-[12px] [&_small]:text-(--violet-45)">
          <strong>{{ link.label }}</strong>
          <small>{{ link.meta }}</small>
        </span>
        <AppIcon name="chevronRight" :size="18" class="more__link-chev text-(--violet-45) shrink-0" />
      </NuxtLink>

      <!-- Only while installing is actually possible: already installed, or a
           browser with no install route, and the row is not there at all. -->
      <button
        v-if="install.canInstall.value"
        type="button"
        class="more__link more__link--action flex items-center gap-3 p-[14px_16px] rounded-card [background:var(--paper-raised)] [box-shadow:var(--shadow-card)] text-(--ink) lg:[transition:transform_0.15s_ease,box-shadow_0.15s_ease] lg:hover:transform-[translateY(-2px)] lg:hover:[box-shadow:var(--shadow-raised)] w-full text-left"
        @click="install.install()"
      >
        <span class="more__link-icon grid place-items-center w-8.5 h-8.5 rounded-[50%] [background:var(--rose-soft)] text-rose shrink-0">
          <AppIcon name="download" :size="18" />
        </span>
        <span class="more__link-text flex-1 min-w-0 flex flex-col gap-0.5 [&_strong]:text-[14px] [&_strong]:font-semibold [&_small]:text-[12px] [&_small]:text-(--violet-45)">
          <strong>Install the app</strong>
          <small>
            {{
              install.method.value === 'prompt'
                ? 'Put DP Fitness on your home screen'
                : 'How to add it on this device'
            }}
          </small>
        </span>
        <AppIcon name="chevronRight" :size="18" class="more__link-chev text-(--violet-45) shrink-0" />
      </button>
    </section>
  </div>
</template>
