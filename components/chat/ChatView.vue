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
    /** The device store is full, so anything sent now is session-only. */
    storageFull?: boolean
  }>(),
  { placeholder: 'Say something…', dmLink: false, storageFull: false },
)

const emit = defineEmits<{
  (e: 'send', payload: { text: string; attachments: ChatAttachment[] }): void
  (e: 'react', payload: { messageId: string; emoji: string }): void
}>()

const draft = ref('')
const scroller = ref<HTMLElement | null>(null)

const scrollToEnd = async () => {
  await nextTick()
  const el = scroller.value
  if (el) el.scrollTop = el.scrollHeight
}

// --- Attachments -----------------------------------------------------------
/** Picked but not yet sent, shown as a tray above the composer. */
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
 * not yet populated, so an empty list gets one re-read before it is taken as
 * a cancelled pick.
 */
const filesFrom = async (input: HTMLInputElement): Promise<File[]> => {
  if (input.files?.length) return [...input.files]
  await new Promise((resolve) => setTimeout(resolve, 150))
  return [...(input.files ?? [])]
}

/**
 * Photos are read one at a time, with a beat between them.
 *
 * Each one decodes a full-resolution bitmap before it is scaled down, and the
 * thread behind the composer is already holding every photo in the
 * conversation. Four in a row with no gap is what pushes a phone over its
 * limit; yielding lets the browser release each bitmap before the next arrives.
 */
const breathe = () => new Promise((resolve) => setTimeout(resolve, 0))

