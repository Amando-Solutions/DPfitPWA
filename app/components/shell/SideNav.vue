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
</script>

<template>
  <aside class="sidenav [display:none] lg:[display:flex] lg:[flex-direction:column] lg:[gap:4px] lg:[width:var(--sidenav-width)] lg:[flex-shrink:0] lg:[padding:26px_18px_22px] lg:[background:var(--paper-raised)] lg:[border-right:1px_solid_var(--hairline)] lg:[overflow-y:auto]">
    <NuxtLink to="/home" class="sidenav__brand lg:[padding:0_10px_22px]">
      <BrandWordmark size="sm" />
    </NuxtLink>

    <nav class="sidenav__nav lg:[display:flex] lg:[flex-direction:column] lg:[gap:2px]">
      <NuxtLink
        v-for="item in primary"
        :key="item.key"
        :to="item.to"
        class="sidenav__item lg:[position:relative] lg:[display:flex] lg:[align-items:center] lg:[gap:12px] lg:[padding:11px_12px] lg:[border-radius:var(--radius-md)] lg:[color:var(--violet-45)] lg:[font-size:14px] lg:[font-weight:600] lg:[transition:background_0.15s_ease,_color_0.15s_ease] lg:hover:[background:var(--fill-subtle)] lg:hover:[color:var(--ink)] lg:[&.sidenav__item--active]:[background:var(--surface-inverse)] lg:[&.sidenav__item--active]:[color:var(--on-inverse)] lg:[&.sidenav__item--active:hover]:[background:var(--surface-inverse)] lg:[&.sidenav__item--active:hover]:[color:var(--on-inverse)] lg:[&.sidenav__item--active_.sidenav__icon]:[color:var(--rose)]"
        :class="{ 'sidenav__item--active': isActive(item.to) }"
      >
        <span class="sidenav__icon lg:[display:grid] lg:[place-items:center] lg:[flex-shrink:0]">
          <AppIcon :name="item.icon" :size="20" :stroke="2" />
        </span>
        <span class="sidenav__label">{{ item.desktopLabel ?? item.label }}</span>
      </NuxtLink>
    </nav>

    <div class="sidenav__divider lg:[height:1px] lg:[margin:16px_12px_12px] lg:[background:var(--fill-subtle)]" />

    <nav class="sidenav__nav lg:[display:flex] lg:[flex-direction:column] lg:[gap:2px]">
      <NuxtLink
        v-for="item in secondary"
        :key="item.key"
        :to="item.to"
        class="sidenav__item sidenav__item--secondary lg:[position:relative] lg:[display:flex] lg:[align-items:center] lg:[gap:12px] lg:[padding:11px_12px] lg:[border-radius:var(--radius-md)] lg:[color:var(--violet-45)] lg:[font-size:14px] lg:[font-weight:600] lg:[transition:background_0.15s_ease,_color_0.15s_ease] lg:hover:[background:var(--fill-subtle)] lg:hover:[color:var(--ink)] lg:[&.sidenav__item--active]:[background:var(--surface-inverse)] lg:[&.sidenav__item--active]:[color:var(--on-inverse)] lg:[&.sidenav__item--active:hover]:[background:var(--surface-inverse)] lg:[&.sidenav__item--active:hover]:[color:var(--on-inverse)] lg:[&.sidenav__item--active_.sidenav__icon]:[color:var(--rose)]"
        :class="{ 'sidenav__item--active': isActive(item.to) }"
      >
        <span class="sidenav__icon lg:[display:grid] lg:[place-items:center] lg:[flex-shrink:0]">
          <AppIcon :name="item.icon" :size="20" :stroke="2" />
        </span>
        <span class="sidenav__label">{{ item.label }}</span>
        <span
          v-if="item.key === 'check-in' && store.checkInDue.value"
          class="sidenav__badge lg:[width:7px] lg:[height:7px] lg:[border-radius:50%] lg:[background:var(--rose-fill)] lg:[margin-left:auto]"
        />
      </NuxtLink>
    </nav>

    <!-- Once today's session is logged, the rail points at the picker, which is
         the screen that says when the next one opens. -->
    <NuxtLink
      :to="store.trainingLocked.value ? '/train' : `/train/${store.today.value?.id ?? ''}`"
      class="sidenav__cta btn-raised btn-glow lg:[margin-top:18px] lg:[display:flex] lg:[align-items:center] lg:[justify-content:center] lg:[gap:8px] lg:[padding:13px_14px] lg:[border-radius:var(--radius-md)] lg:[background:var(--rose-fill)] lg:[--btn-face:var(--rose-fill)] lg:[color:var(--on-rose)] lg:[font-size:13.5px] lg:[font-weight:700]"
    >
      <AppIcon :name="store.trainingLocked.value ? 'check' : 'play'" :size="16" fill />
      <span>{{ store.trainingLocked.value ? 'Today is logged' : "Start today's session" }}</span>
    </NuxtLink>

    <div class="sidenav__spacer lg:[flex:1] lg:[min-height:20px]" />

    <NuxtLink to="/notifications" class="sidenav__inbox lg:[display:flex] lg:[align-items:center] lg:[gap:12px] lg:[padding:10px_12px] lg:[margin-bottom:6px] lg:[border-radius:var(--radius-md)] lg:[color:var(--violet-45)] lg:[font-size:13px] lg:[font-weight:600] lg:hover:[background:var(--fill-subtle)] lg:hover:[color:var(--ink)]">
      <AppIcon name="bell" :size="18" :stroke="2" />
      <span>Inbox</span>
      <span v-if="store.unreadNotifications.value" class="sidenav__count data lg:[margin-left:auto] lg:[min-width:20px] lg:[padding:2px_6px] lg:[border-radius:var(--radius-pill)] lg:[background:var(--rose-fill)] lg:[color:var(--on-rose)] lg:[font-size:10px] lg:[font-weight:700] lg:[text-align:center]">
        {{ store.unreadNotifications.value }}
      </span>
    </NuxtLink>

    <NuxtLink to="/profile" class="sidenav__member lg:[display:flex] lg:[align-items:center] lg:[gap:10px] lg:[padding:10px] lg:[border-radius:var(--radius-md)] lg:[background:var(--paper)] lg:[transition:background_0.15s_ease] lg:hover:[background:var(--fill-subtle)]">
      <Avatar size="md" class="sidenav__avatar lg:[width:36px] lg:[height:36px] lg:[border-radius:50%] lg:[object-fit:cover] lg:[flex-shrink:0] lg:[&.sidenav__avatar--initials]:[display:grid] lg:[&.sidenav__avatar--initials]:[place-items:center] lg:[&.sidenav__avatar--initials]:[background:var(--rose-fill)] lg:[&.sidenav__avatar--initials]:[color:var(--on-rose)] lg:[&.sidenav__avatar--initials]:[font-family:var(--font-display)] lg:[&.sidenav__avatar--initials]:[font-weight:900] lg:[&.sidenav__avatar--initials]:[font-size:13px]">
        <AvatarImage
          :src="store.profile.value?.avatarUrl ?? ''"
          :alt="store.displayName.value"
          loading="lazy"
        />
        <AvatarFallback>{{ initials }}</AvatarFallback>
      </Avatar>
      <span class="sidenav__member-text lg:[display:flex] lg:[flex-direction:column] lg:[gap:2px] lg:[min-width:0]">
        <span class="sidenav__member-name lg:[font-size:13.5px] lg:[font-weight:700] lg:[color:var(--ink)] lg:[white-space:nowrap] lg:[overflow:hidden] lg:[text-overflow:ellipsis]">{{ store.displayName.value }}</span>
        <span class="sidenav__member-meta lg:[font-family:var(--font-eyebrow)] lg:[text-transform:uppercase] lg:[letter-spacing:0.5px] lg:[font-size:8.5px] lg:[font-weight:700] lg:[color:var(--violet-45)]">
          Week {{ store.clock.value.week }} · {{ store.clock.value.title }}
        </span>
      </span>
    </NuxtLink>
  </aside>
</template>
