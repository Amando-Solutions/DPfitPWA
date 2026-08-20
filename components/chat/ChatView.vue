<script setup lang="ts">
import type { ChatAttachment, ChatMessage } from '~/data/types'
import {
  FILE_ACCEPT,
  IMAGE_ACCEPT,
  MAX_ATTACHMENTS,
  fileToAttachment,
  formatBytes,
} from '~/lib/attachments'

const props = withDefaults(
  defineProps<{
    messages: ChatMessage[]
    eyebrow: string
    title: string
    subtitle: string
    placeholder?: string
    /** Show the shortcut through to the coach DM (cohort thread only). */
    dmLink?: boolean
  }>(),
  { placeholder: 'Say something…', dmLink: false },
)

const emit = defineEmits<{
  (e: 'send', payload: { text: string; attachments: ChatAttachment[] }): void
}>()

const draft = ref('')
const scroller = ref<HTMLElement | null>(null)

const scrollToEnd = async () => {
  await nextTick()
  const el = scroller.value
  if (el) el.scrollTop = el.scrollHeight
}

// --- Attachments -----------------------------------------------------------
/** Picked but not yet sent — shown as a tray above the composer. */
const pending = ref<ChatAttachment[]>([])
const attachInput = ref<HTMLInputElement | null>(null)
const cameraInput = ref<HTMLInputElement | null>(null)
const attachError = ref('')
const reading = ref(false)

const roomLeft = computed(() => MAX_ATTACHMENTS - pending.value.length)

/**
 * Clearing the input happens *here*, before the picker opens, not after a file
 * comes back: assigning to `value` detaches the selection on WebKit, so a read
 * started afterwards resolves empty and the pick silently does nothing. Doing
 * it up front still means picking the same file twice fires `change` again.
 */
const openPicker = (input: HTMLInputElement | null) => {
  if (!input) return
  input.value = ''
  input.click()
}

/**
 * iOS fires `change` while it is still importing a camera photo, with the list
 * not yet populated — so an empty list gets one re-read before it is taken as
 * a cancelled pick.
 */
const filesFrom = async (input: HTMLInputElement): Promise<File[]> => {
  if (input.files?.length) return [...input.files]
  await new Promise((resolve) => setTimeout(resolve, 150))
  return [...(input.files ?? [])]
}

const onPick = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const files = await filesFrom(input)
  if (!files.length) return // cancelled

  attachError.value = ''
  const room = roomLeft.value
  if (files.length > room) attachError.value = `You can send ${MAX_ATTACHMENTS} at a time.`

  reading.value = true
  try {
    for (const file of files.slice(0, room)) {
      try {
        pending.value = [...pending.value, await fileToAttachment(file)]
      } catch (cause) {
        attachError.value = cause instanceof Error ? cause.message : 'Could not attach that file.'
      }
    }
  } finally {
    reading.value = false
    scrollToEnd()
  }
}

const removePending = (id: string) => {
  pending.value = pending.value.filter((item) => item.id !== id)
  attachError.value = ''
}

/** Tapping a shared photo opens it full-screen. */
const viewing = ref<ChatAttachment | null>(null)

const imagesOf = (m: ChatMessage) => (m.attachments ?? []).filter((a) => a.kind === 'image')
const filesOf = (m: ChatMessage) => (m.attachments ?? []).filter((a) => a.kind !== 'image')

// --- Sending ---------------------------------------------------------------
const canSend = computed(() => Boolean(draft.value.trim() || pending.value.length))

const send = () => {
  if (!canSend.value) return
  emit('send', { text: draft.value.trim(), attachments: pending.value })
  draft.value = ''
  pending.value = []
  attachError.value = ''
  scrollToEnd()
}

onMounted(scrollToEnd)
watch(() => props.messages.length, scrollToEnd)

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
</script>

