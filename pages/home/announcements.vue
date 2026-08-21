<script setup lang="ts">
// 11 · Home · Announcement Deck
definePageMeta({ layout: 'app' })

import { announcements } from '~/data/program'
</script>

<template>
  <div class="deck">
    <ScreenHeader title="Announcements" />

    <div class="deck__intro">
      <EyebrowLabel>From your coach</EyebrowLabel>
      <h1 class="deck__title display-lg">What's new this week</h1>
    </div>

    <div class="deck__cards">
      <AppCard
        v-for="a in announcements"
        :key="a.id"
        :variant="a.accent === 'ink' ? 'ink' : 'raised'"
        class="deck__card"
        :class="`deck__card--${a.accent}`"
      >
        <div class="deck__accent-bar" :class="`deck__accent-bar--${a.accent}`" />
        <EyebrowLabel :tone="a.accent === 'ink' ? 'rose-on-inverse' : 'rose'">
          {{ a.eyebrow }}
        </EyebrowLabel>
        <h2 class="deck__card-title">{{ a.title }}</h2>
        <p class="deck__card-body">{{ a.body }}</p>
        <AppButton
          v-if="a.cta"
          :variant="a.accent === 'ink' ? 'primary' : 'secondary'"
          size="md"
          :block="false"
          icon-right="arrowRight"
        >
          {{ a.cta }}
        </AppButton>
      </AppCard>
    </div>
  </div>
</template>

<style scoped lang="scss">
.deck {
  &__intro {
    padding: 0 20px 16px;
  }
  &__title {
    margin: 10px 0 0;
  }
  &__cards {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 0 20px;
  }
  &__card {
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-left: 22px;
  }
  &__accent-bar {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 5px;

    &--rose {
      background: var(--rose-fill);
    }
    &--orange {
      background: var(--orange);
    }
    &--ink {
      background: var(--rose-fill);
    }
  }
  &__card-title {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 18px;
    line-height: 1.15;
  }
  &__card-body {
    margin: 0;
    font-size: 13.5px;
    line-height: 1.5;
    color: var(--violet-45);

    .deck__card--ink & {
      color: var(--on-inverse-soft);
    }
  }
}

@media (min-width: 1024px) {
  .deck {
    &__intro {
      padding: 0 0 22px;
    }

    &__cards {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: start;
      gap: 18px;
      padding: 0;
    }

    &__card-title {
      font-size: 20px;
    }

    &__card-body {
      font-size: 14.5px;
    }
  }
}

</style>
