<script setup lang="ts">
// The header every top-level screen shares: eyebrow + title on the left, the
// inbox button on the right, and an optional subtitle underneath.
//
// The streak/badge stat pill that used to sit beside the bell is gone. It was
// two counters repeated on every screen, both of which have a home of their own
// on Rewards, and on Home it sat directly above a hero card already saying the
// same thing. Notifications stay, as an icon at the top of the screen rather
// than a row buried in More.
withDefaults(
  defineProps<{
    eyebrow?: string
    title: string
    subtitle?: string
    /** Hide the inbox button on screens the design doesn't give it to. */
    actions?: boolean
  }>(),
  { actions: true },
)

const store = useAppStore()
</script>

<template>
  <header class="intro">
    <div class="intro__row flex items-start justify-between gap-2.5">
      <div class="intro__identity min-w-0">
        <EyebrowLabel v-if="eyebrow">{{ eyebrow }}</EyebrowLabel>
        <h1 class="intro__title mt-1.25 mx-0 mb-0 font-display font-black text-[24px] leading-[1.08] tracking-[-0.48px] text-ink lg:text-[32px]">{{ title }}</h1>
      </div>

      <div v-if="$slots.actions" class="intro__actions flex items-center gap-1.75 shrink-0">
        <slot name="actions" />
      </div>

      <NuxtLink
        v-else-if="actions"
        to="/notifications"
        class="intro__bell relative w-10.5 h-10.5 rounded-pill bg-raised border border-hairline grid place-items-center text-ink shrink-0"
        aria-label="Notifications"
      >
        <AppIcon name="bell" :size="19" />
        <span v-if="store.unreadNotifications.value" class="intro__bell-dot absolute top-2 right-2 w-2 h-2 rounded-full bg-rose-fill border-[1.5px] border-raised" />
      </NuxtLink>
    </div>

    <p v-if="subtitle" class="intro__sub mt-0.75 mx-0 mb-0 text-[13.5px] leading-[1.45] text-soft lg:text-[15px]">{{ subtitle }}</p>
    <slot name="sub" />
  </header>
</template>
