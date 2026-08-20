<script setup lang="ts">
// Mobile primary navigation — the floating bar from the Figma UI, including the
// gradient scrim that fades content out behind it. Hidden from 1024px up, where
// SideNav takes over.
const { navItems, isActive } = useNavigation()
const store = useAppStore()

// The centre action goes straight into today's session rather than the picker.
const trainTo = computed(() => `/train/${store.today.value?.id ?? ''}`)
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
  background: linear-gradient(to top, var(--paper) 58%, rgba(243, 234, 228, 0));
  z-index: 50;
  pointer-events: none;
}

.tabbar {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 9px 8px;
  background: rgba(36, 27, 46, 0.96);
  border-radius: 26px;
  box-shadow: 0 14px 34px rgba(36, 27, 46, 0.3);
}

.tabbar__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
  padding: 7px 0 5px;
  color: rgba(243, 234, 228, 0.5);
  transition: color 0.15s ease;

  &--active {
    color: var(--white);
  }

  &--center {
    flex: 0 0 60px;
    padding: 0;
    color: var(--white);
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
  background: var(--rose);
  border: 1.5px solid var(--ink);
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
  background: var(--rose);
  color: var(--white);
  display: grid;
  place-items: center;
  border: 4px solid var(--ink);
  filter: drop-shadow(0 8px 10px rgba(200, 30, 92, 0.5));
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