const onPick = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const files = await filesFrom(input)
  if (!files.length) return // cancelled

  attachError.value = ''
  const room = roomLeft.value
  if (files.length > room) attachError.value = `You can send ${MAX_ATTACHMENTS} at a time.`

  reading.value = true
  try {
    for (const [index, file] of files.slice(0, room).entries()) {
      if (index) await breathe()
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

// --- Reactions -------------------------------------------------------------
/** What a hold offers. Six sit in one row at any phone width. */
const REACTIONS = ['💗', '🔥', '💪', '👏', '😂', '👍']

/** How long a press has to be held before it counts as a hold. */
const HOLD_MS = 420

/** Past this much movement it was a scroll, not a hold. */
const HOLD_SLOP_PX = 10

const BAR_WIDTH = 250
const BAR_HEIGHT = 46

/**
 * The message the picker is open against, with the numbers to anchor it to.
 *
 * Plain numbers rather than the DOMRect: a rect read through a reactive proxy
 * throws, because its getters need the real object as `this`.
 */
const reacting = ref<{ id: string; top: number; bottom: number; left: number } | null>(
  null,
)

/** The bubble under a finger right now, so it can give while it is held. */
const pressing = ref('')

let holdTimer: ReturnType<typeof setTimeout> | null = null
let holdOrigin = { x: 0, y: 0 }

/**
 * A hold that fired has to swallow the click that follows it. Letting go over a
 * photo would otherwise open the lightbox behind the picker.
 */
let holdFired = false

const cancelHold = () => {
  if (holdTimer) clearTimeout(holdTimer)
  holdTimer = null
  pressing.value = ''
}

const startHold = (event: PointerEvent, id: string) => {
  // Right-click has its own path through `contextmenu`; secondary buttons are
  // not a hold.
  if (event.pointerType === 'mouse' && event.button !== 0) return
  const bubble = event.currentTarget as HTMLElement
  cancelHold()
  holdFired = false
  pressing.value = id
  holdOrigin = { x: event.clientX, y: event.clientY }
  holdTimer = setTimeout(() => {
    holdTimer = null
    holdFired = true
    pressing.value = ''
    openReactions(id, bubble)
  }, HOLD_MS)
}

const openReactions = (id: string, bubble: HTMLElement) => {
  const box = bubble.getBoundingClientRect()
  reacting.value = { id, top: box.top, bottom: box.bottom, left: box.left }
  navigator.vibrate?.(12)
}

/** A finger that travels is scrolling the thread, so let go of the hold. */
const moveHold = (event: PointerEvent) => {
  if (!holdTimer) return
  const travelled =
    Math.abs(event.clientX - holdOrigin.x) + Math.abs(event.clientY - holdOrigin.y)
  if (travelled > HOLD_SLOP_PX) cancelHold()
}

/**
 * Right-click opens the same picker, and on Android a long press raises
 * `contextmenu` as well; preventing it is what keeps the system menu away.
 * No `holdFired` here: a context menu is not followed by a click to swallow.
 */
const onContextMenu = (event: MouseEvent, id: string) => {
  event.preventDefault()
  cancelHold()
  openReactions(id, event.currentTarget as HTMLElement)
}

const swallowClick = (event: MouseEvent) => {
  if (!holdFired) return
  holdFired = false
  event.stopPropagation()
  event.preventDefault()
}

/**
 * Sit the bar above the bubble, or below it when the bubble is near the top of
 * the thread, and keep it on screen either way.
 */
const pickerStyle = computed(() => {
  const anchor = reacting.value
  if (!anchor) return {}
  // Clear the author label that sits above a bubble, rather than landing on it.
  const above = anchor.top - BAR_HEIGHT - 18
  const top =
    above > 8 ? above : Math.min(anchor.bottom + 10, window.innerHeight - BAR_HEIGHT - 8)
  const left = Math.min(Math.max(8, anchor.left), window.innerWidth - BAR_WIDTH - 8)
  return { top: `${Math.round(top)}px`, left: `${Math.round(left)}px` }
})

const react = (emoji: string) => {
  const id = reacting.value?.id
  reacting.value = null
  if (id) emit('react', { messageId: id, emoji })
}

// A hold that scrolls out of view would leave the bar floating over nothing.
const closePicker = () => (reacting.value = null)

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

/**
 * The log, with each message's attachments split once.
 *
 * The template needs the image list three times per message (to decide the
 * grid, to size the thumbnails, to render them) and the file list once. As
 * plain helpers those were four `filter` passes and four throwaway arrays per
 * message on *every* render, and this list re-renders on each keystroke in the
 * composer, because the draft ref lives in the same component. Splitting once
 * per message, memoised on the messages themselves, makes a re-render free.
 */
const rows = computed(() =>
  props.messages.map((m) => {
    const attachments = m.attachments ?? []
    return {
      message: m,
      images: attachments.filter((a) => a.kind === 'image'),
      files: attachments.filter((a) => a.kind !== 'image'),
      bubble: bubbleClass(m),
      time: timeOf(m.sentAt),
    }
  }),
)

const TOOL =
  'grid size-9 shrink-0 place-items-center rounded-full text-muted transition-colors duration-150 not-disabled:hover:bg-rose-soft not-disabled:hover:text-rose disabled:cursor-default disabled:opacity-40'
</script>

<template>
  <!--
    `flex-1` rather than `h-full`: on the coach DM this sits under a
    ScreenHeader, and a height of 100% measures the whole column as though the
    header weren't there, so the composer ended up that far below the fold.
  -->
  <div class="flex min-h-0 flex-1 flex-col">
    <header
      class="chat__header flex shrink-0 items-start justify-between gap-3 px-5 pt-(--screen-pad-top) pb-3 lg:px-0 lg:pt-1"
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
      class="scroll-y min-h-0 flex-1 px-5 pt-2 pb-4 lg:px-0"
    >
      <!--
        The list carries `justify-end`, not the scroll box.

        On the box itself it looked right while a thread was short, but once the
        messages were taller than the box the overflow went off the *top*, where
        a scroll container has nothing to scroll to. The oldest messages were
        unreachable and a long reply or a photo pushed the composer out of the
        screen. `min-h-full` on the list keeps the short-thread behaviour and
        lets a long one grow downwards, which is the direction that scrolls.
      -->
      <div class="flex min-h-full flex-col justify-end gap-3.5">
        <div
          v-for="{ message: m, images, files, bubble, time } in rows"
          :key="m.id"
          class="flex max-w-[82%] gap-2 lg:max-w-[68%]"
          :class="m.isSelf && 'flex-row-reverse self-end'"
        >
          <img
            v-if="!m.isSelf"
            :src="m.authorAvatar"
            class="mt-4 size-7.5 shrink-0 rounded-full object-cover"
            :alt="m.authorName"
            width="30"
            height="30"
            loading="lazy"
            decoding="async"
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
            <!--
              Hold to react. `select-none` and the callout override are what
              make that possible on a phone: left alone, a long press on text
              starts a selection and raises the system menu instead.
            -->
            <div
              class="flex flex-col gap-1.5 rounded-2xl text-sm leading-[1.45] shadow-card select-none transition-transform duration-150 [-webkit-touch-callout:none]"
              :class="[
                bubble,
                m.text ? 'px-3.5 py-3' : 'p-1.25',
                pressing === m.id && 'scale-[0.97]',
              ]"
              @pointerdown="startHold($event, m.id)"
              @pointermove="moveHold"
              @pointerup="cancelHold"
              @pointercancel="cancelHold"
              @pointerleave="cancelHold"
              @click.capture="swallowClick"
              @contextmenu="onContextMenu($event, m.id)"
            >
              <div
                v-if="images.length"
                class="max-w-58"
                :class="images.length > 1 ? 'grid grid-cols-2 gap-1' : 'flex'"
              >
                <button
                  v-for="shot in images"
                  :key="shot.id"
                  class="block overflow-hidden rounded-xl bg-fill-subtle leading-none"
                  :aria-label="'Open ' + shot.name"
                  @click="viewing = shot"
                >
                  <img
                    :src="shot.url"
                    :alt="shot.name"
                    class="block w-full object-cover"
                    :class="images.length > 1 ? 'h-26' : 'max-h-70'"
                    loading="lazy"
                    decoding="async"
                  />
                </button>
              </div>

              <a
                v-for="doc in files"
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
              {{ time }}
            </span>

            <!-- The chips toggle too, so taking a reaction back is one tap. -->
            <div
              v-if="m.reactions?.length"
              class="flex flex-wrap gap-1.5"
              :class="m.isSelf && 'justify-end'"
            >
              <button
                v-for="r in m.reactions"
                :key="r.emoji"
                class="rounded-pill bg-raised px-2 py-0.5 text-[11px] font-bold text-ink shadow-card"
                :class="r.mine && 'shadow-[0_0_0_1.5px_var(--rose)]'"
                :aria-pressed="Boolean(r.mine)"
                :aria-label="`${r.count} reacted ${r.emoji}`"
                @click="emit('react', { messageId: m.id, emoji: r.emoji })"
              >
                {{ r.emoji }} {{ r.count }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      class="chat__composer flex shrink-0 flex-col gap-2 px-5 pt-3 pb-[calc(16px+var(--tabbar-gutter))] lg:px-0"
    >
      <p v-if="reading" class="m-0 text-xs text-muted">Adding to your message…</p>
      <p v-else-if="attachError" class="m-0 text-xs text-rose">{{ attachError }}</p>
      <p v-else-if="storageFull" class="m-0 text-xs text-orange-text">
        This device is out of space. Anything you send now will be gone after a
        reload, so clear a few progress photos to make room.
      </p>

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
            decoding="async"
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

    <!-- 20a · Reaction picker, opened by holding a message -->
    <Teleport to="body">
      <div
        v-if="reacting"
        class="fixed inset-0 z-70"
        @pointerdown="closePicker"
        @wheel="closePicker"
      >
        <div
          class="fixed flex items-center gap-0.5 rounded-pill bg-raised p-1.5 shadow-raised"
          :style="pickerStyle"
          role="menu"
          aria-label="Add a reaction"
          @pointerdown.stop
        >
          <button
            v-for="emoji in REACTIONS"
            :key="emoji"
            class="grid size-9 place-items-center rounded-full text-[19px] transition-transform duration-150 hover:bg-fill-subtle active:scale-90"
            role="menuitem"
            :aria-label="`React with ${emoji}`"
            @click="react(emoji)"
          >
            {{ emoji }}
          </button>
        </div>
      </div>
    </Teleport>

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
