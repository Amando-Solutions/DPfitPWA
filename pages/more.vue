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
  <div class="more [padding:var(--screen-pad-top)_20px_0] [display:flex] [flex-direction:column] [gap:18px] [&_.more__title]:[margin:8px_0_0] lg:[display:grid] lg:[grid-template-columns:minmax(0,_1fr)_minmax(0,_1fr)] lg:[grid-template-areas:'header_header'_'profile_rewards'_'links_links'] lg:[align-content:start] lg:[align-items:start] lg:[column-gap:24px] lg:[row-gap:18px] lg:[padding:0_0_8px]">
    <ScreenIntro
      :eyebrow="`${cohort.name} · ${cohort.coach.name}`"
      title="More"
      :actions="false"
      class="more__header lg:[grid-area:header]"
    />

    <section class="more__profile lg:[grid-area:profile]">
      <AppCard variant="raised" class="more__profile-card [display:flex] [align-items:center] [gap:14px]">
        <Avatar size="lg" class="more__avatar [width:52px] [height:52px] [border-radius:50%] [object-fit:cover] [flex-shrink:0] [&.more__avatar--initials]:[display:grid] [&.more__avatar--initials]:[place-items:center] [&.more__avatar--initials]:[background:var(--rose-fill)] [&.more__avatar--initials]:[color:var(--on-rose)] [&.more__avatar--initials]:[font-family:var(--font-display)] [&.more__avatar--initials]:[font-weight:900] [&.more__avatar--initials]:[font-size:18px]">
          <AvatarImage :src="store.profile.value?.avatar ?? ''" :alt="store.displayName.value" />
          <AvatarFallback>{{ initials }}</AvatarFallback>
        </Avatar>
        <div class="more__profile-text [flex:1] [min-width:0]">
          <h2 class="more__name [margin:0_0_4px] [font-family:var(--font-display)] [font-weight:900] [font-size:17px] [color:var(--ink)]">{{ store.displayName.value }}</h2>
          <p class="more__meta muted [margin:0] [font-size:12.5px]">
            Week {{ store.clock.value.week }} of {{ store.clock.value.totalWeeks }} ·
            {{ store.clock.value.title }}
          </p>
        </div>
        <div class="more__profile-pills [display:flex] [flex-direction:column] [gap:6px] [flex-shrink:0]">
          <StatPill icon="flame" :value="store.rewards.value.streakWeeks" variant="flame" />
          <StatPill icon="trophy" :value="store.rewards.value.badgeCount" variant="rose" />
        </div>
      </AppCard>
    </section>

    <section class="more__rewards lg:[grid-area:rewards] lg:[align-self:start]">
      <AppCard variant="ink" class="more__rewards-card [display:flex] [flex-direction:column] [gap:8px]">
        <EyebrowLabel tone="rose-on-inverse">Reward points</EyebrowLabel>
        <div class="more__points data [font-size:40px] [font-weight:700] [line-height:1] [color:var(--on-inverse)]">{{ store.rewards.value.points }}</div>
        <p class="more__tier [margin:0_0_4px] [font-size:13px] [color:var(--on-inverse-soft)]">
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

    <section class="more__links [display:flex] [flex-direction:column] [gap:10px] lg:[grid-area:links] lg:[display:grid] lg:[grid-template-columns:repeat(2,_minmax(0,_1fr))] lg:[gap:12px] lg:[margin-top:6px]">
      <NuxtLink v-for="link in links" :key="link.to" :to="link.to" class="more__link [display:flex] [align-items:center] [gap:12px] [padding:14px_16px] [border-radius:var(--radius-card)] [background:var(--paper-raised)] [box-shadow:var(--shadow-card)] [color:var(--ink)] lg:[transition:transform_0.15s_ease,_box-shadow_0.15s_ease] lg:hover:[transform:translateY(-2px)] lg:hover:[box-shadow:var(--shadow-raised)]">
        <span class="more__link-icon [display:grid] [place-items:center] [width:34px] [height:34px] [border-radius:50%] [background:var(--rose-soft)] [color:var(--rose)] [flex-shrink:0]">
          <AppIcon :name="link.icon" :size="18" />
        </span>
        <span class="more__link-text [flex:1] [min-width:0] [display:flex] [flex-direction:column] [gap:2px] [&_strong]:[font-size:14px] [&_strong]:[font-weight:600] [&_small]:[font-size:12px] [&_small]:[color:var(--violet-45)]">
          <strong>{{ link.label }}</strong>
          <small>{{ link.meta }}</small>
        </span>
        <AppIcon name="chevronRight" :size="18" class="more__link-chev [color:var(--violet-45)] [flex-shrink:0]" />
      </NuxtLink>

      <!-- Only while installing is actually possible: already installed, or a
           browser with no install route, and the row is not there at all. -->
      <button
        v-if="install.canInstall.value"
        type="button"
        class="more__link more__link--action [display:flex] [align-items:center] [gap:12px] [padding:14px_16px] [border-radius:var(--radius-card)] [background:var(--paper-raised)] [box-shadow:var(--shadow-card)] [color:var(--ink)] lg:[transition:transform_0.15s_ease,_box-shadow_0.15s_ease] lg:hover:[transform:translateY(-2px)] lg:hover:[box-shadow:var(--shadow-raised)] [width:100%] [text-align:left]"
        @click="install.install()"
      >
        <span class="more__link-icon [display:grid] [place-items:center] [width:34px] [height:34px] [border-radius:50%] [background:var(--rose-soft)] [color:var(--rose)] [flex-shrink:0]">
          <AppIcon name="download" :size="18" />
        </span>
        <span class="more__link-text [flex:1] [min-width:0] [display:flex] [flex-direction:column] [gap:2px] [&_strong]:[font-size:14px] [&_strong]:[font-weight:600] [&_small]:[font-size:12px] [&_small]:[color:var(--violet-45)]">
          <strong>Install the app</strong>
          <small>
            {{
              install.method.value === 'prompt'
                ? 'Put DP Fitness on your home screen'
                : 'How to add it on this device'
            }}
          </small>
        </span>
        <AppIcon name="chevronRight" :size="18" class="more__link-chev [color:var(--violet-45)] [flex-shrink:0]" />
      </button>
    </section>
  </div>
</template>
