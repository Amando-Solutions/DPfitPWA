<script setup lang="ts">
// Desktop-only primary navigation. Hidden below 1024px, where TabBar takes over.
// The rail has room the tab bar doesn't, so the secondary destinations that live
// behind "More" on mobile are promoted to their own section here.
const { navItems, isActive } = useNavigation()
const store = useAppStore()

const secondary = [
  { key: 'rewards', label: 'Rewards', icon: 'trophy', to: '/rewards' },
  { key: 'progress', label: 'Progress photos', icon: 'image', to: '/progress' },
  { key: 'check-in', label: 'Weekly check-in', icon: 'calendar', to: '/check-in' },
  { key: 'guides', label: 'Program guides', icon: 'info', to: '/guides' },
]

const primary = computed(() => navItems.filter((item) => item.key !== 'more'))

const initials = computed(() =>
  store.displayName.value
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase(),
)
/**
 * The rail's one call to action, in the member's situation.
 *
 * Three states rather than two: a session logged, a rest day with nothing
 * scheduled, and a day that is open. "Today is logged" covered all three before
 * the plan ran on a calendar, and on a rest day it claimed credit for a session
 * nobody did.
 */
const ctaLabel = computed(() => {
  if (!store.trainingLocked.value) return "Start today's session"
  return store.sessionToday.value ? 'Today is logged' : 'Nothing open today'
})
</script>

