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
  <div class="progress">
    <ScreenIntro
      eyebrow="Visual proof"
      title="Progress photos"
      subtitle="Same light, same angle, same three poses. That’s what makes week 6 undeniable."
      :actions="false"
      class="progress__header"
    />

    <AppCard variant="raised" class="progress__capture">
      <SegmentedTabs v-model="pose" :tabs="poseTabs" />
      <input
        ref="fileInput"
        class="progress__file"
        type="file"
        accept="image/*"
        capture="environment"
        @change="onFile"
      />
      <AppButton icon="camera" :disabled="busy" @click="add">
        {{ busy ? 'Adding…' : `Add ${pose} photo · Week ${store.clock.value.week}` }}
      </AppButton>
      <p v-if="error" class="progress__error">{{ error }}</p>
      <p v-else class="progress__note">
        Stored on this device only. Your coach sees them when you share a check-in.
      </p>
    </AppCard>

    <div class="progress__weeks">
      <section v-for="group in byWeek" :key="group.weekNumber" class="progress__week">
      <div class="progress__week-head">
        <EyebrowLabel tone="muted">Week {{ group.weekNumber }}</EyebrowLabel>
        <span class="progress__week-count data">{{ group.photos.length }}/3</span>
      </div>
        <div class="progress__grid">
          <button
            v-for="photo in group.photos"
            :key="photo.id"
            class="shot"
            @click="active = photo"
          >
            <img
              :src="photo.dataUrl"
              :alt="`${photo.pose} pose, week ${photo.weekNumber}`"
              loading="lazy"
              decoding="async"
            />
            <span class="shot__pose">{{ photo.pose }}</span>
          </button>
        </div>
      </section>

      <div v-if="!byWeek.length" class="progress__empty">
        <AppIcon name="image" :size="28" :stroke="1.6" />
        <p>No photos yet. Take your first set today — it becomes your before.</p>
      </div>
    </div>

    <!-- 24 · Lightbox -->
    <Teleport to="body">
      <div v-if="active" class="lightbox" @click.self="close">
        <div class="lightbox__panel">
          <img
            :src="active.dataUrl"
            :alt="`${active.pose} pose`"
            class="lightbox__img"
            decoding="async"
          />
          <div class="lightbox__meta">
            <div>
              <span class="lightbox__pose">{{ active.pose }} · Week {{ active.weekNumber }}</span>
              <span class="lightbox__date data">{{ takenLabel(active.takenAt) }}</span>
            </div>
            <button class="lightbox__delete" @click="remove">Delete</button>
          </div>
          <button class="lightbox__close" aria-label="Close" @click="close">
            <AppIcon name="close" :size="20" :stroke="2.4" />
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.progress {
  padding: var(--screen-pad-top) 20px 0;
  display: flex;
  flex-direction: column;
  gap: 18px;

  &__title {
    margin: 8px 0 6px;
  }

  &__sub {
    margin: 0;
    font-size: 13.5px;
    line-height: 1.45;
  }

  &__capture {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  &__file {
    display: none;
  }

  &__note,
  &__error {
    margin: -4px 0 0;
    font-size: 12px;
    line-height: 1.45;
    color: var(--violet-45);
    text-align: center;
  }

  &__error {
    color: var(--rose);
    font-weight: 700;
  }

  &__weeks {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  &__week-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  &__week-count {
    font-size: 12px;
    font-weight: 700;
    color: var(--rose);
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }

  &__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 32px 24px;
    border-radius: var(--radius-card);
    box-shadow: inset 0 0 0 1.5px var(--hairline);
    color: var(--violet-45);
    text-align: center;

    p {
      margin: 0;
      font-size: 13.5px;
      line-height: 1.5;
      max-width: 260px;
    }
  }
}

.shot {
  position: relative;
  padding: 0;
  border-radius: var(--radius-md);
  overflow: hidden;
  aspect-ratio: 3 / 4;
  background: var(--paper-raised);
  box-shadow: var(--shadow-card);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  &__pose {
    position: absolute;
    left: 6px;
    bottom: 6px;
    padding: 3px 7px;
    border-radius: var(--radius-pill);
    background: var(--overlay-strong);
    color: var(--on-photo);
    font-family: var(--font-eyebrow);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-size: 8px;
    font-weight: 700;
  }
}

.lightbox {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--scrim-photo);
  backdrop-filter: blur(3px);

  &__panel {
    position: relative;
    width: 100%;
    max-width: 420px;
    border-radius: var(--radius-lg);
    overflow: hidden;
    background: var(--paper-raised);
  }

  &__img {
    width: 100%;
    max-height: 70vh;
    object-fit: contain;
    display: block;
    background: var(--surface-inverse);
  }

  &__meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;

    div {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
  }

  &__pose {
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 15px;
    color: var(--ink);
    text-transform: capitalize;
  }

  &__date {
    font-size: 11px;
    color: var(--violet-45);
  }

  &__delete {
    font-size: 13px;
    font-weight: 700;
    color: var(--rose);
  }

  &__close {
    position: absolute;
    top: 10px;
    right: 10px;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--overlay-medium);
    color: var(--on-photo);
    display: grid;
    place-items: center;
  }
}

@media (min-width: 1024px) {
  .progress {
    padding: 0;
    display: grid;
    grid-template-columns: minmax(0, 320px) minmax(0, 1fr);
    grid-template-areas:
      'header  header'
      'capture weeks';
    column-gap: 24px;
    row-gap: 18px;
    align-content: start;
    align-items: start;

    &__header {
      grid-area: header;
    }

    &__sub {
      font-size: 15px;
      max-width: 560px;
    }

    &__capture {
      grid-area: capture;
      position: sticky;
      top: 0;
    }

    &__weeks {
      grid-area: weeks;
    }

    &__grid {
      grid-template-columns: repeat(4, 1fr);
      gap: 14px;
    }
  }
}
</style>
