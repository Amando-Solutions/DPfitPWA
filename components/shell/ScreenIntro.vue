<script setup lang="ts">
// The header every top-level screen shares in the design: eyebrow + title on
// the left, the streak/badge pill and the inbox button on the right, and the
// subtitle on its own full-width line underneath.
withDefaults(
  defineProps<{
    eyebrow: string
    title: string
    subtitle?: string
    /** Hide the stat pill + bell on screens the design doesn't give them to. */
    actions?: boolean
  }>(),
  { actions: true },
)

const store = useAppStore()
</script>

<template>
  <header class="intro">
    <div class="intro__row [display:flex] [align-items:flex-start] [justify-content:space-between] [gap:10px]">
      <div class="intro__identity [min-width:0]">
        <EyebrowLabel>{{ eyebrow }}</EyebrowLabel>
        <h1 class="intro__title [margin:5px_0_0] [font-family:var(--font-display)] [font-weight:900] [font-size:24px] [line-height:1.08] [letter-spacing:-0.48px] [color:var(--ink)] lg:[font-size:32px]">{{ title }}</h1>
      </div>

      <div v-if="$slots.actions" class="intro__actions [display:flex] [align-items:center] [gap:7px] [flex-shrink:0]">
        <slot name="actions" />
      </div>

      <div v-else-if="actions" class="intro__actions [display:flex] [align-items:center] [gap:7px] [flex-shrink:0]">
        <div class="statpill [display:flex] [align-items:center] [height:42px] [padding:0_7px] [border-radius:var(--radius-pill)] [background:var(--paper-raised)] [border:1px_solid_var(--hairline)] [filter:var(--drop-sm)]">
          <NuxtLink
            to="/rewards?tab=streak"
            class="statpill__half [display:flex] [align-items:center] [gap:5px] [color:inherit]"
            :aria-label="`${store.rewards.value.streakWeeks} week streak, see rewards`"
          >
            <span class="statpill__chip statpill__chip--flame [width:28px] [height:28px] [border-radius:var(--radius-pill)] [display:grid] [place-items:center] [flex-shrink:0] [background:var(--orange-soft)]">
              <AppIcon name="flame" :size="14" />
            </span>
            <span class="statpill__value data [font-size:12px] [font-weight:700] [letter-spacing:-0.12px] [color:var(--ink)]">{{ store.rewards.value.streakWeeks }}</span>
          </NuxtLink>
          <span class="statpill__divider [width:1px] [height:18px] [background:var(--fill-muted)] [margin:0_3px]" />
          <NuxtLink
            to="/rewards?tab=badges"
            class="statpill__half [display:flex] [align-items:center] [gap:5px] [color:inherit]"
            :aria-label="`${store.rewards.value.badgeCount} badges earned, see rewards`"
          >
            <span class="statpill__chip statpill__chip--rose [width:28px] [height:28px] [border-radius:var(--radius-pill)] [display:grid] [place-items:center] [flex-shrink:0] [background:var(--rose-soft)] [color:var(--rose)]">
              <AppIcon name="trophy" :size="14" />
            </span>
            <span class="statpill__value data [font-size:12px] [font-weight:700] [letter-spacing:-0.12px] [color:var(--ink)]">{{ store.rewards.value.badgeCount }}</span>
          </NuxtLink>
        </div>

        <NuxtLink to="/notifications" class="intro__bell [position:relative] [width:42px] [height:42px] [border-radius:var(--radius-pill)] [background:var(--paper-raised)] [border:1px_solid_var(--hairline)] [filter:var(--drop-sm)] [display:grid] [place-items:center] [color:var(--ink)] [flex-shrink:0]" aria-label="Notifications">
          <AppIcon name="bell" :size="19" />
          <span v-if="store.unreadNotifications.value" class="intro__bell-dot [position:absolute] [top:8px] [right:8px] [width:8px] [height:8px] [border-radius:50%] [background:var(--rose-fill)] [border:1.5px_solid_var(--paper-raised)]" />
        </NuxtLink>
      </div>
    </div>

    <p v-if="subtitle" class="intro__sub [margin:3px_0_0] [font-size:13.5px] [line-height:1.45] [color:var(--violet-28)] lg:[font-size:15px]">{{ subtitle }}</p>
    <slot name="sub" />
  </header>
</template>
