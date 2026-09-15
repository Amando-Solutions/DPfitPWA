<script setup lang="ts">
// Small uppercase label above a heading. `tone` replaces what used to be a
// free-form `color` string, so every eyebrow lands on a themed token and
// follows light/dark without a per-call-site override.
const props = withDefaults(
  defineProps<{
    tone?: 'primary' | 'primary-on-inverse' | 'muted' | 'soft' | 'inherit'
  }>(),
  { tone: 'primary' },
)

const TONES: Record<NonNullable<typeof props.tone>, string> = {
  primary: 'text-primary',
  // Neither Primary value holds up on a dark card; this is its lifted twin.
  'primary-on-inverse': 'text-primary-on-inverse',
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
