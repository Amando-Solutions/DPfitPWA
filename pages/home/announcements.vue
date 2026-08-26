<script setup lang="ts">
// 11 · Home · Announcement Deck
definePageMeta({ layout: 'app' })

import { announcements } from '~/data/program'
</script>

<template>
  <div class="deck">
    <ScreenHeader title="Announcements" />

    <div class="deck__intro [padding:0_20px_16px] lg:[padding:0_0_22px]">
      <EyebrowLabel>From your coach</EyebrowLabel>
      <h1 class="deck__title display-lg [margin:10px_0_0]">What's new this week</h1>
    </div>

    <div class="deck__cards [display:flex] [flex-direction:column] [gap:14px] [padding:0_20px] lg:[display:grid] lg:[grid-template-columns:repeat(2,_minmax(0,_1fr))] lg:[align-items:start] lg:[gap:18px] lg:[padding:0]">
      <AppCard
        v-for="a in announcements"
        :key="a.id"
        :variant="a.accent === 'ink' ? 'ink' : 'raised'"
        class="deck__card [position:relative] [overflow:hidden] [display:flex] [flex-direction:column] [gap:10px] [padding-left:22px] [&.deck__card--ink_.deck__card-body]:[color:var(--on-inverse-soft)]"
        :class="`deck__card--${a.accent}`"
      >
        <div class="deck__accent-bar [position:absolute] [left:0] [top:0] [bottom:0] [width:5px] [&.deck__accent-bar--rose]:[background:var(--rose-fill)] [&.deck__accent-bar--orange]:[background:var(--orange)] [&.deck__accent-bar--ink]:[background:var(--rose-fill)]" :class="`deck__accent-bar--${a.accent}`" />
        <EyebrowLabel :tone="a.accent === 'ink' ? 'rose-on-inverse' : 'rose'">
          {{ a.eyebrow }}
        </EyebrowLabel>
        <h2 class="deck__card-title [margin:0] [font-family:var(--font-display)] [font-weight:900] [font-size:18px] [line-height:1.15] lg:[font-size:20px]">{{ a.title }}</h2>
        <p class="deck__card-body [margin:0] [font-size:13.5px] [line-height:1.5] [color:var(--violet-45)] lg:[font-size:14.5px]">{{ a.body }}</p>
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
