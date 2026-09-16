<script setup lang="ts">
// Exercise detail · History / How to
definePageMeta({ layout: false })

import { TabsContent, TabsIndicator, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'

import type { SetType } from '~/data/types'
import { toDisplayWeight, unitLabel } from '~/lib/domain/nutrition'
import { setRows, setTypeOf } from '~/lib/domain/sets'
import { formatDate, formatTime } from '~/lib/time'

const route = useRoute()
const router = useRouter()
const store = useAppStore()

const dayId = computed(() => String(route.params.dayId))
const exerciseId = computed(() => String(route.params.exerciseId))
/** Forwarded from the session screen, for the same reason it reads it: day ids repeat across weeks. */
const weekParam = computed(() => {
  const n = Number(route.query.week)
  return Number.isInteger(n) && n > 0 ? n : undefined
})

/** The coach's version of the exercise: cues, targets, the thumbnail. */
const planned = computed(() =>
  store.getDay(dayId.value, weekParam.value)?.exercises.find((e) => e.id === exerciseId.value),
)

/**
 * The clip's width over height, read off its metadata. Null until then,
 * which draws a 16:9 frame. A demo filmed upright on a phone is 9:16 and would
 * be a sliver in the middle of one.
 */
const clipRatio = ref<number | null>(null)

/**
 * The browser cannot play the link. It can point anywhere, so this covers a file
 * in a format only some browsers decode — an iPhone's HEVC `.mov` plays in
 * Safari and not in Chrome on Android — a host that refuses the request, and a
 * link to a page rather than a file. A failed `<video>` is a dead black box with
 * nothing to press.
 */
const clipFailed = ref(false)

const clip = ref<HTMLVideoElement | null>(null)

/** Driven by the element's own events, so it cannot drift from what is on screen. */
const clipState = ref<'paused' | 'loading' | 'playing'>('paused')

watch(
  () => planned.value?.videoUrl,
  () => {
    clipRatio.value = null
    clipFailed.value = false
    clipState.value = 'paused'
  },
)

/**
 * Play from paused or ended — an ended clip starts over — and pause otherwise.
 *
 * `play()` rejects when a pause interrupts it or the file will not decode. The
 * first is the member's own tap and the second also fires `error`, which is
 * what shows the fallback, so neither needs handling here.
 */
const toggleClip = () => {
  const video = clip.value
  if (!video) return
  if (video.paused) video.play().catch(() => {})
  else video.pause()
}

/**
 * A picture track the browser cannot decode does not always error: Chrome plays
 * an HEVC file's sound and reports its width as 0. That is a failure too.
 */
const onClipMetadata = (event: Event) => {
  const { videoWidth, videoHeight } = event.target as HTMLVideoElement
  if (!videoWidth || !videoHeight) clipFailed.value = true
  else clipRatio.value = videoWidth / videoHeight
}

/**
 * The clip's source, starting a hair past zero when there is no thumbnail.
 *
 * iOS Safari draws nothing for `preload="metadata"` until play is pressed, so an
 * exercise with no `videoThumbUrl` is a black frame there. Asking for a start
 * time makes it seek, and a seek paints that frame. The fragment never reaches
 * the server, so any host sees the link exactly as it was stored — a signed or
 * tokened URL still matches.
 */
const clipSrc = computed(() => {
  const url = planned.value?.videoUrl
  if (!url || planned.value?.videoThumbUrl || url.includes('#')) return url ?? undefined
  return `${url}#t=0.001`
})

const history = computed(() => store.historyFor(exerciseId.value))

/**
 * Named from the plan, or from the log when the plan no longer has it — an
 * exercise the coach swapped out is still history worth reading.
 */
const name = computed(() => planned.value?.name ?? history.value[0]?.exercise.name ?? '')

watchEffect(() => {
  if (!store.hydrated.value) return
  if (!name.value) router.replace(`/train/${dayId.value}`)
})

const tab = ref<'history' | 'how-to'>('history')

const units = computed(() => store.prefs.value.units)

/**
 * A weight column only for an exercise that has ever carried weight.
 *
 * Decided once for the whole page rather than per session, so the columns line
 * up from one card to the next; a bodyweight row is a column of zeros otherwise.
 */
const weighted = computed(() =>
  history.value.some(({ exercise }) => exercise.sets.some((s) => s.weightKg > 0)),
)

const SET_LABEL: Record<SetType, string> = {
  warmup: 'text-set-warmup',
  normal: 'text-ink',
  failure: 'text-set-fail',
  drop: 'text-set-drop',
}

/**
 * Equal columns, each centred, as the session screen's set table has them.
 * Fixed narrow columns left every number in the left third of the row and the
 * rest of it empty, which read as the whole table sitting off to one side.
 */
const ROW = computed(() =>
  weighted.value
    ? 'grid grid-cols-3 items-center px-5 text-center lg:px-10'
    : 'grid grid-cols-2 items-center px-5 text-center lg:px-10',
)

const TRIGGER =
  'relative h-12 flex-1 text-[15px] text-muted transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-ring data-[state=active]:font-semibold data-[state=active]:text-primary'
</script>

<template>
  <div v-if="name" class="relative flex h-full flex-col bg-surface">
    <div class="shrink-0 lg:mx-auto lg:w-full lg:max-w-(--focus-max) lg:px-10">
      <ScreenHeader :title="name" />
    </div>

    <TabsRoot v-model="tab" class="flex min-h-0 flex-1 flex-col">
      <TabsList
        class="relative flex shrink-0 border-b border-hairline lg:mx-auto lg:w-full lg:max-w-(--focus-max)"
        aria-label="Exercise details"
      >
        <TabsTrigger value="history" :class="TRIGGER">History</TabsTrigger>
        <TabsTrigger value="how-to" :class="TRIGGER">How to</TabsTrigger>
        <TabsIndicator
          class="absolute bottom-0 left-0 h-0.75 w-(--reka-tabs-indicator-size) translate-x-(--reka-tabs-indicator-position) rounded-pill bg-primary transition-[width,translate] duration-200 motion-reduce:transition-none"
        />
      </TabsList>

      <div class="scroll-y min-h-0 flex-1">
        <div class="pb-10 lg:mx-auto lg:max-w-(--focus-max)">
          <TabsContent value="history">
            <!--
              One block per session, newest first. Only the sets that were ticked
              done: an unticked row is the plan, not something the member lifted.
            -->
            <section
              v-for="{ log, exercise } in history"
              :key="log.id"
              class="border-b border-hairline pt-5 pb-3 last:border-b-0"
            >
              <header class="px-5 lg:px-10">
                <h2 class="m-0 font-display text-[17px] font-black text-ink">
                  {{ log.dayNumber ? `Day ${log.dayNumber}: ${log.label}` : log.label }}
                </h2>
                <p class="mt-0.5 mb-0 text-[12.5px] text-muted">
                  Week {{ log.weekNumber }} · {{ formatDate(log.completedAt) }},
                  {{ formatTime(log.completedAt) }}
                </p>
              </header>

              <div class="mt-3.5 flex items-center gap-3 px-5 lg:px-10">
                <img
                  v-if="planned?.videoThumbUrl"
                  :src="planned.videoThumbUrl"
                  alt=""
                  decoding="async"
                  class="size-11 shrink-0 rounded-pill object-cover"
                />
                <span
                  v-else
                  class="grid size-11 shrink-0 place-items-center rounded-pill bg-primary-soft text-primary"
                >
                  <AppIcon name="train" :size="19" :stroke="2.2" />
                </span>
                <span class="min-w-0 truncate font-exercise text-[16px] font-bold text-ink">
                  {{ exercise.name }}
                </span>
              </div>

              <p v-if="exercise.note" class="mt-2.5 mb-0 px-5 text-[13px] text-soft lg:px-10">
                {{ exercise.note }}
              </p>

              <div class="mt-3 font-exercise">
                <div :class="ROW" class="h-9 text-[12px] text-muted uppercase">
                  <span>Set</span>
                  <span v-if="weighted">{{ unitLabel(units) }}</span>
                  <span>Reps</span>
                </div>
                <div
                  v-for="row in setRows(exercise.sets)"
                  :key="row.index"
                  :class="ROW"
                  class="h-12 text-[15px] tabular-nums even:bg-fill-subtle"
                >
                  <span class="font-bold" :class="SET_LABEL[setTypeOf(row.set)]">
                    {{ row.label }}
                  </span>
                  <span v-if="weighted" class="text-ink">
                    {{ toDisplayWeight(row.set.weightKg, units) }}
                  </span>
                  <span class="text-ink">{{ row.set.reps }}</span>
                </div>
              </div>
            </section>

            <div
              v-if="!history.length"
              class="mx-5 mt-5 flex items-center gap-3 rounded-card border border-hairline bg-raised px-4.5 py-3.5 lg:mx-10"
            >
              <span class="grid size-8.5 shrink-0 place-items-center rounded-pill bg-fill-subtle text-muted">
                <AppIcon name="clock" :size="16" />
              </span>
              <span class="flex min-w-0 flex-col gap-0.5">
                <strong class="font-display text-[14.5px] font-black text-ink">No history yet</strong>
                <small class="text-[12.5px] text-muted">
                  Sets you tick off in a saved workout show up here.
                </small>
              </span>
            </div>
          </TabsContent>

          <TabsContent value="how-to" class="flex flex-col gap-4 px-5 pt-5 lg:px-10">
            <!--
              No native controls: a demo is a few seconds long, so there is
              nothing to scrub, and the one thing to do is play it. The whole
              frame is the button — the play circle while paused or ended, a
              spinner while it buffers, nothing while it plays, and a tap
              anywhere pauses it again.

              `playsinline`, or iOS takes the clip fullscreen and out of the
              page. `metadata` only, so opening the tab does not start pulling
              down a whole video on gym signal before anyone presses play.
              The frame takes the clip's own shape once its metadata is in,
              and a portrait one is capped in width so it does not run the
              page's full height on a wide screen.
            -->
            <div
              v-if="planned?.videoUrl && !clipFailed"
              :key="planned.videoUrl"
              :style="clipRatio ? { aspectRatio: clipRatio } : undefined"
              :class="[
                'relative aspect-video w-full overflow-hidden rounded-card bg-photo',
                clipRatio && clipRatio < 1 ? 'mx-auto max-w-80' : 'max-w-full',
              ]"
            >
              <video
                ref="clip"
                :src="clipSrc"
                :poster="planned.videoThumbUrl ?? undefined"
                playsinline
                preload="metadata"
                class="absolute inset-0 size-full object-contain"
                @loadedmetadata="onClipMetadata"
                @error="clipFailed = true"
                @play="clipState = 'loading'"
                @waiting="clipState = 'loading'"
                @playing="clipState = 'playing'"
                @pause="clipState = 'paused'"
              />
              <button
                type="button"
                :aria-label="`${clipState === 'paused' ? 'Play' : 'Pause'} ${name} demonstration video`"
                class="absolute inset-0 grid place-items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-ring"
                @click="toggleClip"
              >
                <span
                  :class="[
                    'grid size-18 place-items-center rounded-pill bg-photo/60 text-on-photo backdrop-blur-sm transition-opacity duration-150 motion-reduce:transition-none',
                    clipState === 'playing' ? 'opacity-0' : 'opacity-100',
                  ]"
                >
                  <span
                    v-if="clipState === 'loading'"
                    class="size-7 animate-spin rounded-pill border-[3px] border-on-photo/30 border-t-on-photo motion-reduce:animate-none"
                  />
                  <AppIcon v-else name="play" :size="32" :stroke="2" fill />
                </span>
              </button>
            </div>
            <!--
              Placeholder for an exercise with no video authored yet, or one
              whose file this browser cannot play. The thumbnail sits behind it
              when the plan has one, so the frame is already the right
              exercise. The failed case offers the file itself: opened on its
              own, the device may hand it to a player that can.
            -->
            <div
              v-else
              :role="clipFailed ? undefined : 'img'"
              :aria-label="clipFailed ? undefined : `${name} demonstration video, coming soon`"
              class="relative aspect-video w-full max-w-full overflow-hidden rounded-card bg-photo text-on-photo"
            >
              <img
                v-if="planned?.videoThumbUrl"
                :src="planned.videoThumbUrl"
                alt=""
                decoding="async"
                class="absolute inset-0 size-full object-cover"
              />
              <div v-if="planned?.videoThumbUrl" class="absolute inset-0 bg-photo/70" />
              <div class="relative flex size-full flex-col items-center justify-center gap-2.5">
                <template v-if="clipFailed && planned?.videoUrl">
                  <span class="text-[13px] font-semibold text-on-photo/80">
                    This video can’t play in this browser
                  </span>
                  <AppButton
                    :to="planned.videoUrl"
                    variant="secondary"
                    size="md"
                    :block="false"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open video
                  </AppButton>
                </template>
                <template v-else>
                  <span class="grid size-14 place-items-center rounded-pill bg-on-photo/14">
                    <AppIcon name="play" :size="24" :stroke="2" fill />
                  </span>
                  <span class="text-[13px] font-semibold text-on-photo/80">Video coming soon</span>
                </template>
              </div>
            </div>

            <template v-if="planned">
              <div class="grid grid-cols-3 gap-2.5">
                <div class="flex flex-col gap-0.5 rounded-md bg-raised px-3 py-3 shadow-card">
                  <span class="text-[11.5px] text-muted">Target</span>
                  <span class="text-[15px] font-bold text-ink tabular-nums">
                    {{ planned.sets.length }} × {{ planned.targetReps }}
                  </span>
                </div>
                <div class="flex flex-col gap-0.5 rounded-md bg-raised px-3 py-3 shadow-card">
                  <span class="text-[11.5px] text-muted">Rest</span>
                  <span class="text-[15px] font-bold text-ink tabular-nums">{{ planned.restSeconds }}s</span>
                </div>
                <div class="flex min-w-0 flex-col gap-0.5 rounded-md bg-raised px-3 py-3 shadow-card">
                  <span class="text-[11.5px] text-muted">Muscle</span>
                  <span class="truncate text-[15px] font-bold text-ink">{{ planned.muscleGroup }}</span>
                </div>
              </div>

              <section v-if="planned.cues.length" class="rounded-card border border-hairline bg-raised p-4.5">
                <h2 class="m-0 font-display text-[15.5px] font-black text-ink">Coach’s cues</h2>
                <ol class="mt-3 mb-0 flex list-none flex-col gap-2.5 p-0">
                  <li v-for="(cue, i) in planned.cues" :key="cue" class="flex gap-3">
                    <span
                      class="grid size-6 shrink-0 place-items-center rounded-pill bg-primary-soft text-[12px] font-bold text-primary tabular-nums"
                    >
                      {{ i + 1 }}
                    </span>
                    <span class="text-[13.5px] leading-normal text-soft">{{ cue }}</span>
                  </li>
                </ol>
              </section>
            </template>
          </TabsContent>
        </div>
      </div>
    </TabsRoot>
  </div>
</template>