<template>
  <div class="chat">
    <header class="chat__header">
      <div>
        <EyebrowLabel>{{ eyebrow }}</EyebrowLabel>
        <h1 class="chat__title display-md">{{ title }}</h1>
        <p class="chat__sub muted">{{ subtitle }}</p>
      </div>
      <NuxtLink
        v-if="dmLink"
        to="/chat/coach"
        class="chat__dm"
        aria-label="Message coach"
      >
        <AppIcon name="user" :size="18" />
      </NuxtLink>
    </header>

    <div ref="scroller" class="chat__messages scroll-y">
      <div
        v-for="m in messages"
        :key="m.id"
        class="chat__msg"
        :class="{
          'chat__msg--self': m.isSelf,
          'chat__msg--coach': m.isCoach,
        }"
      >
        <img
          v-if="!m.isSelf"
          :src="m.authorAvatar"
          class="chat__avatar"
          :alt="m.authorName"
        />
        <div class="chat__bubble-wrap">
          <span v-if="!m.isSelf" class="chat__author" :class="{ 'chat__author--coach': m.isCoach }">
            {{ m.authorName }}
          </span>
          <div class="chat__bubble" :class="{ 'chat__bubble--media': !m.text }">
            <div
              v-if="imagesOf(m).length"
              class="chat__shots"
              :class="{ 'chat__shots--multi': imagesOf(m).length > 1 }"
            >
              <button
                v-for="shot in imagesOf(m)"
                :key="shot.id"
                class="chat__shot"
                :aria-label="'Open ' + shot.name"
                @click="viewing = shot"
              >
                <img :src="shot.url" :alt="shot.name" />
              </button>
            </div>

            <a
              v-for="doc in filesOf(m)"
              :key="doc.id"
              class="chat__doc"
              :href="doc.url"
              :download="doc.name"
            >
              <AppIcon name="file" :size="18" :stroke="1.8" />
              <span class="chat__doc-name">{{ doc.name }}</span>
              <span class="chat__doc-size data">{{ formatBytes(doc.size) }}</span>
            </a>

            <p v-if="m.text" class="chat__text">{{ m.text }}</p>
          </div>
          <span class="chat__time data">{{ timeOf(m.sentAt) }}</span>
          <div v-if="m.reactions?.length" class="chat__reactions">
            <span v-for="r in m.reactions" :key="r.emoji" class="chat__reaction">
              {{ r.emoji }} {{ r.count }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div class="chat__composer">
      <p v-if="attachError" class="chat__attach-error">{{ attachError }}</p>

      <div v-if="pending.length" class="chat__tray">
        <div v-for="item in pending" :key="item.id" class="tray-item">
          <img
            v-if="item.kind === 'image'"
            :src="item.url"
            :alt="item.name"
            class="tray-item__img"
          />
          <div v-else class="tray-item__doc">
            <AppIcon name="file" :size="16" :stroke="1.8" />
            <span class="tray-item__name">{{ item.name }}</span>
            <span class="tray-item__size data">{{ formatBytes(item.size) }}</span>
          </div>
          <button
            class="tray-item__remove"
            :aria-label="'Remove ' + item.name"
            @click="removePending(item.id)"
          >
            <AppIcon name="close" :size="11" :stroke="3" />
          </button>
        </div>
      </div>

      <div class="chat__row">
        <div class="chat__field">
          <input
            v-model="draft"
            class="chat__input"
            :placeholder="placeholder"
            @keyup.enter="send"
          />
          <button
            class="chat__tool"
            aria-label="Attach a file"
            :disabled="reading || roomLeft <= 0"
            @click="openPicker(attachInput)"
          >
            <AppIcon name="paperclip" :size="19" :stroke="1.9" />
          </button>
          <button
            class="chat__tool"
            aria-label="Take a photo"
            :disabled="reading || roomLeft <= 0"
            @click="openPicker(cameraInput)"
          >
            <AppIcon name="camera" :size="19" />
          </button>
        </div>
        <button
          class="chat__send"
          :class="{ 'chat__send--idle': !canSend }"
          aria-label="Send"
          @click="send"
        >
          <AppIcon name="send" :size="18" fill />
        </button>
      </div>

      <input
        ref="attachInput"
        class="chat__file"
        type="file"
        :accept="FILE_ACCEPT"
        multiple
        @change="onPick"
      />
      <input
        ref="cameraInput"
        class="chat__file"
        type="file"
        :accept="IMAGE_ACCEPT"
        capture="environment"
        @change="onPick"
      />
    </div>

    <!-- Full-screen view of a shared photo -->
    <Teleport to="body">
      <div v-if="viewing" class="shot-view" @click.self="viewing = null">
        <img :src="viewing.url" :alt="viewing.name" class="shot-view__img" />
        <button class="shot-view__close" aria-label="Close" @click="viewing = null">
          <AppIcon name="close" :size="20" :stroke="2.4" />
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.chat {
  height: 100%;
  display: flex;
  flex-direction: column;

  &__header {
    padding: 4px 20px 12px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  &__title {
    margin: 6px 0 4px;
  }

  &__sub {
    margin: 0;
    font-size: 13px;
  }

  &__dm {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: var(--paper-raised);
    box-shadow: var(--shadow-card);
    display: grid;
    place-items: center;
    color: var(--ink);
    flex-shrink: 0;
  }

  &__messages {
    flex: 1;
    min-height: 0;
    padding: 8px 20px 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    justify-content: flex-end;
  }

  &__msg {
    display: flex;
    gap: 8px;
    max-width: 82%;

    &--self {
      align-self: flex-end;
      flex-direction: row-reverse;
    }
  }

  &__avatar {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
    margin-top: 16px;
  }

  &__bubble-wrap {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  &__author {
    font-family: var(--font-eyebrow);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-size: 8.5px;
    font-weight: 700;
    color: var(--violet-45);

    &--coach {
      color: var(--orange);
    }
  }

  &__bubble {
    padding: 12px 14px;
    border-radius: 16px;
    font-size: 14px;
    line-height: 1.45;
    background: var(--paper-raised);
    box-shadow: var(--shadow-card);
    color: var(--ink);
    border-top-left-radius: 4px;
    display: flex;
    flex-direction: column;
    gap: 6px;

    // Photos and files bring their own edges, so the bubble hugs them.
    &--media {
      padding: 5px;
    }

    .chat__msg--coach & {
      background: #f2e4c9;
    }
    .chat__msg--self & {
      background: var(--rose);
      color: var(--paper-raised);
      border-top-left-radius: 16px;
      border-top-right-radius: 4px;
    }
  }

  &__text {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
  }

  &__shots {
    display: flex;
    max-width: 232px;

    &--multi {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 4px;
    }
  }

  &__shot {
    display: block;
    border-radius: 12px;
    overflow: hidden;
    background: rgba(36, 27, 46, 0.06);
    line-height: 0;

    img {
      display: block;
      width: 100%;
      max-height: 280px;
      object-fit: cover;
    }

    .chat__shots--multi & img {
      height: 104px;
      max-height: none;
    }
  }

  &__doc {
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 232px;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(36, 27, 46, 0.05);

    .chat__msg--self & {
      background: rgba(255, 255, 255, 0.18);
    }
  }

  &__doc-name {
    flex: 1;
    min-width: 0;
    font-size: 13px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__doc-size {
    font-size: 10px;
    opacity: 0.65;
    flex-shrink: 0;
  }

  &__time {
    align-self: flex-end;
    font-size: 9px;
    color: var(--violet-45);

    .chat__msg--self & {
      align-self: flex-start;
    }
  }

  &__reactions {
    display: flex;
    gap: 6px;
  }

  &__reaction {
    font-size: 11px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: var(--radius-pill);
    background: var(--paper-raised);
    box-shadow: var(--shadow-card);
  }

  &__composer {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 20px calc(16px + var(--tabbar-gutter));
  }

  &__attach-error {
    margin: 0;
    font-size: 12px;
    color: var(--rose);
  }

  &__tray {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    padding: 6px 4px 2px;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  &__row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  &__field {
    flex: 1;
    min-width: 0;
    height: 48px;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 6px 0 18px;
    border-radius: var(--radius-pill);
    background: var(--paper-raised);
    box-shadow: inset 0 0 0 1.5px rgba(36, 27, 46, 0.1);
  }

  &__input {
    flex: 1;
    min-width: 0;
    height: 100%;
    background: none;
    border: none;
    outline: none;
    font-size: 14px;
    color: var(--ink);

    &::placeholder {
      color: rgba(36, 27, 46, 0.4);
    }
  }

  &__tool {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: var(--violet-45);
    flex-shrink: 0;
    transition:
      color 0.15s ease,
      background 0.15s ease;

    &:hover:not(:disabled) {
      color: var(--rose);
      background: var(--rose-25);
    }

    &:disabled {
      opacity: 0.4;
      cursor: default;
    }
  }

  &__file {
    display: none;
  }

  @media (min-width: 1024px) {
    &__msg {
      max-width: 68%;
    }

    &__composer {
      padding-left: 0;
      padding-right: 0;
    }

    &__messages {
      padding-left: 0;
      padding-right: 0;
    }

    &__header {
      padding-left: 0;
      padding-right: 0;
    }
  }

  &__send {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--rose);
    color: var(--paper-raised);
    display: grid;
    place-items: center;
    flex-shrink: 0;
    box-shadow: var(--shadow-glow);
    transition: opacity 0.15s ease;

    &--idle {
      opacity: 0.45;
    }
  }
}

// --- Composer tray ---------------------------------------------------------
.tray-item {
  position: relative;
  flex-shrink: 0;

  &__img {
    display: block;
    width: 64px;
    height: 64px;
    border-radius: 12px;
    object-fit: cover;
    box-shadow: var(--shadow-card);
  }

  &__doc {
    width: 148px;
    height: 64px;
    padding: 10px;
    border-radius: 12px;
    background: var(--paper-raised);
    box-shadow: var(--shadow-card);
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    color: var(--ink);
  }

  &__name {
    font-size: 11px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__size {
    font-size: 9px;
    color: var(--violet-45);
  }

  &__remove {
    position: absolute;
    top: -5px;
    right: -5px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--ink);
    color: var(--paper-raised);
    display: grid;
    place-items: center;
  }
}

// --- Photo viewer ----------------------------------------------------------
.shot-view {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(20, 14, 26, 0.86);
  display: grid;
  place-items: center;
  padding: 24px;

  &__img {
    max-width: 100%;
    max-height: 82vh;
    border-radius: var(--radius-md);
    object-fit: contain;
  }

  &__close {
    position: absolute;
    top: calc(16px + env(safe-area-inset-top, 0px));
    right: 16px;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.16);
    color: var(--white);
    display: grid;
    place-items: center;
  }
}
</style>