<template>
  <aside class="sidenav hidden lg:flex lg:flex-col lg:gap-1 lg:w-(--sidenav-width) lg:shrink-0 lg:pt-6.5 lg:px-4.5 lg:pb-5.5 lg:bg-raised lg:border-r lg:border-hairline lg:overflow-y-auto">
    <NuxtLink to="/home" class="sidenav__brand lg:pt-0 lg:px-2.5 lg:pb-5.5">
      <!-- No `mono`: the rail is a themed surface, so the mark takes
           `--brand-mark`, which is the plum on light and lifts to the wordmark's
           off-white on dark. `text-ink` is the wordmark half. -->
      <BrandLogo :size="40" class="text-ink" label="DP Fitness" />
    </NuxtLink>

    <nav class="sidenav__nav lg:flex lg:flex-col lg:gap-0.5">
      <NuxtLink
        v-for="item in primary"
        :key="item.key"
        :to="item.to"
        class="sidenav__item lg:relative lg:flex lg:items-center lg:gap-3 lg:py-2.75 lg:px-3 lg:rounded-md lg:text-muted lg:text-[14px] lg:font-semibold lg:transition-[background,color] lg:duration-150 lg:ease-[ease] lg:hover:bg-fill-subtle lg:hover:text-ink lg:[&.sidenav__item--active]:bg-inverse lg:[&.sidenav__item--active]:text-on-inverse lg:[&.sidenav__item--active:hover]:bg-inverse lg:[&.sidenav__item--active:hover]:text-on-inverse lg:[&.sidenav__item--active_.sidenav__icon]:text-rose"
        :class="{ 'sidenav__item--active': isActive(item.to) }"
      >
        <span class="sidenav__icon lg:grid lg:place-items-center lg:shrink-0">
          <AppIcon :name="item.icon" :size="20" :stroke="2" />
        </span>
        <span class="sidenav__label">{{ item.desktopLabel ?? item.label }}</span>
      </NuxtLink>
    </nav>

    <div class="sidenav__divider lg:h-px lg:mt-4 lg:mx-3 lg:mb-3 lg:bg-fill-subtle" />

    <nav class="sidenav__nav lg:flex lg:flex-col lg:gap-0.5">
      <NuxtLink
        v-for="item in secondary"
        :key="item.key"
        :to="item.to"
        class="sidenav__item sidenav__item--secondary lg:relative lg:flex lg:items-center lg:gap-3 lg:py-2.75 lg:px-3 lg:rounded-md lg:text-muted lg:text-[14px] lg:font-semibold lg:transition-[background,color] lg:duration-150 lg:ease-[ease] lg:hover:bg-fill-subtle lg:hover:text-ink lg:[&.sidenav__item--active]:bg-inverse lg:[&.sidenav__item--active]:text-on-inverse lg:[&.sidenav__item--active:hover]:bg-inverse lg:[&.sidenav__item--active:hover]:text-on-inverse lg:[&.sidenav__item--active_.sidenav__icon]:text-rose"
        :class="{ 'sidenav__item--active': isActive(item.to) }"
      >
        <span class="sidenav__icon lg:grid lg:place-items-center lg:shrink-0">
          <AppIcon :name="item.icon" :size="20" :stroke="2" />
        </span>
        <span class="sidenav__label">{{ item.label }}</span>
        <span
          v-if="item.key === 'check-in' && store.checkInDue.value"
          class="sidenav__badge lg:w-1.75 lg:h-1.75 lg:rounded-full lg:bg-rose-fill lg:ml-auto"
        />
      </NuxtLink>
    </nav>

    <!-- With nothing open to log — today's done, or the plan schedules no
         session today — the rail points at the picker, which is the screen that
         says which day opens next and when. -->
    <NuxtLink
      :to="store.trainingLocked.value ? '/train' : `/train/${store.today.value?.id ?? ''}`"
      class="sidenav__cta lg:mt-4.5 lg:flex lg:items-center lg:justify-center lg:gap-2 lg:py-3.25 lg:px-3.5 lg:rounded-md lg:bg-rose-fill lg:text-on-rose lg:text-[13.5px] lg:font-bold"
    >
      <AppIcon :name="store.trainingLocked.value ? 'check' : 'play'" :size="16" fill />
      <span>{{ ctaLabel }}</span>
    </NuxtLink>

    <div class="sidenav__spacer lg:flex-1 lg:min-h-5" />

    <NuxtLink to="/notifications" class="sidenav__inbox lg:flex lg:items-center lg:gap-3 lg:py-2.5 lg:px-3 lg:mb-1.5 lg:rounded-md lg:text-muted lg:text-[13px] lg:font-semibold lg:hover:bg-fill-subtle lg:hover:text-ink">
      <AppIcon name="bell" :size="18" :stroke="2" />
      <span>Inbox</span>
      <span v-if="store.unreadNotifications.value" class="sidenav__count data lg:ml-auto lg:min-w-5 lg:py-0.5 lg:px-1.5 lg:rounded-pill lg:bg-rose-fill lg:text-on-rose lg:text-[10px] lg:font-bold lg:text-center">
        {{ store.unreadNotifications.value }}
      </span>
    </NuxtLink>

    <NuxtLink to="/profile" class="sidenav__member lg:flex lg:items-center lg:gap-2.5 lg:p-2.5 lg:rounded-md lg:bg-surface lg:transition-[background] lg:duration-150 lg:ease-[ease] lg:hover:bg-fill-subtle">
      <Avatar size="md" class="sidenav__avatar lg:w-9 lg:h-9 lg:rounded-full lg:object-cover lg:shrink-0 lg:[&.sidenav__avatar--initials]:grid lg:[&.sidenav__avatar--initials]:place-items-center lg:[&.sidenav__avatar--initials]:bg-rose-fill lg:[&.sidenav__avatar--initials]:text-on-rose lg:[&.sidenav__avatar--initials]:font-display lg:[&.sidenav__avatar--initials]:font-black lg:[&.sidenav__avatar--initials]:text-[13px]">
        <AvatarImage
          :src="store.profile.value?.avatarUrl ?? ''"
          :alt="store.displayName.value"
          loading="lazy"
        />
        <AvatarFallback>{{ initials }}</AvatarFallback>
      </Avatar>
      <span class="sidenav__member-text lg:flex lg:flex-col lg:gap-0.5 lg:min-w-0">
        <span class="sidenav__member-name lg:text-[13.5px] lg:font-bold lg:text-ink lg:whitespace-nowrap lg:overflow-hidden lg:text-ellipsis">{{ store.displayName.value }}</span>
        <span class="sidenav__member-meta lg:font-eyebrow lg:uppercase lg:tracking-[0.5px] lg:text-[8.5px] lg:font-bold lg:text-muted">
          {{ store.clock.value.label }}
        </span>
      </span>
    </NuxtLink>
  </aside>
</template>
