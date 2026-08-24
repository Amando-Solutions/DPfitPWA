<script setup lang="ts">
// Mobile primary navigation: the floating bar from the Figma UI, including the
// gradient scrim that fades content out behind it. Hidden from 1024px up, where
// SideNav takes over.
const { navItems, isActive } = useNavigation()
const store = useAppStore()

// The centre action goes straight into today's session rather than the picker,
// unless today's is already logged, in which case the picker is the screen that
// can explain why.
const trainTo = computed(() =>
  store.trainingLocked.value ? '/train' : `/train/${store.today.value?.id ?? ''}`,
)
</script>

<template>
  <div class="tabbar-dock">
    <nav class="tabbar">
      <NuxtLink
        v-for="tab in navItems"
        :key="tab.key"
        :to="tab.center ? trainTo : tab.to"
        class="tabbar__item"
        :class="{
          'tabbar__item--active': isActive(tab.to),
          'tabbar__item--center': tab.center,
        }"
      >
        <template v-if="tab.center">
          <span class="tabbar__center-slot">
            <span class="tabbar__center-btn">
              <AppIcon :name="tab.icon" :size="23" />
            </span>
          </span>
          <span class="tabbar__label">{{ tab.label }}</span>
        </template>
        <template v-else>
          <span class="tabbar__icon">
            <AppIcon :name="tab.icon" :size="21" :stroke="2" />
            <span
              v-if="tab.key === 'home' && store.unreadNotifications.value"
              class="tabbar__dot"
            />
          </span>
          <span class="tabbar__label">{{ tab.label }}</span>
        </template>
      </NuxtLink>
    </nav>
  </div>
</template>

<style scoped lang="scss">
.tabbar-dock {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 0 14px calc(14px + env(safe-area-inset-bottom));
  // Content fades out behind the bar instead of colliding with it.
  background: linear-gradient(to top, var(--paper) 58%, var(--surface-fade));
  z-index: 50;
  pointer-events: none;
}

.tabbar {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 9px 8px;
  background: var(--surface-inverse);
  border-radius: 26px;
  box-shadow: var(--shadow-tabbar);
}

.tabbar__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
  padding: 7px 0 5px;
  color: var(--on-inverse-muted);
  transition: color 0.15s ease;

  &--active {
    color: var(--on-inverse);
  }

  // Only the raised button is rose; the label underneath follows the same
  // muted/active rule as its neighbours, so the centre tab doesn't read as
  // permanently selected.
  &--center {
    flex: 0 0 60px;
    padding: 0;
  }
}

// 31px tall in the design; the 50px button hangs 19px above it, which puts it
// ~9px proud of the bar itself.
.tabbar__center-slot {
  position: relative;
  width: 50px;
  height: 31px;
}

.tabbar__icon {
  position: relative;
  display: grid;
  place-items: center;
}

.tabbar__dot {
  position: absolute;
  top: -1px;
  right: -2px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--rose-fill);
  border: 1.5px solid var(--surface-inverse);
}

.tabbar__label {
  font-family: var(--font-data);
  font-size: 8.5px;
  letter-spacing: 0.51px;
  text-transform: uppercase;
  line-height: 1;
}

.tabbar__center-btn {
  position: absolute;
  left: 0;
  top: -19px;
  width: 50px;
  height: 50px;
  border-radius: var(--radius-pill);
  background: var(--rose-fill);
  color: var(--on-rose);
  display: grid;
  place-items: center;
  border: 4px solid var(--surface-inverse);
  filter: drop-shadow(0 8px 10px var(--rose-strong));
}

// Tablets get a centred bar rather than an over-wide one.
@media (min-width: 640px) and (max-width: 1023.98px) {
  .tabbar {
    width: min(520px, 100%);
    margin: 0 auto;
  }
}

@media (min-width: 1024px) {
  .tabbar-dock {
    display: none;
  }
}
</style>
