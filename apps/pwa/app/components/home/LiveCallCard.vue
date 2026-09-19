<script setup lang="ts">
import type { LiveCallToday } from '~/lib/domain/liveCall'
import { formatTime, trustedNow } from '~/lib/time'

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

const TIME: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }

/** "9:00 – 10:00 PM", in the member's own zone. */
const span = computed(() =>
  new Intl.DateTimeFormat(undefined, TIME).formatRange(props.call.startsAt, props.call.endsAt),
)

const detail = computed(() =>
  props.call.phase === 'ended'
    ? `Ended at ${formatTime(props.call.endsAt)}. Same time next week.`
    : span.value,
)
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
      {{ call.phase === 'upcoming' ? `Opens at ${formatTime(call.startsAt)}` : 'Call ended' }}
    </AppButton>
  </div>
</template>
