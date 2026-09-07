<script setup lang="ts">
// 23 · Progress Photos + 24 · Lightbox
definePageMeta({ layout: 'app' })

import { processImage } from '~/lib/image'
import { formatDate } from '~/lib/time'
import type { PhotoPose, ProgressPhoto } from '~/data/types'

const store = useAppStore()

const poses: PhotoPose[] = ['front', 'side', 'back']
const pose = ref<PhotoPose>('front')
const poseTabs = poses.map((id) => ({ id, label: id }))

const fileInput = ref<HTMLInputElement | null>(null)
const error = ref('')
const busy = ref(false)

/** Newest week first, each with its three poses. */
const byWeek = computed(() => {
  const weeks = new Map<number, ProgressPhoto[]>()
  for (const photo of store.photos.value) {
    weeks.set(photo.weekNumber, [...(weeks.get(photo.weekNumber) ?? []), photo])
  }
  return [...weeks.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([weekNumber, photos]) => ({ weekNumber, photos }))
})

const add = () => fileInput.value?.click()

const onFile = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  error.value = ''
  busy.value = true
  try {
    // Decode and downscale here; the store hands the result to the data
    // source, which is what decides where the bytes actually live.
    await store.addPhoto({ pose: pose.value, image: await processImage(file) })
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not add that photo.'
  } finally {
    busy.value = false
    input.value = ''
  }
}

// --- Lightbox --------------------------------------------------------------
const active = ref<ProgressPhoto | null>(null)
const close = () => (active.value = null)

const remove = async () => {
  if (!active.value) return
  await store.deletePhoto(active.value.id)
  close()
}

const takenLabel = formatDate
</script>

