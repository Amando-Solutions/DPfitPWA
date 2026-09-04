<script setup lang="ts">
/**
 * The wordmark: DP, a rose full stop, FITNESS. Set in Chivo Black at whatever
 * size the caller gives it, because the header prints it at 20px and the footer
 * at 17px and nothing else about it changes.
 */
withDefaults(defineProps<{ size?: string }>(), { size: '20px' })
</script>

<template>
  <span
    class="font-display font-black tracking-[-0.02em] text-white"
    :style="{ fontSize: size }"
  >
    DP<span class="text-[var(--rose-fill)]">.</span>FITNESS
  </span>
</template>
