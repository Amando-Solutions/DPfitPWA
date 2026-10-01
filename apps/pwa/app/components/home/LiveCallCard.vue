<script setup lang="ts">
import type { LiveCallToday } from '~/lib/domain/liveCall'
import { formatTime, trustedNow, zoneLabel } from '~/lib/time'

const props = defineProps<{ call: LiveCallToday }>()

const store = useAppStore()

/**
 * The store's `now` moves at midnight and when the app comes back to the
 * foreground. That is right for a date and wrong for a button that opens at
 * 7 PM, so the card wakes the store itself: once on arrival, since `now` can
 * be hours old by the time Home is opened, and again at the instant the phase
 * changes. Ticking the store rather than keeping a clock of its own keeps this
 * card on the same "now" as everything else on the screen.
 *
 * A timer that fires early only re-arms, because the tick has to land on the
 * far side of the boundary or the phase would not change and nothing would
 * schedule the next one. A backgrounded tab can fire it late instead; the
 * clock plugin's visibility handler covers that.
 */
let timer: ReturnType<typeof setTimeout> | null = null

const stop = () => {
  if (timer) clearTimeout(timer)
  timer = null
}

const wakeAt = (at: number) => {
  stop()
  const wait = at - trustedNow().getTime()
  if (wait <= 0) store.tick()
  else timer = setTimeout(() => wakeAt(at), wait + 250)
}

watch(
  () => props.call.changesAt?.getTime() ?? null,
  (at) => (at === null ? stop() : wakeAt(at)),
  { immediate: true },
)

onMounted(store.tick)
onBeforeUnmount(stop)

/*
  Times here are a courtesy conversion. The slot itself is one instant for the
  whole cohort and never moves; what changes is only how it is written for this
  viewer — in their stored region, not the phone's zone, so a member whose
  phone is still on home time after a flight sees the time where they said
  they would be. Where that differs from the cohort's, the WAT slot is printed
  beside it, so "2:00 PM" is never mistaken for the time the coach announced.
*/
const zone = computed(() => store.memberZone.value)
const cohortZone = computed(() => store.cohortZone.value)

/** "2:00 – 3:00 PM", in the member's region. */
const span = computed(() =>
  new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: zone.value,
  }).formatRange(props.call.startsAt, props.call.endsAt),
)

/** "7:00 PM WAT" — the slot as the cohort has it. */
const anchor = computed(
  () => `${formatTime(props.call.startsAt, cohortZone.value)} ${zoneLabel(cohortZone.value, props.call.startsAt)}`,
)

/** Whether the member's clock reads the same as the cohort's at the call. */
const sameClock = computed(
  () => formatTime(props.call.startsAt, zone.value) === formatTime(props.call.startsAt, cohortZone.value),
)

const detail = computed(() => {
  if (props.call.phase === 'ended') {
    return `Ended at ${formatTime(props.call.endsAt, zone.value)}. Same time next week.`
  }
  return sameClock.value
    ? `${span.value} ${zoneLabel(zone.value, props.call.startsAt)}`
    : `${span.value} your time · ${anchor.value}`
})
</script>

<template>
  <div class="flex flex-col gap-3 rounded-card bg-raised p-4">
    <div class="flex gap-3">
      <span class="grid size-9 shrink-0 place-items-center rounded-pill bg-primary-soft text-primary">
        <AppIcon name="chat" :size="17" />
      </span>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <h2 class="m-0 font-display text-[16px] font-black tracking-[-0.24px] text-ink">
            Live call today
          </h2>
          <span
            v-if="call.phase === 'live'"
            class="shrink-0 rounded-pill bg-primary-soft px-2 py-0.75 text-[11px] text-primary"
          >
            Live now
          </span>
        </div>
        <!-- No `tabular-nums`: this face draws a tabular colon as wide as a
             digit, so "7:00" reads "7 : 00", and nothing here lines up. -->
        <p class="mt-1 mb-0 text-[13px] leading-[1.45] text-muted">
          {{ detail }}
        </p>
      </div>
    </div>

    <!-- An outside link, so it opens away from the app rather than replacing
         the session the member is in the middle of. -->
    <AppButton
      v-if="call.phase === 'live'"
      :to="call.joinUrl"
      size="md"
      target="_blank"
      rel="noopener noreferrer"
    >
      Join the call
    </AppButton>
    <!-- No `to` at all while it is shut. A disabled link is still a link to a
         keyboard, and the URL is not somewhere to be before the call starts. -->
    <AppButton v-else size="md" disabled>
      {{ call.phase === 'upcoming' ? `Opens at ${formatTime(call.startsAt, zone)}` : 'Call ended' }}
    </AppButton>
  </div>
</template>
