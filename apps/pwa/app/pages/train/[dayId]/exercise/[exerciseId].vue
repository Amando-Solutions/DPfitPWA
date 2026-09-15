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

const ROW = computed(() =>
  weighted.value
    ? 'grid grid-cols-[48px_88px_1fr] items-center px-5 lg:px-6'
    : 'grid grid-cols-[48px_1fr] items-center px-5 lg:px-6',
)

const TRIGGER =
  'relative h-12 flex-1 text-[15px] text-muted transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose-ring data-[state=active]:font-semibold data-[state=active]:text-rose'
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
          class="absolute bottom-0 left-0 h-0.75 w-(--reka-tabs-indicator-size) translate-x-(--reka-tabs-indicator-position) rounded-pill bg-rose transition-[width,translate] duration-200 motion-reduce:transition-none"
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
              <header class="px-5 lg:px-6">
                <h2 class="m-0 font-display text-[17px] font-black text-ink">
                  {{ log.dayNumber ? `Day ${log.dayNumber}: ${log.label}` : log.label }}
                </h2>
                <p class="mt-0.5 mb-0 text-[12.5px] text-muted">
                  Week {{ log.weekNumber }} · {{ formatDate(log.completedAt) }},
                  {{ formatTime(log.completedAt) }}
                </p>
              </header>

              <div class="mt-3.5 flex items-center gap-3 px-5 lg:px-6">
                <img
                  v-if="planned?.videoThumbUrl"
                  :src="planned.videoThumbUrl"
                  alt=""
                  decoding="async"
                  class="size-11 shrink-0 rounded-pill object-cover"
                />
                <span
                  v-else
                  class="grid size-11 shrink-0 place-items-center rounded-pill bg-rose-soft text-rose"
                >
                  <AppIcon name="train" :size="19" :stroke="2.2" />
                </span>
                <span class="min-w-0 truncate font-exercise text-[16px] font-bold text-ink">
                  {{ exercise.name }}
                </span>
              </div>

              <p v-if="exercise.note" class="mt-2.5 mb-0 px-5 text-[13px] text-soft lg:px-6">
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
              class="mx-5 mt-5 flex items-center gap-3 rounded-card border border-hairline bg-raised px-4.5 py-3.5 lg:mx-6"
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

          <TabsContent value="how-to" class="flex flex-col gap-4 px-5 pt-5 lg:px-6">
            <!--
              `playsinline`, or iOS takes the clip fullscreen and out of the
              page. `metadata` only, so opening the tab does not start pulling
              down a whole video on gym signal before anyone presses play.
            -->
            <video
              v-if="planned?.videoUrl"
              :key="planned.videoUrl"
              :src="planned.videoUrl"
              :poster="planned.videoThumbUrl ?? undefined"
              :aria-label="`${name} demonstration video`"
              controls
              playsinline
              preload="metadata"
              class="aspect-video w-full max-w-full rounded-card bg-photo object-contain"
            />
            <!--
              Placeholder for an exercise with no video authored yet. The
              thumbnail sits behind it when the plan has one, so the frame is
              already the right exercise.
            -->
            <div
              v-else
              role="img"
              :aria-label="`${name} demonstration video, coming soon`"
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
                <span class="grid size-14 place-items-center rounded-pill bg-on-photo/14">
                  <AppIcon name="play" :size="24" :stroke="2" fill />
                </span>
                <span class="text-[13px] font-semibold text-on-photo/80">Video coming soon</span>
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
                      class="grid size-6 shrink-0 place-items-center rounded-pill bg-rose-soft text-[12px] font-bold text-rose tabular-nums"
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
