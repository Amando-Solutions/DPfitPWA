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
  <article v-if="guide && !locked" class="guide">
    <ScreenHeader title="Guide" />

    <header class="guide__header">
      <EyebrowLabel>{{ guide.category }}</EyebrowLabel>
      <h1 class="guide__title display-lg">{{ guide.title }}</h1>
      <p class="guide__meta data">
        {{ steps.length }} steps · {{ guide.readMinutes }} min read
      </p>
    </header>

    <p class="guide__excerpt">{{ guide.excerpt }}</p>

    <ol class="guide__steps">
      <li v-for="(step, index) in steps" :key="index" class="guide__step">
        <span class="guide__step-n data">{{ index + 1 }}</span>
        <p class="guide__step-body">{{ step }}</p>
      </li>
    </ol>

    <AppButton variant="secondary" to="/guides" icon="arrowLeft" class="guide__back">
      All guides
    </AppButton>
  </article>
</template>

<style scoped lang="scss">
.guide {
  padding: 0 20px;

  &__header {
    padding: 4px 0 0;
  }

  &__title {
    margin: 8px 0 6px;
  }

  &__meta {
    margin: 0;
    font-size: 10.5px;
    letter-spacing: 0.45px;
    color: var(--violet-45);
  }

  &__excerpt {
    margin: 16px 0 20px;
    font-size: 15px;
    line-height: 1.55;
    color: var(--ink);
    font-weight: 600;
  }

  &__steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  &__step {
    display: flex;
    gap: 12px;
    padding: 16px;
    border-radius: var(--radius-card);
    background: var(--paper-raised);
    box-shadow: var(--shadow-card);
  }

  &__step-n {
    width: 26px;
    height: 26px;
    flex-shrink: 0;
    border-radius: var(--radius-pill);
    background: var(--rose-25);
    color: var(--rose);
    display: grid;
    place-items: center;
    font-size: 12px;
    font-weight: 700;
  }

  &__step-body {
    margin: 0;
    font-size: 13.5px;
    line-height: 1.55;
    color: var(--ink);
  }

  &__back {
    margin-top: 20px;
  }
}

@media (min-width: 1024px) {
  .guide {
    padding: 0;
    max-width: 720px;

    &__excerpt {
      font-size: 17px;
    }

    &__step-body {
      font-size: 15px;
    }
  }
}
</style>
