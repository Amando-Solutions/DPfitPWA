<script setup lang="ts">
// Small uppercase label above a heading. `tone` replaces what used to be a
// free-form `color` string, so every eyebrow lands on a themed token and
// follows light/dark without a per-call-site override.
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
    class="inline-block font-eyebrow text-[10.5px] font-bold uppercase tracking-[1px]"
    :class="TONES[tone]"
  >
    <slot />
  </span>
</template>
