<script setup lang="ts">
// 30 · More: the hub the tab bar's "More" opens onto.
definePageMeta({ layout: 'app' })

const router = useRouter()
const store = useAppStore()
const install = useInstallApp()

/*
  Notifications and the coach DM are both gone from this list.

  Notifications now live where every other screen's inbox lives: an icon at the
  top right, one tap from wherever you are, rather than a row you have to open
  More to find. The direct line to the coach is hidden for now — cohort chat is
  the channel, and offering a private one alongside it splits the room.
*/
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
    to: '/profile',
    icon: 'settings',
    label: 'Profile & settings',
    meta: 'Name, weight, units, reminders',
  },
])

// --- Sign out --------------------------------------------------------------
// Moved off the settings screen and onto this menu: it is a navigation action,
// not a setting, and it was the one destructive control sitting at the bottom
// of a form people scroll through to change their weight.
const showSignOut = ref(false)
const signOut = async () => {
  await store.signOut()
  await router.push('/access-code')
}

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
  <div class="more p-[var(--screen-pad-top)_20px_0] flex flex-col gap-4.5 [&_.more__title]:m-[8px_0_0] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:[grid-template-areas:'header_header'_'profile_rewards'_'links_links'] lg:content-start lg:items-start lg:gap-x-6 lg:gap-y-4.5 lg:p-[0_0_8px]">
    <!-- The cohort-and-coach eyebrow is gone: it named the same cohort on every
         screen that carried it, and neither half was something you act on. -->
    <ScreenIntro title="More" class="more__header lg:[grid-area:header]" />

    <section class="more__profile lg:[grid-area:profile]">
      <AppCard variant="raised" class="more__profile-card flex items-center gap-3.5">
        <Avatar size="lg" class="more__avatar w-13 h-13 rounded-[50%] object-cover shrink-0 [&.more__avatar--initials]:grid [&.more__avatar--initials]:place-items-center [&.more__avatar--initials]:bg-rose-fill [&.more__avatar--initials]:text-on-rose [&.more__avatar--initials]:font-display [&.more__avatar--initials]:font-black [&.more__avatar--initials]:text-[18px]">
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
          <StatPill icon="flame" :value="store.rewards.value.streakWeeks" variant="rose" />
          <StatPill icon="trophy" :value="store.rewards.value.badgeCount" variant="rose" />
        </div>
      </AppCard>
    </section>

    <section class="more__rewards lg:[grid-area:rewards] lg:self-start">
      <AppCard variant="ink" class="more__rewards-card flex flex-col gap-2">
        <span class="text-[13px] text-on-inverse-muted">Reward points</span>
        <div class="more__points text-[40px] font-bold leading-none text-on-inverse tabular-nums">{{ store.rewards.value.points }}</div>
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
      <NuxtLink v-for="link in links" :key="link.to" :to="link.to" class="more__link flex items-center gap-3 p-[14px_16px] rounded-card bg-raised shadow-card text-(--ink) lg:transition-[translate,box-shadow] lg:duration-150 lg:ease-[ease] lg:hover:transform-[translateY(-2px)] lg:hover:shadow-raised">
        <span class="more__link-icon grid place-items-center w-8.5 h-8.5 rounded-[50%] bg-rose-soft text-rose shrink-0">
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
        class="more__link more__link--action flex items-center gap-3 p-[14px_16px] rounded-card bg-raised shadow-card text-(--ink) lg:transition-[translate,box-shadow] lg:duration-150 lg:ease-[ease] lg:hover:transform-[translateY(-2px)] lg:hover:shadow-raised w-full text-left"
        @click="install.install()"
      >
        <span class="more__link-icon grid place-items-center w-8.5 h-8.5 rounded-[50%] bg-rose-soft text-rose shrink-0">
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

    <!-- Sign out lives here now rather than at the foot of Profile & settings. -->
    <section class="more__signout lg:[grid-area:links] lg:justify-self-start">
      <button
        type="button"
        class="min-h-11 px-4 text-[14px] font-bold text-rose"
        @click="showSignOut = true"
      >
        Sign out
      </button>
    </section>

    <BottomSheet v-model="showSignOut" title="Sign out?">
      <p class="m-[0_0_16px] text-[14px] leading-normal text-muted">
        This device is where your challenge lives. Signing out erases your logged
        sessions, photos and check-ins.
      </p>
      <div class="grid grid-cols-2 gap-3">
        <AppButton variant="secondary" @click="showSignOut = false">Stay</AppButton>
        <AppButton variant="danger" @click="signOut">Sign out</AppButton>
      </div>
    </BottomSheet>
  </div>
</template>
