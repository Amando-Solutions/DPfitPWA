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
  <div class="tabbar-dock [position:absolute] [left:0] [right:0] [bottom:0] [padding:0_14px_calc(14px_+_env(safe-area-inset-bottom))] [background:linear-gradient(to_top,_var(--paper)_58%,_var(--surface-fade))] [z-index:50] [pointer-events:none] lg:[display:none]">
    <nav class="tabbar [pointer-events:auto] [display:flex] [align-items:center] [gap:2px] [padding:9px_8px] [background:var(--surface-inverse)] [border-radius:26px] [box-shadow:var(--shadow-tabbar)] [@media(min-width:_640px)_and_(max-width:_1023.98px)]:[width:min(520px,_100%)] [@media(min-width:_640px)_and_(max-width:_1023.98px)]:[margin:0_auto]">
      <NuxtLink
        v-for="tab in navItems"
        :key="tab.key"
        :to="tab.center ? trainTo : tab.to"
        :aria-current="isActive(tab.to) ? 'page' : undefined"
        class="tabbar__item [display:flex] [flex-direction:column] [align-items:center] [gap:4px] [flex:1] [min-width:0] [padding:7px_0_5px] [color:var(--on-inverse-muted)] [transition:color_0.15s_ease] [&.tabbar\_\_item--active]:[color:var(--on-inverse)] [&.tabbar\_\_item--active_.tabbar\_\_icon]:[color:var(--rose-on-inverse)] [&.tabbar\_\_item--active_.tabbar\_\_halo]:[opacity:1] [&.tabbar\_\_item--center]:[flex:0_0_60px] [&.tabbar\_\_item--center]:[padding:0]"
        :class="{
          'tabbar__item--active': isActive(tab.to),
          'tabbar__item--center': tab.center,
        }"
      >
        <template v-if="tab.center">
          <span class="tabbar__center-slot [position:relative] [width:50px] [height:31px]">
            <span class="tabbar__center-btn [position:absolute] [left:0] [top:-19px] [width:50px] [height:50px] [border-radius:var(--radius-pill)] [background:var(--rose-fill)] [color:var(--on-rose)] [display:grid] [place-items:center] [border:4px_solid_var(--surface-inverse)] [filter:drop-shadow(0_8px_10px_var(--rose-strong))]">
              <AppIcon :name="tab.icon" :size="23" />
            </span>
          </span>
          <span class="tabbar__label [font-family:var(--font-data)] [font-size:8.5px] [letter-spacing:0.51px] [text-transform:uppercase] [line-height:1]">{{ tab.label }}</span>
        </template>
        <template v-else>
          <span class="tabbar__icon [position:relative] [display:grid] [place-items:center]">
            <!-- The selected pill, drawn out of flow so switching tabs cannot
                 move the bar or the raised centre button by a pixel. It is the
                 half of the active state that reads at a glance; the rose the
                 glyph takes alongside it is the half that says which tab. -->
            <span
              class="tabbar__halo [position:absolute] [inset:-4px_-13px] [border-radius:var(--radius-pill)] [background:var(--face-on-inverse)] [opacity:0] [transition:opacity_0.18s_ease]"
              aria-hidden="true"
            />
            <AppIcon :name="tab.icon" :size="21" :stroke="2" class="[position:relative]" />
            <span
              v-if="hasDot(tab.key)"
              class="tabbar__dot [position:absolute] [top:-1px] [right:-2px] [width:7px] [height:7px] [border-radius:50%] [background:var(--rose-fill)] [border:1.5px_solid_var(--surface-inverse)]"
            />
          </span>
          <span class="tabbar__label [font-family:var(--font-data)] [font-size:8.5px] [letter-spacing:0.51px] [text-transform:uppercase] [line-height:1]">{{ tab.label }}</span>
        </template>
      </NuxtLink>
    </nav>
  </div>
</template>
