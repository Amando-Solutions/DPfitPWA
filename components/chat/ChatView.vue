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

// A bubble's skin depends on who sent it. Resolving that here keeps the
// template from carrying three nested ternaries per element.
const bubbleClass = (m: ChatMessage) => [
  m.isSelf
    ? 'bg-rose-fill text-on-rose rounded-tl-2xl rounded-tr-[4px]'
    : 'rounded-tl-[4px]',
  !m.isSelf && m.isCoach && 'bg-bubble-coach text-ink',
  !m.isSelf && !m.isCoach && 'bg-raised text-ink',
]

const TOOL =
  'grid size-9 shrink-0 place-items-center rounded-full text-muted transition-colors duration-150 not-disabled:hover:bg-rose-soft not-disabled:hover:text-rose disabled:cursor-default disabled:opacity-40'
</script>

<template>
  <div class="flex h-full flex-col">
    <header
      class="flex items-start justify-between gap-3 px-5 pt-1 pb-3 lg:px-0"
    >
      <div>
        <EyebrowLabel>{{ eyebrow }}</EyebrowLabel>
        <h1 class="display-md mt-1.5 mb-1">{{ title }}</h1>
        <p class="muted m-0 text-[13px]">{{ subtitle }}</p>
      </div>
      <NuxtLink
        v-if="dmLink"
        to="/chat/coach"
        class="grid size-10.5 shrink-0 place-items-center rounded-full bg-raised text-ink shadow-card"
        aria-label="Message coach"
      >
        <AppIcon name="user" :size="18" />
      </NuxtLink>
    </header>

    <div
      ref="scroller"
      data-scroll-keep
      class="scroll-y flex min-h-0 flex-1 flex-col justify-end gap-3.5 px-5 pt-2 pb-4 lg:px-0"
    >
      <div
        v-for="m in messages"
        :key="m.id"
        class="flex max-w-[82%] gap-2 lg:max-w-[68%]"
        :class="m.isSelf && 'flex-row-reverse self-end'"
      >
        <img
          v-if="!m.isSelf"
          :src="m.authorAvatar"
          class="mt-4 size-7.5 shrink-0 rounded-full object-cover"
          :alt="m.authorName"
        />

        <div class="flex min-w-0 flex-col gap-1">
          <span
            v-if="!m.isSelf"
            class="font-eyebrow text-[8.5px] font-bold uppercase tracking-[0.5px]"
            :class="m.isCoach ? 'text-orange-text' : 'text-muted'"
          >
            {{ m.authorName }}
          </span>

          <!-- Photos and files bring their own edges, so the bubble hugs them. -->
          <div
            class="flex flex-col gap-1.5 rounded-2xl text-sm leading-[1.45] shadow-card"
            :class="[bubbleClass(m), m.text ? 'px-3.5 py-3' : 'p-1.25']"
          >
            <div
              v-if="imagesOf(m).length"
              class="max-w-58"
              :class="
                imagesOf(m).length > 1 ? 'grid grid-cols-2 gap-1' : 'flex'
              "
            >
              <button
                v-for="shot in imagesOf(m)"
                :key="shot.id"
                class="block overflow-hidden rounded-xl bg-fill-subtle leading-none"
                :aria-label="'Open ' + shot.name"
                @click="viewing = shot"
              >
                <img
                  :src="shot.url"
                  :alt="shot.name"
                  class="block w-full object-cover"
                  :class="
                    imagesOf(m).length > 1 ? 'h-26' : 'max-h-70'
                  "
                />
              </button>
            </div>

            <a
              v-for="doc in filesOf(m)"
              :key="doc.id"
              class="flex max-w-58 items-center gap-2 rounded-xl px-3 py-2.5"
              :class="m.isSelf ? 'bg-white/18' : 'bg-fill-subtle'"
              :href="doc.url"
              :download="doc.name"
            >
              <AppIcon name="file" :size="18" :stroke="1.8" />
              <span class="min-w-0 flex-1 truncate text-[13px] font-semibold">
                {{ doc.name }}
              </span>
              <span class="data shrink-0 text-[10px] opacity-65">
                {{ formatBytes(doc.size) }}
              </span>
            </a>

            <p v-if="m.text" class="m-0 wrap-break-word whitespace-pre-wrap">
              {{ m.text }}
            </p>
          </div>

          <span
            class="data text-[9px] text-muted"
            :class="m.isSelf ? 'self-start' : 'self-end'"
          >
            {{ timeOf(m.sentAt) }}
          </span>

          <div v-if="m.reactions?.length" class="flex gap-1.5">
            <span
              v-for="r in m.reactions"
              :key="r.emoji"
              class="rounded-pill bg-raised px-2 py-0.5 text-[11px] font-bold text-ink shadow-card"
            >
              {{ r.emoji }} {{ r.count }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div
      class="flex flex-col gap-2 px-5 pt-3 pb-[calc(16px+var(--tabbar-gutter))] lg:px-0"
    >
      <p v-if="attachError" class="m-0 text-xs text-rose">{{ attachError }}</p>

      <div
        v-if="pending.length"
        class="flex gap-2.5 overflow-x-auto px-1 pt-1.5 pb-0.5 scrollbar-none [&::-webkit-scrollbar]:hidden"
      >
        <div v-for="item in pending" :key="item.id" class="relative shrink-0">
          <img
            v-if="item.kind === 'image'"
            :src="item.url"
            :alt="item.name"
            class="block size-16 rounded-xl object-cover shadow-card"
          />
          <div
            v-else
            class="flex h-16 w-37 flex-col justify-center gap-0.5 rounded-xl bg-raised p-2.5 text-ink shadow-card"
          >
            <AppIcon name="file" :size="16" :stroke="1.8" />
            <span class="truncate text-[11px] font-semibold">
              {{ item.name }}
            </span>
            <span class="data text-[9px] text-muted">
              {{ formatBytes(item.size) }}
            </span>
          </div>
          <button
            class="absolute -top-1.25 -right-1.25 grid size-5 place-items-center rounded-full bg-inverse text-on-inverse"
            :aria-label="'Remove ' + item.name"
            @click="removePending(item.id)"
          >
            <AppIcon name="close" :size="11" :stroke="3" />
          </button>
        </div>
      </div>

      <div class="flex items-center gap-2.5">
        <div
          class="flex h-12 min-w-0 flex-1 items-center gap-0.5 rounded-pill bg-raised pr-1.5 pl-4.5 shadow-[inset_0_0_0_1.5px_var(--hairline)]"
        >
          <input
            v-model="draft"
            class="h-full min-w-0 flex-1 border-none bg-transparent text-sm text-ink outline-none"
            :placeholder="placeholder"
            @keyup.enter="send"
          />
          <button
            :class="TOOL"
            aria-label="Attach a file"
            :disabled="reading || roomLeft <= 0"
            @click="openPicker(attachInput)"
          >
            <AppIcon name="paperclip" :size="19" :stroke="1.9" />
          </button>
          <button
            :class="TOOL"
            aria-label="Take a photo"
            :disabled="reading || roomLeft <= 0"
            @click="openPicker(cameraInput)"
          >
            <AppIcon name="camera" :size="19" />
          </button>
        </div>

        <button
          class="btn-raised btn-glow grid size-12 shrink-0 place-items-center rounded-full bg-rose-fill text-on-rose [--btn-face:var(--rose-fill)]"
          :class="!canSend && 'opacity-45'"
          aria-label="Send"
          @click="send"
        >
          <AppIcon name="send" :size="18" fill />
        </button>
      </div>

      <input
        ref="attachInput"
        class="hidden"
        type="file"
        :accept="FILE_ACCEPT"
        multiple
        @change="onPick"
      />
      <input
        ref="cameraInput"
        class="hidden"
        type="file"
        :accept="IMAGE_ACCEPT"
        capture="environment"
        @change="onPick"
      />
    </div>

    <!-- Full-screen view of a shared photo -->
    <Teleport to="body">
      <div
        v-if="viewing"
        class="fixed inset-0 z-60 grid place-items-center bg-scrim-photo p-6"
        @click.self="viewing = null"
      >
        <img
          :src="viewing.url"
          :alt="viewing.name"
          class="max-h-[82vh] max-w-full rounded-md object-contain"
        />
        <button
          class="absolute top-[calc(16px+env(safe-area-inset-top,0px))] right-4 grid size-10 place-items-center rounded-full bg-white/16 text-white"
          aria-label="Close"
          @click="viewing = null"
        >
          <AppIcon name="close" :size="20" :stroke="2.4" />
        </button>
      </div>
    </Teleport>
  </div>
</template>
