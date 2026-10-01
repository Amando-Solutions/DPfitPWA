<script setup lang="ts">
import { REGISTER_ANCHOR } from '~/data/landing'

/**
 * The booking bar pinned to the bottom of a phone screen. Hidden from `md` up,
 * where the header's button is always in view. The footer pads its bottom by
 * the bar's height so the last line is never underneath it.
 *
 * It slides away while the booking section is on screen: there it would sit
 * over the very fields somebody is filling in, and only repeat the button the
 * form already has.
 */
const { price, closesTiny, state } = useCohortLabels()
const caption = computed(() => {
  if (state.value === 'open' && closesTiny.value) return `closes ${closesTiny.value}`
  if (state.value === 'upcoming') return 'enrolment opens soon'
  if (state.value === 'closed') return 'enrolment closed'
  return null
})

const atForm = ref(false)
let observer: IntersectionObserver | undefined

onMounted(() => {
  const form = document.querySelector(REGISTER_ANCHOR)
  if (!form) return
  observer = new IntersectionObserver(([entry]) => (atForm.value = Boolean(entry?.isIntersecting)))
  observer.observe(form)
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <!-- `bottom` clears the home indicator: the page opts into
       `viewport-fit=cover`, so nothing else keeps the bar off it. -->
  <div
    class="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-40 flex items-center justify-between gap-3 rounded-full bg-lp-ink py-2 pr-2 pl-5 text-lp-paper shadow-[0_16px_40px_-12px_rgba(29,22,40,0.5)] transition-[translate,opacity] duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)] motion-reduce:transition-none md:hidden"
    :class="atForm && 'pointer-events-none translate-y-[calc(100%+24px)] opacity-0'"
    :inert="atForm"
  >
    <span class="flex min-w-0 flex-col gap-0.5 text-[12px] leading-tight">
      <b class="text-[15px] font-semibold">{{ price ?? 'body recomp' }}</b>
      <span v-if="caption" class="truncate opacity-75">{{ caption }}</span>
    </span>
    <a
      :href="REGISTER_ANCHOR"
      class="shrink-0 rounded-full bg-lp-paper px-5 py-3.25 text-[14px] font-semibold text-lp-ink"
    >book a slot ↗</a>
  </div>
</template>
