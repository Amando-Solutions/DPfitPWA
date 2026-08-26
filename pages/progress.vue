<script setup lang="ts">
// 23 · Progress Photos + 24 · Lightbox
definePageMeta({ layout: 'app' })

import { readImageAsDataUrl } from '~/lib/image'
import type { PhotoRecord } from '~/data/types'

const store = useAppStore()

const poses: PhotoRecord['pose'][] = ['front', 'side', 'back']
const pose = ref<PhotoRecord['pose']>('front')
const poseTabs = poses.map((id) => ({ id, label: id }))

const fileInput = ref<HTMLInputElement | null>(null)
const error = ref('')
const busy = ref(false)

/** Newest week first, each with its three poses. */
const byWeek = computed(() => {
  const weeks = new Map<number, PhotoRecord[]>()
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
    const dataUrl = await readImageAsDataUrl(file)
    await store.addPhoto({ pose: pose.value, dataUrl })
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not add that photo.'
  } finally {
    busy.value = false
    input.value = ''
  }
}

// --- Lightbox --------------------------------------------------------------
const active = ref<PhotoRecord | null>(null)
const close = () => (active.value = null)

const remove = async () => {
  if (!active.value) return
  await store.deletePhoto(active.value.id)
  close()
}

const takenLabel = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
</script>

