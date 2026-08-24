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
    <div class="intro__row">
      <div class="intro__identity">
        <EyebrowLabel>{{ eyebrow }}</EyebrowLabel>
        <h1 class="intro__title">{{ title }}</h1>
      </div>

      <div v-if="$slots.actions" class="intro__actions">
        <slot name="actions" />
      </div>

      <div v-else-if="actions" class="intro__actions">
        <div class="statpill">
          <NuxtLink
            to="/rewards?tab=streak"
            class="statpill__half"
            :aria-label="`${store.rewards.value.streakWeeks} week streak, see rewards`"
          >
            <span class="statpill__chip statpill__chip--flame">
              <AppIcon name="flame" :size="14" />
            </span>
            <span class="statpill__value data">{{ store.rewards.value.streakWeeks }}</span>
          </NuxtLink>
          <span class="statpill__divider" />
          <NuxtLink
            to="/rewards?tab=badges"
            class="statpill__half"
            :aria-label="`${store.rewards.value.badgeCount} badges earned, see rewards`"
          >
            <span class="statpill__chip statpill__chip--rose">
              <AppIcon name="trophy" :size="14" />
            </span>
            <span class="statpill__value data">{{ store.rewards.value.badgeCount }}</span>
          </NuxtLink>
        </div>

        <NuxtLink to="/notifications" class="intro__bell" aria-label="Notifications">
          <AppIcon name="bell" :size="19" />
          <span v-if="store.unreadNotifications.value" class="intro__bell-dot" />
        </NuxtLink>
      </div>
    </div>

    <p v-if="subtitle" class="intro__sub">{{ subtitle }}</p>
    <slot name="sub" />
  </header>
</template>

<style scoped lang="scss">
.intro {
  &__row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }

  &__identity {
    min-width: 0;
  }

  &__title {
    margin: 5px 0 0;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 24px;
    line-height: 1.08;
    letter-spacing: -0.48px;
    color: var(--ink);
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: 7px;
    flex-shrink: 0;
  }

  &__bell {
    position: relative;
    width: 42px;
    height: 42px;
    border-radius: var(--radius-pill);
    background: var(--paper-raised);
    border: 1px solid var(--hairline);
    filter: var(--drop-sm);
    display: grid;
    place-items: center;
    color: var(--ink);
    flex-shrink: 0;
  }

  &__bell-dot {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--rose-fill);
    border: 1.5px solid var(--paper-raised);
  }

  &__sub {
    margin: 3px 0 0;
    font-size: 13.5px;
    line-height: 1.45;
    color: var(--violet-28);
  }
}

.statpill {
  display: flex;
  align-items: center;
  height: 42px;
  padding: 0 7px;

  &__half {
    display: flex;
    align-items: center;
    gap: 5px;
    color: inherit;
  }
  border-radius: var(--radius-pill);
  background: var(--paper-raised);
  border: 1px solid var(--hairline);
  filter: var(--drop-sm);

  &__chip {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-pill);
    display: grid;
    place-items: center;
    flex-shrink: 0;

    &--flame {
      background: var(--orange-soft);
    }
    &--rose {
      background: var(--rose-soft);
      color: var(--rose);
    }
  }

  &__value {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: -0.12px;
    color: var(--ink);
  }

  &__divider {
    width: 1px;
    height: 18px;
    background: var(--fill-muted);
    margin: 0 3px;
  }
}

@media (min-width: 1024px) {
  .intro__title {
    font-size: 32px;
  }

  .intro__sub {
    font-size: 15px;
  }
}
</style>
