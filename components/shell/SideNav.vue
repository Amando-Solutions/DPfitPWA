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
  <aside class="sidenav">
    <NuxtLink to="/home" class="sidenav__brand">
      <BrandWordmark size="sm" />
    </NuxtLink>

    <nav class="sidenav__nav">
      <NuxtLink
        v-for="item in primary"
        :key="item.key"
        :to="item.to"
        class="sidenav__item"
        :class="{ 'sidenav__item--active': isActive(item.to) }"
      >
        <span class="sidenav__icon">
          <AppIcon :name="item.icon" :size="20" :stroke="2" />
        </span>
        <span class="sidenav__label">{{ item.desktopLabel ?? item.label }}</span>
      </NuxtLink>
    </nav>

    <NuxtLink :to="`/train/${store.today.value?.id ?? ''}`" class="sidenav__cta btn-raised btn-glow">
      <AppIcon name="play" :size="16" fill />
      <span>Start today's session</span>
    </NuxtLink>

    <div class="sidenav__divider" />

    <nav class="sidenav__nav">
      <NuxtLink
        v-for="item in secondary"
        :key="item.key"
        :to="item.to"
        class="sidenav__item sidenav__item--secondary"
        :class="{ 'sidenav__item--active': isActive(item.to) }"
      >
        <span class="sidenav__icon">
          <AppIcon :name="item.icon" :size="18" :stroke="2" />
        </span>
        <span class="sidenav__label">{{ item.label }}</span>
        <span
          v-if="item.key === 'check-in' && store.checkInDue.value"
          class="sidenav__badge"
        />
      </NuxtLink>
    </nav>

    <div class="sidenav__spacer" />

    <NuxtLink to="/notifications" class="sidenav__inbox">
      <AppIcon name="bell" :size="18" :stroke="2" />
      <span>Inbox</span>
      <span v-if="store.unreadNotifications.value" class="sidenav__count data">
        {{ store.unreadNotifications.value }}
      </span>
    </NuxtLink>

    <NuxtLink to="/profile" class="sidenav__member">
      <img
        v-if="store.profile.value?.avatar"
        :src="store.profile.value.avatar"
        :alt="store.displayName.value"
        class="sidenav__avatar"
      />
      <span v-else class="sidenav__avatar sidenav__avatar--initials">{{ initials }}</span>
      <span class="sidenav__member-text">
        <span class="sidenav__member-name">{{ store.displayName.value }}</span>
        <span class="sidenav__member-meta">
          Week {{ store.clock.value.week }} · {{ store.clock.value.title }}
        </span>
      </span>
    </NuxtLink>
  </aside>
</template>

<style scoped lang="scss">
.sidenav {
  display: none;
}

@media (min-width: 1024px) {
  .sidenav {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: var(--sidenav-width);
    flex-shrink: 0;
    padding: 26px 18px 22px;
    background: var(--paper-raised);
    border-right: 1px solid var(--hairline);
    overflow-y: auto;
  }

  .sidenav__brand {
    padding: 0 10px 22px;
  }

  .sidenav__nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .sidenav__item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 11px 12px;
    border-radius: var(--radius-md);
    color: var(--violet-45);
    font-size: 14px;
    font-weight: 600;
    transition:
      background 0.15s ease,
      color 0.15s ease;

    &:hover {
      background: var(--fill-subtle);
      color: var(--ink);
    }

    &--secondary {
      font-size: 13px;
      padding: 9px 12px;
    }

    &--active {
      background: var(--surface-inverse);
      color: var(--on-inverse);

      &:hover {
        background: var(--surface-inverse);
        color: var(--on-inverse);
      }

      .sidenav__icon {
        color: var(--rose);
      }
    }
  }

  .sidenav__icon {
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }

  .sidenav__badge {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--rose-fill);
    margin-left: auto;
  }

  .sidenav__cta {
    margin-top: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 13px 14px;
    border-radius: var(--radius-md);
    background: var(--rose-fill);
    /* The stroke, the rose cast, the hover lift and the press are all the
       `btn-raised` recipe; this only names the face they come from. */
    --btn-face: var(--rose-fill);
    color: var(--on-rose);
    font-size: 13.5px;
    font-weight: 700;
  }

  .sidenav__divider {
    height: 1px;
    margin: 18px 12px 12px;
    background: var(--fill-subtle);
  }

  .sidenav__spacer {
    flex: 1;
    min-height: 20px;
  }

  .sidenav__inbox {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    margin-bottom: 6px;
    border-radius: var(--radius-md);
    color: var(--violet-45);
    font-size: 13px;
    font-weight: 600;

    &:hover {
      background: var(--fill-subtle);
      color: var(--ink);
    }
  }

  .sidenav__count {
    margin-left: auto;
    min-width: 20px;
    padding: 2px 6px;
    border-radius: var(--radius-pill);
    background: var(--rose-fill);
    color: var(--on-rose);
    font-size: 10px;
    font-weight: 700;
    text-align: center;
  }

  .sidenav__member {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px;
    border-radius: var(--radius-md);
    background: var(--paper);
    transition: background 0.15s ease;

    &:hover {
      background: var(--fill-subtle);
    }
  }

  .sidenav__avatar {
    width: 36px;
    height: 36px;
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
      font-size: 13px;
    }
  }

  .sidenav__member-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .sidenav__member-name {
    font-size: 13.5px;
    font-weight: 700;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sidenav__member-meta {
    font-family: var(--font-eyebrow);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-size: 8.5px;
    font-weight: 700;
    color: var(--violet-45);
  }
}
</style>
