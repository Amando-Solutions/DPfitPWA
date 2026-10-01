<script setup lang="ts">
import { REGISTER_ANCHOR } from '~/data/landing'

/**
 * The booking bar pinned to the bottom of a phone screen. Hidden from `md` up,
 * where the header's button is always in view. The footer pads its bottom by
 * the bar's height so the last line is never underneath it.
 */
const { price, closesTiny, state } = useCohortLabels()
const caption = computed(() => {
  if (state.value === 'open' && closesTiny.value) return `closes ${closesTiny.value}`
  if (state.value === 'upcoming') return 'enrolment opens soon'
  if (state.value === 'closed') return 'enrolment closed'
  return null
})
</script>

<template>
  <div
    class="fixed inset-x-3 bottom-3 z-40 flex items-center justify-between gap-3 rounded-full bg-lp-ink py-2 pr-2 pl-5 text-lp-paper shadow-[0_16px_40px_-12px_rgba(29,22,40,0.5)] md:hidden"
  >
    <span class="flex flex-col text-[12px] leading-[1.3]">
      <b class="text-[15px] font-semibold">{{ price ?? 'body recomp' }}</b>
      <span v-if="caption" class="opacity-75">{{ caption }}</span>
    </span>
    <a
      :href="REGISTER_ANCHOR"
      class="rounded-full bg-lp-paper px-5 py-[13px] text-[14px] font-semibold text-lp-ink"
    >book a slot ↗</a>
  </div>
</template>