<template>
  <div class="progress pt-(--screen-pad-top) px-5 pb-0 flex flex-col gap-4.5 [&_.progress__title]:mt-2 [&_.progress__title]:mx-0 [&_.progress__title]:mb-1.5 [&_.progress__sub]:m-0 [&_.progress__sub]:text-[13.5px] [&_.progress__sub]:leading-[1.45] [&_.lightbox]:fixed [&_.lightbox]:inset-0 [&_.lightbox]:z-300 [&_.lightbox]:grid [&_.lightbox]:place-items-center [&_.lightbox]:p-6 [&_.lightbox]:bg-scrim-photo [&_.lightbox]:backdrop-blur-[3px] [&_.lightbox__panel]:relative [&_.lightbox__panel]:w-full [&_.lightbox__panel]:max-w-[420px] [&_.lightbox__panel]:rounded-lg [&_.lightbox__panel]:overflow-hidden [&_.lightbox__panel]:bg-raised lg:p-0 lg:grid lg:grid-cols-[minmax(0,_320px)_minmax(0,_1fr)] lg:[grid-template-areas:'header_header'_'capture_weeks'] lg:gap-x-6 lg:gap-y-4.5 lg:content-start lg:items-start lg:[&_.progress__sub]:text-[15px] lg:[&_.progress__sub]:max-w-[560px]">
    <ScreenIntro
      eyebrow="Visual proof"
      title="Progress photos"
      subtitle="Same light, same angle, same three poses. That’s what makes week 6 undeniable."
      :actions="false"
      class="progress__header lg:[grid-area:header]"
    />

    <AppCard variant="raised" class="progress__capture flex flex-col gap-3.5 lg:[grid-area:capture] lg:sticky lg:top-0">
      <SegmentedTabs v-model="pose" :tabs="poseTabs" />
      <input
        ref="fileInput"
        class="progress__file hidden"
        type="file"
        accept="image/*"
        capture="environment"
        @change="onFile"
      />
      <AppButton icon="camera" :disabled="busy" @click="add">
        {{ busy ? 'Adding…' : `Add ${pose} photo · Week ${store.clock.value.week}` }}
      </AppButton>
      <p v-if="error" class="progress__error -mt-1 mx-0 mb-0 text-[12px] leading-[1.45] text-muted text-center text-rose font-bold">{{ error }}</p>
      <p v-else class="progress__note -mt-1 mx-0 mb-0 text-[12px] leading-[1.45] text-muted text-center">
        Stored on this device only. Your coach sees them when you share a check-in.
      </p>
    </AppCard>

    <div class="progress__weeks flex flex-col gap-4.5 lg:[grid-area:weeks]">
      <section v-for="group in byWeek" :key="group.weekNumber" class="progress__week">
      <div class="progress__week-head flex items-center justify-between mb-2.5">
        <EyebrowLabel tone="muted">Week {{ group.weekNumber }}</EyebrowLabel>
        <span class="progress__week-count tabular-nums text-[12.5px] text-rose">{{ group.photos.length }}/3</span>
      </div>
        <div class="progress__grid grid grid-cols-[repeat(3,_1fr)] gap-2.5 lg:grid-cols-[repeat(4,_1fr)] lg:gap-3.5">
          <button
            v-for="photo in group.photos"
            :key="photo.id"
            class="shot relative p-0 rounded-md overflow-hidden aspect-3/4 bg-raised shadow-card [&_img]:w-full [&_img]:h-full [&_img]:object-cover [&_img]:block"
            @click="active = photo"
          >
            <img
              :src="photo.image.downloadUrl"
              :alt="`${photo.pose} pose, week ${photo.weekNumber}`"
              loading="lazy"
              decoding="async"
            />
            <span class="shot__pose absolute left-1.5 bottom-1.5 py-0.75 px-1.75 rounded-pill bg-overlay-strong text-on-photo text-[11px] capitalize">{{ photo.pose }}</span>
          </button>
        </div>
      </section>

      <div v-if="!byWeek.length" class="progress__empty flex flex-col items-center gap-2.5 py-8 px-6 rounded-card shadow-[inset_0_0_0_1.5px_var(--hairline)] text-muted text-center [&_p]:m-0 [&_p]:text-[13.5px] [&_p]:leading-[1.5] [&_p]:max-w-[260px]">
        <AppIcon name="image" :size="28" :stroke="1.6" />
        <p>No photos yet. Take your first set today. It becomes your before.</p>
      </div>
    </div>

    <!--
      24 · Lightbox. A photo viewer is a modal, so it is shadcn's Dialog rather
      than a bare Teleport: focus is trapped in the panel while it is open and
      handed back to the thumbnail on close, Escape dismisses, and the page
      behind it stops scrolling. Delete sits inside a focus trap for the same
      reason — it is destructive and must not be reachable by a stray tab.
    -->
    <Dialog :open="Boolean(active)" @update:open="!$event && close()">
      <!--
        The panel is DialogContent's own element, not one of this template's, so
        a scoped `.lightbox__panel` rule would never reach it — Vue only scopes a
        child component's root, and this component's root is the portal. Its
        styling is therefore passed as utilities, which `cn` merges over the
        component's defaults (p-0 beating p-6, and so on). Everything inside the
        slot below is this template's, so those scoped classes work normally.
      -->
      <DialogContent
        v-if="active"
        class="w-[calc(100%-48px)] max-w-105 gap-0 overflow-hidden rounded-lg bg-raised p-0 shadow-none"
        overlay-class="bg-scrim-photo backdrop-blur-[3px]"
        :aria-describedby="undefined"
      >
        <DialogTitle class="sr-only">
          {{ active.pose }} pose, week {{ active.weekNumber }}
        </DialogTitle>

        <!-- Close is first in the DOM so it, and not Delete, is what the focus
             trap lands on when the lightbox opens. It is absolutely positioned,
             so the order costs nothing visually. -->
        <DialogClose class="lightbox__close absolute top-2.5 right-2.5 w-9 h-9 rounded-full bg-overlay-medium text-on-photo grid place-items-center" aria-label="Close">
          <AppIcon name="close" :size="20" :stroke="2.4" />
        </DialogClose>

        <img
          :src="active.image.downloadUrl"
          :alt="`${active.pose} pose`"
          class="lightbox__img w-full max-h-[70vh] object-contain block bg-inverse"
          decoding="async"
        />
        <div class="lightbox__meta flex items-center justify-between gap-3 py-3.5 px-4 [&_div]:flex [&_div]:flex-col [&_div]:gap-0.75">
          <div>
            <span class="lightbox__pose font-display font-black text-[15px] text-ink capitalize">{{ active.pose }} · Week {{ active.weekNumber }}</span>
            <span class="lightbox__date tabular-nums text-[12px] text-muted">{{ takenLabel(active.takenAt) }}</span>
          </div>
          <button class="lightbox__delete text-[13px] font-bold text-rose" @click="remove">Delete</button>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
