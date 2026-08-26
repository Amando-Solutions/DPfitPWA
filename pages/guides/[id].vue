<script setup lang="ts">
// 26 · Program Guide · Expanded
definePageMeta({ layout: 'app' })

import { guides } from '~/data/program'

const route = useRoute()
const router = useRouter()
const store = useAppStore()

const guide = computed(() => guides.find((g) => g.id === String(route.params.id)))
const steps = computed(() => guide.value?.body.split('\n\n').filter(Boolean) ?? [])
const locked = computed(() =>
  guide.value ? store.clock.value.week < guide.value.unlockWeek : false,
)

// A guide that isn't theirs yet shouldn't be readable by URL.
watchEffect(() => {
  if (!guide.value || locked.value) router.replace('/guides')
})
</script>

<template>
  <article v-if="guide && !locked" class="guide [padding:0_20px] lg:[padding:0] lg:[max-width:720px]">
    <ScreenHeader title="Guide" />

    <header class="guide__header [padding:4px_0_0]">
      <EyebrowLabel>{{ guide.category }}</EyebrowLabel>
      <h1 class="guide__title display-lg [margin:8px_0_6px]">{{ guide.title }}</h1>
      <p class="guide__meta data [margin:0] [font-size:10.5px] [letter-spacing:0.45px] [color:var(--violet-45)]">
        {{ steps.length }} steps · {{ guide.readMinutes }} min read
      </p>
    </header>

    <p class="guide__excerpt [margin:16px_0_20px] [font-size:15px] [line-height:1.55] [color:var(--ink)] [font-weight:600] lg:[font-size:17px]">{{ guide.excerpt }}</p>

    <ol class="guide__steps [list-style:none] [margin:0] [padding:0] [display:flex] [flex-direction:column] [gap:12px]">
      <li v-for="(step, index) in steps" :key="index" class="guide__step [display:flex] [gap:12px] [padding:16px] [border-radius:var(--radius-card)] [background:var(--paper-raised)] [box-shadow:var(--shadow-card)]">
        <span class="guide__step-n data [width:26px] [height:26px] [flex-shrink:0] [border-radius:var(--radius-pill)] [background:var(--rose-soft)] [color:var(--rose)] [display:grid] [place-items:center] [font-size:12px] [font-weight:700]">{{ index + 1 }}</span>
        <p class="guide__step-body [margin:0] [font-size:13.5px] [line-height:1.55] [color:var(--ink)] lg:[font-size:15px]">{{ step }}</p>
      </li>
    </ol>

    <AppButton variant="secondary" to="/guides" icon="arrowLeft" class="guide__back [margin-top:20px]">
      All guides
    </AppButton>
  </article>
</template>
