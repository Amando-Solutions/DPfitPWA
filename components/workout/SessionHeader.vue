<script setup lang="ts">
defineProps<{
  eyebrow: string
  title: string
  duration: string
  volume: number
  setsDone: number
  setsTotal: number
  action?: string // right button label
  unit?: 'kg' | 'lbs'
}>()

const emit = defineEmits<{
  (e: 'action'): void
  (e: 'unit', v: 'kg' | 'lbs'): void
}>()
</script>

<template>
  <header class="shead">
    <div class="shead__overlay" />
    <div class="shead__content">
      <div class="shead__top">
        <div>
          <span class="shead__eyebrow">{{ eyebrow }}</span>
          <h1 class="shead__title">{{ title }}</h1>
        </div>
        <button class="shead__action" @click="emit('action')">
          {{ action ?? 'Cancel' }}
        </button>
      </div>

      <div class="shead__stats">
        <div class="shead__stat">
          <span class="shead__stat-label">Duration</span>
          <span class="shead__stat-value data">{{ duration }}</span>
        </div>
        <div class="shead__stat">
          <span class="shead__stat-label">Volume</span>
          <span class="shead__stat-value data">{{ volume }} kg</span>
        </div>
        <div class="shead__stat">
          <span class="shead__stat-label">Sets</span>
          <span class="shead__stat-value shead__stat-value--accent data"
            >{{ setsDone }}/{{ setsTotal }}</span
          >
        </div>
      </div>

      <div class="shead__unit-row">
        <span class="shead__unit-label">Weight unit</span>
        <div class="shead__toggle">
          <button
            class="shead__toggle-btn"
            :class="{ 'shead__toggle-btn--on': (unit ?? 'kg') === 'kg' }"
            @click="emit('unit', 'kg')"
          >
            KG
          </button>
          <button
            class="shead__toggle-btn"
            :class="{ 'shead__toggle-btn--on': unit === 'lbs' }"
            @click="emit('unit', 'lbs')"
          >
            LBS
          </button>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped lang="scss">
.shead {
  position: relative;
  background: var(--ink);
  color: var(--paper-raised);
  border-radius: 0 0 26px 26px;
  overflow: hidden;

  &__overlay {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(90% 60% at 100% 0%, rgba(200, 30, 92, 0.28), transparent 60%),
      url('https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=500&q=60')
        center/cover;
    opacity: 0.25;
    mix-blend-mode: luminosity;
  }

  &__content {
    position: relative;
    padding: 8px 20px 18px;
  }

  &__top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
  }

  &__eyebrow {
    font-family: var(--font-eyebrow);
    text-transform: uppercase;
    letter-spacing: 1px;
    font-size: 9.5px;
    font-weight: 700;
    color: rgba(251, 246, 242, 0.6);
  }

  &__title {
    margin: 6px 0 0;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 18px;
  }

  &__action {
    padding: 8px 16px;
    border-radius: var(--radius-pill);
    background: rgba(255, 255, 255, 0.14);
    color: var(--paper-raised);
    font-weight: 700;
    font-size: 13px;
    flex-shrink: 0;
  }

  &__stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-bottom: 16px;
  }

  &__stat {
    background: rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__stat-label {
    font-family: var(--font-eyebrow);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-size: 8px;
    color: rgba(251, 246, 242, 0.55);
  }

  &__stat-value {
    font-size: 16px;
    font-weight: 700;

    &--accent {
      color: var(--orange);
    }
  }

  &__unit-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__unit-label {
    font-family: var(--font-eyebrow);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-size: 8.5px;
    color: rgba(251, 246, 242, 0.55);
  }

  &__toggle {
    display: flex;
    gap: 2px;
    padding: 3px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-pill);
  }

  &__toggle-btn {
    min-height: 26px;
    padding: 6px 12px;
    border-radius: var(--radius-pill);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.5px;
    color: rgba(251, 246, 242, 0.6);

    &--on {
      background: var(--paper-raised);
      color: var(--ink);
    }
  }
}

// Desktop: the banner stays full-bleed, its content follows the focus column.
@media (min-width: 1024px) {
  .shead {
    border-radius: 0 0 32px 32px;

    &__content {
      max-width: var(--focus-max);
      margin: 0 auto;
      padding: 20px 40px 26px;
    }

    &__title {
      font-size: 22px;
    }

    &__stats {
      gap: 14px;
    }
  }
}

</style>
