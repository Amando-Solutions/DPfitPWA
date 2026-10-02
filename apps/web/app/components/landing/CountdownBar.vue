<script setup lang="ts">
/**
 * The plum strip above the header, counting down to whatever happens next.
 *
 * Reads the active cohort's pre-order window and start date:
 *   before the pre-order → "enrolment opens in"      → preorder.startsAt
 *   during the pre-order → "enrolment closes in"     → preorder.endsAt
 *   after it             → "the challenge starts in" → cohort start
 * and disappears once there is nothing left to count to, or no cohort at all.
 *
 * The clock only runs in the browser. The server renders "--" in each cell so
 * the strip holds its height and hydration has nothing to disagree about.
 */
const challenge = useChallenge()
const now = ref<number | null>(null)
let timer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  now.value = Date.now()
  timer = setInterval(() => (now.value = Date.now()), 1000)
})
onBeforeUnmount(() => clearInterval(timer))

const target = computed(() => {
  const c = challenge.value
  if (!c) return null
  // The server's clock picks the label on the first render, so it matches
  // what the browser picks a moment later.
  const at = now.value ?? Date.now()
  const preorder = c.preorder
  if (preorder) {
    const opens = Date.parse(preorder.startsAt)
    const closes = Date.parse(preorder.endsAt)
    if (at < opens) return { label: 'enrolment opens in', at: opens }
    if (at < closes) return { label: 'enrolment closes in', at: closes }
  }
  const starts = Date.parse(c.startsAt)
  if (Number.isFinite(starts) && at < starts) {
    return { label: 'the challenge starts in', at: starts }
  }
  return null
})

const pad = (n: number) => String(n).padStart(2, '0')

const cells = computed(() => {
  if (!target.value || now.value === null) {
    return ['days', 'hrs', 'min', 'sec'].map((unit) => ({ unit, value: '--' }))
  }
  const diff = Math.max(0, target.value.at - now.value)
  return [
    { unit: 'days', value: pad(Math.floor(diff / 86_400_000)) },
    { unit: 'hrs', value: pad(Math.floor(diff / 3_600_000) % 24) },
    { unit: 'min', value: pad(Math.floor(diff / 60_000) % 60) },
    { unit: 'sec', value: pad(Math.floor(diff / 1000) % 60) },
  ]
})
</script>

<template>
  <div
    v-if="target"
    class="flex flex-wrap items-center justify-center gap-x-4.5 gap-y-2 bg-lp-ink px-4 py-2.5 text-[13px] text-lp-paper sm:px-5"
  >
    <span class="opacity-80">{{ target.label }}</span>
    <!-- `timer` is announced politely and only by a screen reader that asks:
         a live region ticking every second would be unbearable. -->
    <div role="timer" aria-live="off" class="flex gap-1.5 tabular-nums">
      <span
        v-for="cell in cells"
        :key="cell.unit"
        class="flex items-baseline gap-1 rounded-full bg-white/10 px-2.5 py-1 sm:px-3 sm:py-1.5"
      >
        <b class="text-[15px] font-semibold">{{ cell.value }}</b>
        <span class="text-[11px] opacity-75">{{ cell.unit }}</span>
      </span>
    </div>
  </div>
</template>
