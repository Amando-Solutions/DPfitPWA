<script setup lang="ts">
withDefaults(
  defineProps<{ size?: 'sm' | 'md' | 'lg'; stacked?: boolean }>(),
  { size: 'md', stacked: false },
)
</script>

<template>
  <div class="wordmark" :class="[`wordmark--${size}`, { 'wordmark--stacked': stacked }]">
    <span class="wordmark__dp">DP</span>
    <span class="wordmark__fitness">FITNESS</span>
  </div>
</template>

<style scoped lang="scss">
.wordmark {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;

  &__dp {
    font-family: var(--font-display);
    font-weight: 900;
    color: var(--rose);
    letter-spacing: -1px;
  }
  &__fitness {
    font-family: var(--font-data);
    font-weight: 700;
    letter-spacing: 1.8px;
    color: #28242a;
  }

  &--sm {
    .wordmark__dp {
      font-size: 21px;
      letter-spacing: -1.05px;
    }
    .wordmark__fitness {
      font-size: 10px;
    }
  }
  &--md {
    .wordmark__dp {
      font-size: 28px;
    }
    .wordmark__fitness {
      font-size: 14px;
    }
  }
  &--lg {
    .wordmark__dp {
      font-size: 44px;
    }
    .wordmark__fitness {
      font-size: 20px;
    }
  }

  &--stacked {
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }
}
</style>