<template>
  <div class="progress [padding:var(--screen-pad-top)_20px_0] [display:flex] [flex-direction:column] [gap:18px] [&_.progress__title]:[margin:8px_0_6px] [&_.progress__sub]:[margin:0] [&_.progress__sub]:[font-size:13.5px] [&_.progress__sub]:[line-height:1.45] [&_.lightbox]:[position:fixed] [&_.lightbox]:[inset:0] [&_.lightbox]:[z-index:300] [&_.lightbox]:[display:grid] [&_.lightbox]:[place-items:center] [&_.lightbox]:[padding:24px] [&_.lightbox]:[background:var(--scrim-photo)] [&_.lightbox]:[backdrop-filter:blur(3px)] [&_.lightbox__panel]:[position:relative] [&_.lightbox__panel]:[width:100%] [&_.lightbox__panel]:[max-width:420px] [&_.lightbox__panel]:[border-radius:var(--radius-lg)] [&_.lightbox__panel]:[overflow:hidden] [&_.lightbox__panel]:[background:var(--paper-raised)] lg:[padding:0] lg:[display:grid] lg:[grid-template-columns:minmax(0,_320px)_minmax(0,_1fr)] lg:[grid-template-areas:'header_header'_'capture_weeks'] lg:[column-gap:24px] lg:[row-gap:18px] lg:[align-content:start] lg:[align-items:start] lg:[&_.progress__sub]:[font-size:15px] lg:[&_.progress__sub]:[max-width:560px]">
    <ScreenIntro
      eyebrow="Visual proof"
      title="Progress photos"
      subtitle="Same light, same angle, same three poses. That’s what makes week 6 undeniable."
      :actions="false"
      class="progress__header lg:[grid-area:header]"
    />

    <AppCard variant="raised" class="progress__capture [display:flex] [flex-direction:column] [gap:14px] lg:[grid-area:capture] lg:[position:sticky] lg:[top:0]">
      <SegmentedTabs v-model="pose" :tabs="poseTabs" />
      <input
        ref="fileInput"
        class="progress__file [display:none]"
        type="file"
        accept="image/*"
        capture="environment"
        @change="onFile"
      />
      <AppButton icon="camera" :disabled="busy" @click="add">
        {{ busy ? 'Adding…' : `Add ${pose} photo · Week ${store.clock.value.week}` }}
      </AppButton>
      <p v-if="error" class="progress__error [margin:-4px_0_0] [font-size:12px] [line-height:1.45] [color:var(--violet-45)] [text-align:center] [color:var(--rose)] [font-weight:700]">{{ error }}</p>
      <p v-else class="progress__note [margin:-4px_0_0] [font-size:12px] [line-height:1.45] [color:var(--violet-45)] [text-align:center]">
        Stored on this device only. Your coach sees them when you share a check-in.
      </p>
    </AppCard>

    <div class="progress__weeks [display:flex] [flex-direction:column] [gap:18px] lg:[grid-area:weeks]">
      <section v-for="group in byWeek" :key="group.weekNumber" class="progress__week">
      <div class="progress__week-head [display:flex] [align-items:center] [justify-content:space-between] [margin-bottom:10px]">
        <EyebrowLabel tone="muted">Week {{ group.weekNumber }}</EyebrowLabel>
        <span class="progress__week-count data [font-size:12px] [font-weight:700] [color:var(--rose)]">{{ group.photos.length }}/3</span>
      </div>
        <div class="progress__grid [display:grid] [grid-template-columns:repeat(3,_1fr)] [gap:10px] lg:[grid-template-columns:repeat(4,_1fr)] lg:[gap:14px]">
          <button
            v-for="photo in group.photos"
            :key="photo.id"
            class="shot [position:relative] [padding:0] [border-radius:var(--radius-md)] [overflow:hidden] [aspect-ratio:3/4] [background:var(--paper-raised)] [box-shadow:var(--shadow-card)] [&_img]:[width:100%] [&_img]:[height:100%] [&_img]:[object-fit:cover] [&_img]:[display:block]"
            @click="active = photo"
          >
            <img
              :src="photo.dataUrl"
              :alt="`${photo.pose} pose, week ${photo.weekNumber}`"
              loading="lazy"
              decoding="async"
            />
            <span class="shot__pose [position:absolute] [left:6px] [bottom:6px] [padding:3px_7px] [border-radius:var(--radius-pill)] [background:var(--overlay-strong)] [color:var(--on-photo)] [font-family:var(--font-eyebrow)] [text-transform:uppercase] [letter-spacing:0.5px] [font-size:8px] [font-weight:700]">{{ photo.pose }}</span>
          </button>
        </div>
      </section>

      <div v-if="!byWeek.length" class="progress__empty [display:flex] [flex-direction:column] [align-items:center] [gap:10px] [padding:32px_24px] [border-radius:var(--radius-card)] [box-shadow:inset_0_0_0_1.5px_var(--hairline)] [color:var(--violet-45)] [text-align:center] [&_p]:[margin:0] [&_p]:[font-size:13.5px] [&_p]:[line-height:1.5] [&_p]:[max-width:260px]">
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
        <DialogClose class="lightbox__close [position:absolute] [top:10px] [right:10px] [width:36px] [height:36px] [border-radius:50%] [background:var(--overlay-medium)] [color:var(--on-photo)] [display:grid] [place-items:center]" aria-label="Close">
          <AppIcon name="close" :size="20" :stroke="2.4" />
        </DialogClose>

        <img
          :src="active.dataUrl"
          :alt="`${active.pose} pose`"
          class="lightbox__img [width:100%] [max-height:70vh] [object-fit:contain] [display:block] [background:var(--surface-inverse)]"
          decoding="async"
        />
        <div class="lightbox__meta [display:flex] [align-items:center] [justify-content:space-between] [gap:12px] [padding:14px_16px] [&_div]:[display:flex] [&_div]:[flex-direction:column] [&_div]:[gap:3px]">
          <div>
            <span class="lightbox__pose [font-family:var(--font-display)] [font-weight:900] [font-size:15px] [color:var(--ink)] [text-transform:capitalize]">{{ active.pose }} · Week {{ active.weekNumber }}</span>
            <span class="lightbox__date data [font-size:11px] [color:var(--violet-45)]">{{ takenLabel(active.takenAt) }}</span>
          </div>
          <button class="lightbox__delete [font-size:13px] [font-weight:700] [color:var(--rose)]" @click="remove">Delete</button>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
