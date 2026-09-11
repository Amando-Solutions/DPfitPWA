<script setup lang="ts">
// Mobile primary navigation: the floating bar from the Figma UI, including the
// gradient scrim that fades content out behind it. Hidden from 1024px up, where
// SideNav takes over.
const { navItems, isActive } = useNavigation()
const store = useAppStore()
const chat = useChatUnread()

// The centre action goes straight into whichever session is open — today's, or
// the oldest day still owed when today's is already logged — rather than the
// picker. Only when nothing at all is open does it fall back to the picker,
// which is the screen that can explain why.
const trainTo = computed(() =>
  store.trainingLocked.value ? '/train' : `/train/${store.today.value?.id ?? ''}`,
)

/**
 * Which tabs are carrying something the member has not seen.
 *
 * Two of them, for two different inboxes: Home stands in for the notification
 * inbox, and Chat for the cohort room and the coach DM together. Both are the
 * same dot, because the question a dot answers — is there something here for me
 * — is the same one either way.
 */
const hasDot = (key: string): boolean => {
  if (key === 'home') return store.unreadNotifications.value > 0
  if (key === 'chat') return chat.hasUnread.value
  return false
}
</script>

<template>
  <div class="tabbar-dock pointer-events-none absolute inset-x-0 bottom-0 z-50 bg-linear-to-t from-(--paper) from-58% to-(--surface-fade) px-3.5 pt-0 pb-[calc(14px+env(safe-area-inset-bottom))] lg:hidden">
    <nav class="tabbar pointer-events-auto flex items-center gap-0.5 rounded-[26px] bg-inverse px-2 py-2.25 shadow-(--shadow-tabbar) sm:max-lg:mx-auto sm:max-lg:w-[min(520px,100%)]">
      <NuxtLink
        v-for="tab in navItems"
        :key="tab.key"
        :to="tab.center ? trainTo : tab.to"
        :aria-current="isActive(tab.to) ? 'page' : undefined"
        class="tabbar__item group flex min-w-0 flex-col items-center gap-1 text-on-inverse-muted transition-colors duration-150 ease-[ease] aria-[current=page]:text-on-inverse"
        :class="tab.center ? 'tabbar__item--center w-15 flex-none p-0' : 'flex-1 px-0 pt-1.75 pb-1.25'"
      >
        <template v-if="tab.center">
          <span class="tabbar__center-slot relative h-7.75 w-12.5">
            <span class="tabbar__center-btn absolute -top-4.75 left-0 grid size-12.5 place-items-center rounded-pill border-4 border-inverse bg-rose-fill text-on-rose drop-shadow-[0_8px_10px_var(--rose-strong)]">
              <AppIcon :name="tab.icon" :size="23" />
            </span>
          </span>
          <span class="tabbar__label font-data text-[8.5px] leading-none tracking-[0.51px] uppercase">{{ tab.label }}</span>
        </template>
        <template v-else>
          <span class="tabbar__icon relative grid place-items-center group-aria-[current=page]:text-rose-on-inverse">
            <!-- The selected pill, drawn out of flow so switching tabs cannot
                 move the bar or the raised centre button by a pixel. It is the
                 half of the active state that reads at a glance; the rose the
                 glyph takes alongside it is the half that says which tab. -->
            <span
              class="tabbar__halo absolute -inset-x-3.25 -inset-y-1 rounded-pill bg-(--face-on-inverse) opacity-0 transition-opacity duration-180 ease-[ease] group-aria-[current=page]:opacity-100"
              aria-hidden="true"
            />
            <AppIcon :name="tab.icon" :size="21" :stroke="2" class="relative" />
            <span
              v-if="hasDot(tab.key)"
              class="tabbar__dot absolute -top-px -right-0.5 size-1.75 rounded-full border-[1.5px] border-inverse bg-rose-fill"
            />
          </span>
          <span class="tabbar__label font-data text-[8.5px] leading-none tracking-[0.51px] uppercase">{{ tab.label }}</span>
        </template>
      </NuxtLink>
    </nav>
  </div>
</template>
