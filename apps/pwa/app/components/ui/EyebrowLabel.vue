<script setup lang="ts">
// Small label above a heading. `tone` replaces what used to be a free-form
// `color` string, so every eyebrow lands on a themed token and follows
// light/dark without a per-call-site override.
//
// Sentence case in the body face. This was uppercase Chivo Mono, and because
// every top-level screen opens with one, it was the reason the monospace read
// as the app's voice rather than an accent. The colour already marks it as a
// label; the weight is enough to lift it off the title's shoulder.
const props = withDefaults(
  defineProps<{
    tone?: 'rose' | 'rose-on-inverse' | 'muted' | 'soft' | 'inherit'
  }>(),
  { tone: 'rose' },
)

const TONES: Record<NonNullable<typeof props.tone>, string> = {
  rose: 'text-rose',
  // The deep brand rose is unreadable on a dark card; this is its bright twin.
  'rose-on-inverse': 'text-rose-on-inverse',
  muted: 'text-muted',
  soft: 'text-soft',
  inherit: 'text-current',
}
</script>

<template>
  <span
    class="inline-block text-[12.5px] font-semibold"
    :class="TONES[tone]"
  >
    <slot />
  </span>
</template>
