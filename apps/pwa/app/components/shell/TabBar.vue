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
  <div class="tabbar-dock [position:absolute] [left:0] [right:0] [bottom:0] [padding:0_14px_calc(14px_+_env(safe-area-inset-bottom))] [background:linear-gradient(to_top,_var(--paper)_58%,_var(--surface-fade))] [z-index:50] [pointer-events:none] lg:[display:none]">
    <nav class="tabbar [pointer-events:auto] [display:flex] [align-items:center] [gap:2px] [padding:9px_8px] [background:var(--surface-inverse)] [border-radius:26px] [box-shadow:var(--shadow-tabbar)] [@media(min-width:_640px)_and_(max-width:_1023.98px)]:[width:min(520px,_100%)] [@media(min-width:_640px)_and_(max-width:_1023.98px)]:[margin:0_auto]">
      <NuxtLink
        v-for="tab in navItems"
        :key="tab.key"
        :to="tab.center ? trainTo : tab.to"
        class="tabbar__item [display:flex] [flex-direction:column] [align-items:center] [gap:4px] [flex:1] [min-width:0] [padding:7px_0_5px] [color:var(--on-inverse-muted)] [transition:color_0.15s_ease] [&.tabbar__item--active]:[color:var(--on-inverse)] [&.tabbar__item--center]:[flex:0_0_60px] [&.tabbar__item--center]:[padding:0]"
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
            <AppIcon :name="tab.icon" :size="21" :stroke="2" />
            <span
              v-if="tab.key === 'home' && store.unreadNotifications.value"
              class="tabbar__dot [position:absolute] [top:-1px] [right:-2px] [width:7px] [height:7px] [border-radius:50%] [background:var(--rose-fill)] [border:1.5px_solid_var(--surface-inverse)]"
            />
          </span>
          <span class="tabbar__label [font-family:var(--font-data)] [font-size:8.5px] [letter-spacing:0.51px] [text-transform:uppercase] [line-height:1]">{{ tab.label }}</span>
        </template>
      </NuxtLink>
    </nav>
  </div>
</template>
