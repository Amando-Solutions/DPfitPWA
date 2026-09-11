<script setup lang="ts">
import { Bubble, BubbleContent, BubbleReactions } from '~/components/ui/bubble'
import type { ChatAttachment, ChatMessageView, ChatReplyRef, TypingPeer } from '~/data/types'
import {
  FILE_ACCEPT,
  IMAGE_ACCEPT,
  MAX_ATTACHMENTS,
  fileToPending,
  formatBytes,
  previewOf,
  type PendingAttachment,
} from '~/lib/attachments'
import {
  TYPING_IDLE_MS,
  continuesRun,
  replyPreview,
  replyRefFor,
  typingLabel,
} from '~/lib/chat'
import { storage } from '~/lib/storage'
import { formatTime } from '~/lib/time'

const props = withDefaults(
  defineProps<{
    messages: ChatMessageView[]
    /**
     * Which thread this is, used to key the member's place in it. Two threads
     * on one device must not share a marker: coming back to the coach DM at the
     * cohort chat's position would be worse than no memory at all.
     */
    thread: string
    /**
     * Everyone else with the composer open in this thread. Never the viewer —
     * see `DataSource.watchTyping`, which filters them out at the source.
     */
    typing?: TypingPeer[]
    eyebrow?: string
    title: string
    subtitle: string
    placeholder?: string
    /** The device store is full, so anything sent now is session-only. */
    storageFull?: boolean
    /**
     * Send the composer's contents. A prop rather than an emit, because this
     * one has to be awaited.
     *
     * Sending a message with photos on it is an upload and then a write, over
     * a phone connection, and either half can fail. As an emit there was
     * nothing to await: the composer cleared itself the instant it fired, so a
     * refused upload took the member's text and their four photos with it and
     * told them nothing — the rejection surfaced as an unhandled promise on a
     * screen that looked like it had sent. Awaiting means the draft survives a
     * failure and the reason for it can be shown where the message still is.
     */
    send: (payload: {
      text: string
      attachments: PendingAttachment[]
      replyTo: ChatReplyRef | null
    }) => Promise<void>
  }>(),
  { placeholder: 'Say something…', storageFull: false, typing: () => [] },
)

const emit = defineEmits<{
  (e: 'react', payload: { messageId: string; emoji: string }): void
  /**
   * Whether the member is composing. Fired on the edges rather than on every
   * keystroke — on the first character, every few seconds while they keep
   * going, and once when they stop — because the handler behind it is a write.
   */
  (e: 'typing', typing: boolean): void
}>()

const store = useAppStore()

const draft = ref('')
const scroller = ref<HTMLElement | null>(null)
const composer = ref<HTMLInputElement | null>(null)

/**
 * Sit at the newest message.
 *
 * `smooth` for the jump button only. Everything else — a send, an arrival, the
 * composer growing — wants the view already there by the time the member looks
 * at it, and animating those reads as the thread lurching on its own.
 */
const scrollToEnd = async (smooth = false) => {
  await nextTick()
  const el = scroller.value
  if (!el) return
  if (smooth) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  else el.scrollTop = el.scrollHeight
}

/**
 * Whose messages are "mine", as a uid.
 *
 * Taken off the thread rather than from the member document, because the
 * thread is the thing that decided: `isSelf` is resolved by the data source
 * against whatever identity it authenticated, and a quote has to agree with
 * the bubbles around it. The member id is the fallback for a member who has
 * not said anything yet, which is also the case where it cannot be wrong.
 */
const viewerUid = computed(
  () => props.messages.find((m) => m.isSelf)?.authorUid ?? store.member.value?.id ?? '',
)

// --- Attachments -----------------------------------------------------------
/**
 * One item in the tray above the composer.
 *
 * Nothing here has been uploaded yet, so there is no document id to key on and
 * no download URL to render: the id is local to this composer and the preview
 * is the data URL the decode already produced. Both are discarded on send —
 * what the data source hands back afterwards is the stored attachment.
 */
interface PendingItem {
  id: string
  name: string
  bytes: number
  /** Data URL for images; empty for files, which render as a chip. */
  previewUrl: string
  attachment: PendingAttachment
}

let pendingSeq = 0

/** Picked but not yet sent, shown as a tray above the composer. */
const pending = ref<PendingItem[]>([])
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
        const attachment = await fileToPending(file)
        const preview = previewOf(attachment)
        pending.value = [
          ...pending.value,
          {
            id: `pending-${(pendingSeq += 1)}`,
            name: preview.name,
            bytes: preview.bytes,
            previewUrl: preview.url,
            attachment,
          },
        ]
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

// --- Replying --------------------------------------------------------------
/**
 * The message the composer is answering, or `null` for a fresh one.
 *
 * The whole message rather than the `ChatReplyRef` it will be sent as, so the
 * strip above the composer can show the real thing — a photo thumbnail, the
 * full text — while only the excerpt is written to the document.
 */
const replyingTo = ref<ChatMessageView | null>(null)

/**
 * A quoted message that has just been jumped to.
 *
 * The whole row lights up rather than the bubble, which is why the row runs
 * full-bleed: landing in the middle of a thread you were not reading, the thing
 * that has to catch the eye is a band across the screen, not a hairline around
 * a shape that looks like every other shape on the page.
 */
const flashing = ref('')
let flashTimer: ReturnType<typeof setTimeout> | null = null

const startReply = (id: string) => {
  const target = props.messages.find((m) => m.id === id)
  if (!target) return
  replyingTo.value = target
  navigator.vibrate?.(8)
  // Focusing raises the keyboard, which is the point: a reply that needs a
  // second tap on the field is slower than not having the gesture at all.
  nextTick(() => composer.value?.focus())
}

const cancelReply = () => {
  replyingTo.value = null
}

// --- Saying that you are typing --------------------------------------------
/**
 * The composer reports the *edges* of typing, not the keystrokes.
 *
 * `true` goes out on every change and is rate-limited by the data source, which
 * is the layer that knows what a write costs. `false` is this side's job, and
 * there are three ways to reach it: emptying the field, sending, and going
 * quiet for `TYPING_IDLE_MS`. All three matter — a marker left on is somebody
 * who appears to be typing a message that is never coming.
 */
let idleTimer: ReturnType<typeof setTimeout> | null = null

const stopTyping = () => {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = null
  emit('typing', false)
}

watch(draft, (text) => {
  if (!text.trim()) {
    stopTyping()
    return
  }
  emit('typing', true)
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    idleTimer = null
    emit('typing', false)
  }, TYPING_IDLE_MS)
})

/** "Tomi is typing…", or "Multiple people are typing…". Empty when nobody is. */
const typingLine = computed(() => typingLabel(props.typing))

/** "You" for the viewer's own words, so a quote reads as one side of an exchange. */
const quoteAuthor = (quote: ChatReplyRef) =>
  quote.authorUid === viewerUid.value ? 'You' : quote.authorName

/**
 * Scroll to a message and mark it, wherever the request came from — a tap on a
 * quote, or the mention button.
 *
 * A best effort by design: the thread holds its last 200 messages, and a reply
 * to something older has nothing on screen to scroll to. That is why the quote
 * carries its own copy of the text — the tap is a shortcut, not the only way
 * to see what was said.
 */
/** The band's own `--animate-jump-flash`, plus a beat so it is gone before it is. */
const FLASH_MS = 1500

const jumpToMessage = async (messageId: string) => {
  const target = scroller.value?.querySelector<HTMLElement>(
    `[data-message="${CSS.escape(messageId)}"]`,
  )
  if (!target) return
  target.scrollIntoView({ block: 'center', behavior: 'smooth' })

  if (flashTimer) clearTimeout(flashTimer)

  // Cleared and re-set across a tick rather than simply assigned. The band is
  // a CSS animation on an element that only exists while it is flashing, so
  // tapping the same quote twice would set a ref to the value it already holds,
  // render nothing, and replay nothing — the second tap would look broken.
  flashing.value = ''
  await nextTick()
  flashing.value = messageId

  flashTimer = setTimeout(() => {
    flashing.value = ''
    flashTimer = null
  }, FLASH_MS)
}

// --- Reactions -------------------------------------------------------------
/** What a hold offers. Six sit in one row at any phone width. */
const REACTIONS = ['💗', '🔥', '💪', '👏', '😂', '👍']

/** How long a press has to be held before it counts as a hold. */
const HOLD_MS = 420

/**
 * How far a finger has to travel before the press is a gesture rather than a
 * hold, and — the same number — before a sideways one is committed to being a
 * drag. Two thresholds here left a band where a slow swipe was abandoned as a
 * scroll before it was far enough along to be a drag, and did nothing at all.
 */
const GESTURE_SLOP_PX = 10

/** Six emoji, a divider and the reply button, plus the bar's own padding. */
const BAR_WIDTH = 296
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

// --- The press ------------------------------------------------------------
//
// One pointer sequence, two gestures. A press that stays put becomes a hold and
// opens the reaction bar; a press that travels sideways becomes a drag and arms
// a reply. Which one it is cannot be known at `pointerdown`, so both are
// tracked from the same origin and the first to resolve cancels the other.

/** Past this, letting go opens a reply. Roughly a thumb's width. */
const SWIPE_TRIGGER_PX = 56

/** The bubble stops following the finger here, so the thread cannot be dragged apart. */
const SWIPE_MAX_PX = 68

/** The gap between two taps that still makes them one double tap. */
const DOUBLE_TAP_MS = 320

/**
 * How far the second tap may land from the first.
 *
 * Generous, because a thumb does not come down twice in the same square
 * millimetre, and the two taps are already known to be on the same bubble.
 */
const DOUBLE_TAP_SLOP_PX = 28

/** The last plain tap, so the next one can be measured against it. */
let lastTap = { id: '', at: 0, x: 0, y: 0 }

/**
 * Whether this press started on something that has its own action.
 *
 * The row is the press target now, and the row contains controls: reaction
 * chips, the quote, a photo. Holding and dragging from those is still wanted —
 * holding a photo to react to it is how the reaction bar has always been
 * opened — but a *tap* on them belongs to them. Without this, toggling a
 * reaction on and straight back off is two taps in the same place and opens a
 * reply on the way past.
 */
let pressOnControl = false

/** The bubble being dragged and how far it has come. */
const swipe = ref<{ id: string; dx: number } | null>(null)

let holdTimer: ReturnType<typeof setTimeout> | null = null
let pressOrigin = { x: 0, y: 0 }
let pressId = ''
let pressTarget: HTMLElement | null = null
let pressPointer = -1

/**
 * Which way the finger committed, once it has moved far enough to say.
 *
 * `y` means the browser is scrolling the thread and this press is over —
 * `touch-action: pan-y` on the bubble hands vertical movement straight to the
 * scroller, so there is nothing to do but let go of both gestures.
 */
let axis: 'undecided' | 'x' | 'y' = 'undecided'

/**
 * A gesture that fired has to swallow the click that follows it. Letting go
 * over a photo would otherwise open the lightbox behind the reaction bar, or
 * at the end of a swipe.
 */
let swallowNextClick = false

const releasePointer = () => {
  if (pressTarget && pressPointer !== -1) {
    try {
      pressTarget.releasePointerCapture(pressPointer)
    } catch {
      // The pointer is already gone — a cancel, or a capture that was never
      // taken because the press never became a drag.
    }
  }
  pressTarget = null
  pressPointer = -1
}

/** Forget the press without acting on it. The clean-up half of `endPress`. */
const resetPress = () => {
  if (holdTimer) clearTimeout(holdTimer)
  holdTimer = null
  pressing.value = ''
  swipe.value = null
  releasePointer()
  pressId = ''
  pressOnControl = false
  axis = 'undecided'
}

/**
 * Let go.
 *
 * Three things can come out of a press ending: a drag past the trigger opens a
 * reply, a second tap soon after the first opens a reply, and anything else
 * just springs back — which is what the transition on the row is for.
 *
 * A press that has already resolved into something — a hold that opened the
 * reaction bar, a drag that armed a reply — has set `swallowNextClick`, and
 * that is also what says it was not a tap. `onControl` rules out the rest: a
 * tap that landed on a photo, a quote or a reaction chip belongs to that
 * control. Those are reachable by swipe and by the hold menu, which is where a
 * reply to a photos-only message comes from.
 */
const endPress = (event?: PointerEvent, id?: string) => {
  const dragged = swipe.value
  const armed = dragged && dragged.dx >= SWIPE_TRIGGER_PX ? dragged.id : ''
  const onControl = pressOnControl
  resetPress()

  if (armed) {
    swallowNextClick = true
    startReply(armed)
    return
  }

  if (swallowNextClick || onControl || !event || !id) return

  const now = Date.now()
  const travelled =
    Math.abs(event.clientX - lastTap.x) + Math.abs(event.clientY - lastTap.y)

  if (lastTap.id === id && now - lastTap.at <= DOUBLE_TAP_MS && travelled <= DOUBLE_TAP_SLOP_PX) {
    // Forgotten, so a third tap starts a fresh pair rather than firing again.
    lastTap = { id: '', at: 0, x: 0, y: 0 }
    swallowNextClick = true
    startReply(id)
    return
  }

  lastTap = { id, at: now, x: event.clientX, y: event.clientY }
}

/**
 * The bubble inside a row, which is what the reaction bar has to be anchored
 * to.
 *
 * The press is handled on the row so that the blank half of the line is part of
 * the target, which means `currentTarget` is the row and its rect is the width
 * of the thread. Opening the bar against that would put it under the left
 * margin of an outgoing message rather than against the message.
 */
const bubbleIn = (row: HTMLElement): HTMLElement =>
  row.querySelector<HTMLElement>('[data-slot="bubble-content"]') ?? row

const startPress = (event: PointerEvent, id: string) => {
  // Right-click has its own path through `contextmenu`; secondary buttons are
  // not a press.
  if (event.pointerType === 'mouse' && event.button !== 0) return
  const row = event.currentTarget as HTMLElement
  const bubble = bubbleIn(row)
  resetPress()
  swallowNextClick = false

  pressOnControl = Boolean((event.target as HTMLElement).closest('button, a'))
  pressing.value = id
  pressId = id
  pressTarget = row
  pressPointer = event.pointerId
  pressOrigin = { x: event.clientX, y: event.clientY }
  axis = 'undecided'

  holdTimer = setTimeout(() => {
    holdTimer = null
    swallowNextClick = true
    pressing.value = ''
    openReactions(id, bubble)
  }, HOLD_MS)
}

/**
 * How far the bubble actually moves for a finger that has travelled `dx`.
 *
 * One-to-one up to the trigger, so the threshold is somewhere the hand can
 * feel, and heavily damped past it: the extra travel says the gesture was
 * committed, not that the bubble should keep going.
 */
const followFinger = (dx: number) => {
  if (dx <= SWIPE_TRIGGER_PX) return dx
  return Math.min(SWIPE_MAX_PX, SWIPE_TRIGGER_PX + (dx - SWIPE_TRIGGER_PX) * 0.28)
}

const movePress = (event: PointerEvent) => {
  if (!pressId || event.pointerId !== pressPointer) return

  const dx = event.clientX - pressOrigin.x
  const dy = event.clientY - pressOrigin.y

  if (axis === 'undecided') {
    if (Math.abs(dx) < GESTURE_SLOP_PX && Math.abs(dy) < GESTURE_SLOP_PX) return

    // Sideways and to the right is a reply. Anything else — upwards, downwards,
    // or a leftward swipe, which is the browser's own back gesture on iOS — is
    // left alone, and the press is finished either way.
    if (dx >= GESTURE_SLOP_PX && dx > Math.abs(dy)) {
      axis = 'x'
      if (holdTimer) clearTimeout(holdTimer)
      holdTimer = null
      pressing.value = ''
      // Capture, so a finger that leaves the bubble mid-drag keeps feeding it.
      pressTarget?.setPointerCapture(event.pointerId)
    } else {
      axis = 'y'
      resetPress()
      return
    }
  }

  if (axis !== 'x') return
  swipe.value = { id: pressId, dx: followFinger(Math.max(0, dx)) }
}

const openReactions = (id: string, bubble: HTMLElement) => {
  const box = bubble.getBoundingClientRect()
  reacting.value = { id, top: box.top, bottom: box.bottom, left: box.left }
  navigator.vibrate?.(12)
}

/**
 * Right-click opens the same picker, and on Android a long press raises
 * `contextmenu` as well; preventing it is what keeps the system menu away.
 * No `swallowNextClick` here: a context menu is not followed by a click.
 */
const onContextMenu = (event: MouseEvent, id: string) => {
  event.preventDefault()
  const bubble = bubbleIn(event.currentTarget as HTMLElement)
  resetPress()
  openReactions(id, bubble)
}

const swallowClick = (event: MouseEvent) => {
  if (!swallowNextClick) return
  swallowNextClick = false
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

/**
 * Reply from the hold menu.
 *
 * The gesture is the fast path, but it is a touch gesture: a member on a laptop
 * and anyone who cannot drag needs the same action somewhere they can reach it,
 * and the menu they already hold a message to open is that place.
 */
const replyFromPicker = () => {
  const id = reacting.value?.id
  reacting.value = null
  if (id) startReply(id)
}

// A hold that scrolls out of view would leave the bar floating over nothing.
const closePicker = () => (reacting.value = null)

// --- Sending ---------------------------------------------------------------
/**
 * True while photos are going up, and only then.
 *
 * It used to cover every send, which is what made the composer sit there
 * holding a member's text after they had pressed send. A text message needs no
 * such state: it is on screen before the write is acknowledged — see `submit`.
 */
const sending = ref(false)

/** Why the last send did not go, in the member's words. */
const sendError = ref('')

const canSend = computed(
  () => !sending.value && Boolean(draft.value.trim() || pending.value.length),
)

/**
 * What went wrong, in the member's words.
 *
 * The upload and the write both throw sentences written to be read, so one is
 * shown as-is. The cause still goes to the console: what a member needs to read
 * and what whoever configured the project needs to read are rarely the same.
 */
const reportFailure = (cause: unknown) => {
  console.error('[chat] send failed', cause)
  sendError.value = cause instanceof Error ? cause.message : 'Could not send that. Try again.'
}

/**
 * Send, in two paths, because the two kinds of message have nothing in common
 * from the member's side.
 *
 * A **text** message is already on screen before the write is acknowledged. The
 * data source hands it to the local cache, and every listener on the thread —
 * including this screen's — is called with it immediately; the promise from the
 * write resolves later, when the *server* says so. Waiting for that before
 * emptying the composer meant a member watched their own words sit in the box
 * for a round trip after they had pressed send, with the bubble already drawn
 * above it. Worse, offline that promise never resolves at all, so the composer
 * stayed full and the button stayed disabled for a message that had been sent
 * as far as anyone could tell. So the composer clears first and the write is
 * followed up on afterwards.
 *
 * A message with **photos** genuinely has nothing to show yet: the bytes have
 * to reach Cloud Storage before a document can reference them, so there is no
 * bubble to appear and the tray is the only evidence the send is happening.
 * That one keeps the old behaviour — hold everything, show the progress, and
 * keep the draft if it fails, because the photos were decoded in memory and are
 * no longer anywhere the member could pick them from again.
 */
const submit = () => {
  if (!canSend.value) return

  const text = draft.value.trim()
  const items = pending.value
  const answering = replyingTo.value
  const payload = {
    text,
    attachments: items.map((item) => item.attachment),
    replyTo: answering ? replyRefFor(answering) : null,
  }

  sendError.value = ''

  if (items.length) {
    sending.value = true
    props
      .send(payload)
      .then(() => {
        draft.value = ''
        pending.value = []
        replyingTo.value = null
        attachError.value = ''
        stopTyping()
      })
      .catch(reportFailure)
      .finally(() => {
        sending.value = false
        scrollToEnd()
      })
    return
  }

  // Cleared before the send rather than after it. `stopTyping` is called
  // outright rather than left to the watcher on `draft`, which would not run
  // until the next tick: pressing send is the clearest statement there is that
  // the typing is over.
  draft.value = ''
  replyingTo.value = null
  attachError.value = ''
  stopTyping()
  scrollToEnd()

  props.send(payload).catch((cause) => {
    reportFailure(cause)
    // Put it back — unless something has been typed since. Overwriting a draft
    // the member is in the middle of writing, to restore one they have already
    // seen fail, loses the message they still care about to save the one they
    // do not.
    if (draft.value || pending.value.length) return
    draft.value = text
    replyingTo.value = answering
  })
}

/**
 * How close to the bottom still counts as "reading the latest", in pixels.
 * Roughly one bubble: enough that a thumb resting slightly off the end is not
 * treated as having scrolled away.
 */
const STICK_TO_END_PX = 120

const atEnd = () => {
  const el = scroller.value
  if (!el) return true
  return el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_TO_END_PX
}

// --- Keeping the member's place -------------------------------------------
//
// A thread that always opens at the newest message is a thread you cannot
// leave. Anything you were half way through reading is gone the moment you tap
// away, and the only way back is to scroll for it. So the deepest message the
// member has actually reached is remembered per thread.
//
// Reopening then does what every group chat worth using does: it puts the
// *first message you have not read* at the top of the screen, under a band
// saying how many there are, and lets the member read down through them in the
// order they were said. Not the last message they read at the bottom — that
// looks identical to opening at the newest message and hides the new half of
// the conversation below the fold — and not the newest message, which is the
// end of a conversation whose beginning they never saw.
//
// The band stays put while the screen is open. It is a mark of where the member
// came in, so it must not slide down as they read past it, or move because
// somebody said something else while they were reading.

/** Where this thread's marker lives. Per thread: see the `thread` prop. */
const seenKey = computed(() => `chat-seen:${props.thread}`)

/**
 * How far down the thread the member has read, as an index into `messages`.
 *
 * An index rather than a scroll offset, because a scroll offset describes a
 * layout rather than a conversation: a photo finishing its decode, or the
 * keyboard opening, moves every pixel in the thread and none of the messages.
 * Reactive because the mention count is measured against it.
 */
const seenIndex = ref(-1)

/** Whether the view is resting at the newest message. Drives the jump button. */
const atBottom = ref(true)

/** How many have arrived below the fold since the member scrolled away. */
const newBelow = ref(0)

/**
 * The first message of the unread run, as an id, fixed when the screen opened.
 *
 * An id rather than an index for the same reason the stored marker is one: the
 * thread is a sliding window of the last 200 messages, so an index taken on
 * open describes a different message an hour later. Empty when the member
 * arrived with nothing to catch up on, which is what hides the band.
 */
const unreadFromId = ref('')

/** How many there were to catch up on, counted once. See `unreadFromId`. */
const unreadCount = ref(0)

const unreadFrom = computed(() =>
  unreadFromId.value
    ? props.messages.findIndex((m) => m.id === unreadFromId.value)
    : -1,
)

const unreadLabel = computed(() =>
  unreadCount.value === 1 ? '1 unread message' : `${unreadCount.value} unread messages`,
)

let seenSaveTimer: ReturnType<typeof setTimeout> | null = null

const saveSeen = () => {
  const id = props.messages[seenIndex.value]?.id
  if (id) storage.write(seenKey.value, id)
}

/**
 * Advance the marker to the deepest row that has come above the fold.
 *
 * Scanned forward from where it already is rather than over the whole thread:
 * the marker only ever moves down — scrolling up to reread something is not
 * unreading it — so the work is proportional to how far the member just
 * scrolled, not to how long the conversation is.
 */
const trackSeen = () => {
  const el = scroller.value
  if (!el) return
  const fold = el.getBoundingClientRect().bottom
  const rows = el.querySelectorAll<HTMLElement>('[data-message]')

  let deepest = seenIndex.value
  for (let i = Math.max(seenIndex.value, 0); i < rows.length; i += 1) {
    const row = rows[i]
    if (!row || row.getBoundingClientRect().top >= fold) break
    deepest = i
  }
  if (deepest <= seenIndex.value) return

  seenIndex.value = deepest
  // Debounced, because this runs on a scroll and `localStorage.setItem` is
  // synchronous and on some engines touches disk. The marker is already correct
  // in memory; only writing it down can wait.
  if (seenSaveTimer) clearTimeout(seenSaveTimer)
  seenSaveTimer = setTimeout(saveSeen, 1200)
}

const onScroll = () => {
  const resting = atEnd()
  atBottom.value = resting
  if (resting) newBelow.value = 0
  trackSeen()
}

/**
 * How much of the last message they did read stays on screen above the band,
 * in pixels.
 *
 * Landing the band flush against the top edge reads as the thread having been
 * cut off there. A sliver of the message above it says the opposite — that
 * there is a conversation behind this, and it is the one they were in.
 */
const UNREAD_PEEK_PX = 22

/** Open at the newest message: nothing to catch up on, or nothing to catch up from. */
const openAtEnd = async () => {
  seenIndex.value = props.messages.length - 1
  unreadFromId.value = ''
  unreadCount.value = 0
  await scrollToEnd()
  atBottom.value = true
  newBelow.value = 0
  // Written now rather than left to the scroll handler. `trackSeen` only ever
  // moves the marker *down*, and it is already as deep as it goes, so nothing
  // else here would record that this thread has been caught up with — and the
  // tab's dot is read off exactly that record.
  saveSeen()
}

/**
 * Reopen at the first message the member has not read.
 *
 * The stored id rather than its index, because the thread is the last 200
 * messages and the window slides: the message that was number 140 last night is
 * number 120 this morning. A marker whose message has fallen off the end — or
 * that belongs to a thread being read for the first time — falls through to the
 * newest message, which is the right answer for both.
 */
const restorePlace = async () => {
  const id = storage.read<string>(seenKey.value, '')
  const index = id ? props.messages.findIndex((m) => m.id === id) : -1
  const unread = index < 0 ? [] : props.messages.slice(index + 1)

  // Their own messages are not something to catch up on: a run sent from
  // another device is already read by definition, and a band announcing it
  // would be the thread telling the member what they said. Nothing else
  // unread, and this is a thread they are up to date with.
  if (!unread.some((m) => !m.isSelf)) {
    await openAtEnd()
    return
  }

  const [first] = unread
  unreadFromId.value = first!.id
  unreadCount.value = unread.length
  seenIndex.value = index

  // After the band exists in the DOM, since it is what gets scrolled to.
  await nextTick()
  const target = scroller.value?.querySelector<HTMLElement>('[data-unread-band]')
  if (!target) {
    await openAtEnd()
    return
  }

  // `start`, not `end`: the unread run belongs *below* the fold line, filling
  // the screen downwards, so the member reads forward through it. Anchoring on
  // the last message they had read instead put the whole unread half of the
  // conversation off the bottom of the screen, which looks exactly like opening
  // at the newest message and is the reason this changed.
  target.scrollIntoView({ block: 'start' })
  if (scroller.value) scroller.value.scrollTop -= UNREAD_PEEK_PX

  newBelow.value = unread.length
  atBottom.value = atEnd()
}

onBeforeUnmount(() => {
  if (flashTimer) clearTimeout(flashTimer)
  if (holdTimer) clearTimeout(holdTimer)
  if (seenSaveTimer) clearTimeout(seenSaveTimer)
  // The debounce above may have been mid-wait. Leaving the screen is exactly
  // when the marker has to be on disk.
  saveSeen()
  // Leaving the screen with a half-written message would otherwise leave the
  // cohort watching a marker that only the TTL can clear.
  stopTyping()
})

/**
 * Follow the conversation, unless the member is reading something else.
 *
 * Messages arrive on their own, not only when this screen asks for them, and
 * scrolling to the end on every arrival means someone scrolled up to find a
 * photo from Tuesday gets thrown back to the bottom the moment anybody says
 * anything. So an arrival only moves the view when the view was already at the
 * end — measured before the DOM updates, which is where this watcher runs — and
 * otherwise it is counted onto the jump button instead.
 *
 * Own sends are not subject to it: `submit` calls `scrollToEnd` directly, on
 * the reasoning that pressing send is a statement about where you want to be.
 *
 * The first delivery is neither case. It is the thread arriving, and it goes to
 * wherever the member left off.
 */
let placeRestored = false

watch(
  () => props.messages.length,
  (next, previous) => {
    // `immediate` runs this once before anything has arrived, where there is no
    // previous length at all. Zero is the honest reading of that.
    const before = previous ?? 0

    if (!placeRestored && next) {
      placeRestored = true
      restorePlace()
      return
    }
    if (next > before && !atEnd()) {
      newBelow.value += next - before
      atBottom.value = false
      return
    }
    scrollToEnd()
  },
  { immediate: true },
)

// The reply strip changes the composer's height, so the last bubble would end
// up behind it on a thread that was sitting exactly at the bottom. The typing
// indicator is a row at the end of the thread and does the same.
watch(replyingTo, (target) => {
  if (target && atEnd()) scrollToEnd()
})

watch(typingLine, (line) => {
  if (line && atEnd()) scrollToEnd()
})

// Shadcn's variants own the bubble skin; this local shape keeps the app's
// sender/receiver tail treatment.
const bubbleVariant = (m: ChatMessageView): 'default' | 'secondary' | 'muted' =>
  m.isSelf ? 'default' : m.isCoach ? 'muted' : 'secondary'

/**
 * The clipped corner is the tail, and a run of messages has one tail.
 *
 * It sits on the *top* corner nearest the sender, so it belongs to the first
 * bubble of a run — the one the name and the face are level with. Everything
 * underneath it is the same person still talking and is drawn as a plain
 * rounded bubble, which is what makes a run read as one turn rather than as
 * three separate interruptions.
 */
const bubbleShape = (m: ChatMessageView, startsRun: boolean) => {
  if (!startsRun) return 'rounded-2xl'
  return m.isSelf ? 'rounded-2xl rounded-tr-[4px]' : 'rounded-2xl rounded-tl-[4px]'
}

/**
 * The quote's corners, derived from the bubble it is seated in.
 *
 * `rounded-lg` was wrong here for a reason worth writing down: this theme
 * redefines the radius scale, so `--radius-lg` is 26px rather than the 8px the
 * name suggests. On a two-line quote that is a pill, and a pill inside a 16px
 * bubble reads as a chip dropped into it rather than a panel seated in it.
 *
 * The rule is concentric: an inner corner inset by `d` from an outer corner of
 * radius `r` wants `r - d`, and squares off when that goes negative. The quote
 * sits 8px inside every edge it touches and the bubble is 16px — except at its
 * tail, which is 4px, so that corner comes out square. Spelled in pixels rather
 * than in scale names precisely because the scale is not what it looks like.
 */
const quoteShape = (m: ChatMessageView, startsRun: boolean) => {
  if (!startsRun) return 'rounded-[8px]'
  return m.isSelf ? 'rounded-[8px] rounded-tr-none' : 'rounded-[8px] rounded-tl-none'
}

/**
 * The log, with each message's attachments split once and its place in a run
 * worked out once.
 *
 * The template needs the image list three times per message (to decide the
 * grid, to size the thumbnails, to render them) and the file list once. As
 * plain helpers those were four `filter` passes and four throwaway arrays per
 * message on *every* render, and this list re-renders on each keystroke in the
 * composer, because the draft ref lives in the same component. Splitting once
 * per message, memoised on the messages themselves, makes a re-render free.
 *
 * `startsRun` and `endsRun` are the grouping: see `continuesRun`. The first
 * message of a run carries the face, the name and the tail; the last carries
 * the timestamp, because one time under a run describes the whole run and
 * a time under every bubble is noise nobody reads.
 */
const rows = computed(() =>
  props.messages.map((m, index) => {
    const attachments = m.attachments ?? []
    const next = props.messages[index + 1]
    const startsRun = !continuesRun(m, props.messages[index - 1])
    return {
      message: m,
      images: attachments.filter((a) => a.kind === 'image'),
      files: attachments.filter((a) => a.kind !== 'image'),
      startsRun,
      endsRun: !next || !continuesRun(next, m),
      first: index === 0,
      /** This message opens the unread run, so the band is drawn above it. */
      startsUnread: index === unreadFrom.value,
      shape: bubbleShape(m, startsRun),
      quoteShape: quoteShape(m, startsRun),
      variant: bubbleVariant(m),
      time: formatTime(m.sentAt),
      /**
       * Somebody else has answered this member, by name.
       *
       * The quote says `@You` either way; this is what makes the bubble itself
       * catch the eye on the way past, because being answered in a thread of
       * forty people is easy to scroll straight through. Not set when the
       * member is quoting themselves — they know.
       */
      mentionsMe: Boolean(
        m.replyTo && !m.isSelf && m.replyTo.authorUid === viewerUid.value,
      ),
    }
  }),
)

/**
 * Replies aimed at this member that they have not scrolled past yet.
 *
 * Measured against the read marker rather than against a separate "seen"
 * record, because they are the same fact: a mention you have scrolled past is
 * one you have seen. Oldest first, so tapping the button repeatedly walks
 * forward through them in the order they were said.
 */
const unseenMentions = computed(() =>
  rows.value
    .filter((row, index) => row.mentionsMe && index > seenIndex.value)
    .map((row) => row.message.id),
)

/** Go to the oldest reply the member has not caught up with. */
const jumpToMention = () => {
  const [oldest] = unseenMentions.value
  if (oldest) jumpToMessage(oldest)
}

/** How far along the reply gesture `id` is, as 0–1. Drives the arrow behind it. */
const swipeProgress = (id: string) => {
  const dragged = swipe.value
  if (dragged?.id !== id) return 0
  return Math.min(1, dragged.dx / SWIPE_TRIGGER_PX)
}

const swipeOffset = (id: string) => (swipe.value?.id === id ? swipe.value.dx : 0)

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
      <div class="min-w-0">
        <EyebrowLabel v-if="eyebrow">{{ eyebrow }}</EyebrowLabel>
        <h1 class="display-md mt-1.5 mb-1">{{ title }}</h1>
        <p class="muted m-0 text-[13px]">{{ subtitle }}</p>
      </div>

      <!-- The same inbox icon every other top-level screen carries, so Chat
           isn't the one place the bell disappears. The streak/badge pill that
           used to sit beside it is gone everywhere. -->
      <NuxtLink
        to="/notifications"
        class="relative grid size-10.5 shrink-0 place-items-center rounded-full border border-hairline bg-raised text-ink"
        aria-label="Notifications"
      >
        <AppIcon name="bell" :size="18" />
        <span
          v-if="store.unreadNotifications.value"
          class="absolute top-2 right-2 size-2 rounded-full border-[1.5px] border-(--paper-raised) bg-rose-fill"
        />
      </NuxtLink>
    </header>

    <!--
      The thread and the two buttons that float over it, in one positioning
      context. It ends where the composer begins, so `bottom-4` on the stack
      sits just above the field whatever height the composer has grown to — a
      reply strip and a tray of photos both change it.
    -->
    <div class="relative flex min-h-0 flex-1 flex-col">
      <!--
        `overflow-x-clip` is what lets a bubble be dragged.

        A message follows the finger up to 68px to the right, and an outgoing one
        is already against the right margin, so without this the drag widens the
        page and the whole app gets a horizontal scrollbar for the length of the
        gesture. Clipping happens at the padding edge, which is the screen edge,
        so the bubble slides under it the way it does in every other messenger.
      -->
      <div
        ref="scroller"
        data-scroll-keep
        class="scroll-y overflow-x-clip min-h-0 flex-1 px-5 pt-2 pb-4 lg:px-0"
        @scroll.passive="onScroll"
      >
        <!--
          The list carries `justify-end`, not the scroll box.

          On the box itself it looked right while a thread was short, but once the
          messages were taller than the box the overflow went off the *top*, where
          a scroll container has nothing to scroll to. The oldest messages were
          unreachable and a long reply or a photo pushed the composer out of the
          screen. `min-h-full` on the list keeps the short-thread behaviour and
          lets a long one grow downwards, which is the direction that scrolls.

          The gap is the *within a run* gap. Space between runs is a margin on the
          message that starts one, so two people talking are further apart than
          one person talking twice.
        -->
        <div class="flex min-h-full flex-col justify-end gap-0.5">
          <template
            v-for="{
              message: m,
              images,
              files,
              shape,
              time,
              variant,
              startsRun,
              endsRun,
              first,
              mentionsMe,
              startsUnread,
              quoteShape: quoteCorners,
            } in rows"
            :key="m.id"
          >
            <!--
              Where the member came in. Deliberately not a `[data-message]` row:
              the read marker walks the message rows by index, and a band
              sitting among them would put every index after it out by one.
            -->
            <div
              v-if="startsUnread"
              data-unread-band
              class="my-2 flex items-center gap-3"
              role="separator"
              :aria-label="unreadLabel"
            >
              <span class="h-px flex-1 bg-rose-ring" />
              <span
                class="data shrink-0 rounded-pill bg-rose-soft px-2.5 py-1 text-[9.5px] font-bold tracking-[0.5px] text-rose uppercase"
              >
                {{ unreadLabel }}
              </span>
              <span class="h-px flex-1 bg-rose-ring" />
            </div>

            <div
              :data-message="m.id"
              class="relative -mx-5 flex touch-pan-y px-5 select-none lg:mx-0 lg:px-0"
              :class="[m.isSelf && 'justify-end', startsRun && !first && 'mt-3.5']"
              @pointerdown="startPress($event, m.id)"
              @pointermove="movePress"
              @pointerup="endPress($event, m.id)"
              @pointercancel="resetPress"
              @click.capture="swallowClick"
              @contextmenu="onContextMenu($event, m.id)"
            >
              <!--
                The gestures live on the row, which runs the full width of the
                thread, rather than on the bubble.

                A bubble is a small target and most of the line beside it is blank,
                so a double tap aimed at "that message" lands on nothing about half
                the time. The row is the thing a member is pointing at, and it is
                unambiguous: rows are stacked, so every point on the line belongs to
                exactly one message. `touch-pan-y` and `select-none` come with it —
                they have to sit on whatever the finger actually touches.

                The slot below keeps the bubble's own width: the row is full-bleed
                for the sake of the target, and `justify-end` is what still puts an
                outgoing message on the right.
              -->
              <!--
                Where a tap on a quote has landed.

                An overlay rather than a background on the row, for two reasons.
                The row cannot take vertical padding — it is one of two hundred, and
                padding every one of them to give this a margin would push the whole
                thread apart for the sake of something that shows for a second and a
                half. And the row is deliberately full-bleed so the double tap has
                the whole line to land on, which is the wrong shape for a highlight:
                square against both screen edges it reads as a rendering fault. Sat
                on top instead, it can be inset from the edges, rounded, and taller
                than the message, none of which costs the layout anything.

                Painted before the slot and with no z-index of its own, so the
                message stays in front of it: two positioned boxes in one stacking
                context are drawn in document order.
              -->
              <span
                v-if="flashing === m.id"
                class="pointer-events-none absolute inset-x-2 -inset-y-1.5 rounded-2xl bg-rose-ring animate-jump-flash motion-reduce:animate-none"
                aria-hidden="true"
              />

              <div class="relative flex max-w-[82%] lg:max-w-[68%]">
                <!--
                  The arrow the bubble uncovers as it is dragged. Anchored to the
                  slot rather than the row, so it appears beside the bubble on both
                  sides of the thread instead of at the far left of an outgoing one.
                -->
                <span
                  v-if="swipeProgress(m.id) > 0"
                  class="pointer-events-none absolute top-1/2 left-0 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-rose-soft text-rose"
                  :style="{
                    opacity: swipeProgress(m.id),
                    scale: 0.6 + swipeProgress(m.id) * 0.4,
                  }"
                  aria-hidden="true"
                >
                  <AppIcon name="reply" :size="16" :stroke="2.2" />
                </span>

                <div
                  class="flex min-w-0 gap-2"
                  :class="[
                    m.isSelf && 'flex-row-reverse',
                    !swipeOffset(m.id) && 'transition-transform duration-200 ease-out',
                  ]"
                  :style="{ transform: `translateX(${swipeOffset(m.id)}px)` }"
                >
                  <!--
                    The face belongs to the run, not to the message. A continuation
                    keeps its place with a spacer the same width, so a run of bubbles
                    stays in one column instead of stepping left under the avatar.
                  -->
                  <Avatar v-if="!m.isSelf && startsRun" size="xs" class="mt-4">
                    <AvatarImage :src="m.authorAvatarUrl ?? ''" :alt="m.authorName" loading="lazy" />
                    <AvatarFallback>{{ m.authorName.charAt(0).toUpperCase() }}</AvatarFallback>
                  </Avatar>
                  <span v-else-if="!m.isSelf" class="w-7.5 shrink-0" aria-hidden="true" />

                  <div class="flex min-w-0 flex-col gap-1">
                    <span
                      v-if="!m.isSelf && startsRun"
                      class="font-eyebrow text-[8.5px] font-bold uppercase tracking-[0.5px]"
                      :class="m.isCoach ? 'text-orange-text' : 'text-muted'"
                    >
                      {{ m.authorName }}
                    </span>

                    <!-- Photos and files bring their own edges, so the bubble hugs them. -->
                    <!--
                      The callout override stays here rather than on the row, because
                      it is about text: left alone, a long press on a bubble's words
                      raises the system selection menu over the reaction bar. The
                      press itself is handled by the row — see the note up there.
                    -->
                    <Bubble :variant="variant" :align="m.isSelf ? 'end' : 'start'" class="max-w-full">
                      <BubbleContent
                        class="flex flex-col gap-1.5 border-0 text-sm leading-[1.45] shadow-card transition-[transform,box-shadow] duration-150 [-webkit-touch-callout:none]"
                        :class="[
                          shape,
                          m.text || m.replyTo ? 'px-3.5 py-3' : 'p-1.25',
                          pressing === m.id && 'scale-[0.97]',
                          // A ring rather than a second `shadow-*`, which would be
                          // the second box-shadow utility on this element and would
                          // win or lose on stylesheet order. Rings compose.
                          mentionsMe && 'ring-1 ring-rose-ring',
                        ]"
                      >
                        <!--
                          The quote. A snapshot taken when the reply was sent, so it
                          renders whether or not the original is still in the thread
                          — see `ChatReplyRef`. Tapping it jumps there when it is.

                          The negative margins are what make it look seated rather
                          than pasted on. The bubble pads its contents by 14px and
                          rounds at 16px; pulling the quote 6px back out leaves it 8px
                          inside every edge, and 8px of inset under a 16px outer
                          corner wants exactly the 8px radius below — concentric, so
                          the two curves follow each other instead of fighting. It
                          stretches rather than taking `w-full`, which would measure
                          the padding box and ignore the margins pulling it wider.
                        -->
                        <button
                          v-if="m.replyTo"
                          class="-mx-1.5 -mt-1 flex min-w-0 flex-col items-start gap-0.5 self-stretch overflow-hidden border-l-[3px] py-1.5 pr-2.5 pl-2 text-left"
                          :class="[
                            quoteCorners,
                            m.isSelf
                              ? 'border-white/55 bg-white/18'
                              : mentionsMe
                                ? 'border-rose-fill bg-rose-soft'
                                : 'border-rose-fill bg-fill-subtle',
                          ]"
                          @click="jumpToMessage(m.replyTo.messageId)"
                        >
                          <!--
                            The handle, not the name. A member scrolling past needs to
                            see at a glance that this one is aimed at them, and `@You`
                            is the shape every messenger has trained them to look for.
                          -->
                          <span
                            class="text-[11px] font-bold"
                            :class="mentionsMe ? 'text-rose' : 'opacity-85'"
                          >
                            @{{ quoteAuthor(m.replyTo) }}
                          </span>
                          <span class="line-clamp-2 text-[12px] leading-snug opacity-70">
                            {{ replyPreview(m.replyTo) }}
                          </span>
                        </button>

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
                              :src="shot.downloadUrl"
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
                          :href="doc.downloadUrl"
                          :download="doc.name"
                        >
                          <AppIcon name="file" :size="18" :stroke="1.8" />
                          <span class="min-w-0 flex-1 truncate text-[13px] font-semibold">
                            {{ doc.name }}
                          </span>
                          <span class="data shrink-0 text-[10px] opacity-65">
                            {{ formatBytes(doc.bytes) }}
                          </span>
                        </a>

                        <p v-if="m.text" class="m-0 wrap-break-word whitespace-pre-wrap">
                          {{ m.text }}
                        </p>
                      </BubbleContent>

                      <!--
                        The chips hang off the message they were left on, so
                        they sit against the bubble rather than under the time.
                        They toggle too, so taking a reaction back is one tap.
                      -->
                      <BubbleReactions
                        v-if="m.reactions?.length"
                        :align="m.isSelf ? 'end' : 'start'"
                        class="static translate-y-0 flex-wrap gap-1.5 rounded-none bg-transparent p-0 ring-0"
                        :class="m.isSelf ? 'self-end' : 'self-start'"
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
                      </BubbleReactions>

                      <!-- One time per run, closing it out under everything else. -->
                      <span
                        v-if="endsRun"
                        class="data text-[9px] text-muted"
                        :class="m.isSelf ? 'self-start' : 'self-end'"
                      >
                        {{ time }}
                      </span>
                    </Bubble>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!--
            Who is composing, at the end of the thread rather than in the header.

            The coach DM hides the header entirely, so a header indicator would
            only ever appear on one of the two screens this component serves. At
            the end of the list it also sits exactly where the message it is
            promising will land, which is where the eye already is. `pl-9.5` is
            the avatar column plus its gap, so it lines up with the incoming
            bubbles rather than floating left of them.

            `role="status"` sits on the row and the dots are hidden from it: the
            sentence is the announcement, and three decorative circles announced
            alongside it would be three more things to listen to.
          -->
          <div
            v-if="typingLine"
            class="mt-3.5 flex items-center gap-2 pl-9.5"
            role="status"
          >
            <span
              class="flex items-center gap-1 rounded-2xl rounded-tl-[4px] bg-raised px-3 py-2.5 text-ink shadow-card"
              aria-hidden="true"
            >
              <!--
                One animation, three delays. The dots carry their own opacity in
                the keyframes, so the colour here is full ink and the wave is what
                dims them — a flat muted grey plus a fading animation reads as a
                rendering fault rather than as motion.
              -->
              <span
                v-for="dot in 3"
                :key="dot"
                class="size-1.5 rounded-full bg-current animate-typing-dot motion-reduce:animate-none motion-reduce:opacity-60"
                :style="{ animationDelay: `${(dot - 1) * 160}ms` }"
              />
            </span>
            <span class="text-[11px] text-muted">{{ typingLine }}</span>
          </div>
        </div>
      </div>

      <!--
        Two ways back into the conversation, stacked above the composer.

        Both are absent rather than dimmed when they have nothing to say: a
        permanent jump button on a thread already at its newest message is a
        control that does nothing, and a permanent `@` is a promise of a reply
        that is not there. The wrapper ignores pointers so the empty space
        around them is still thread, and the buttons take them back.
      -->
      <div
        class="pointer-events-none absolute right-5 bottom-4 z-20 flex flex-col items-end gap-2 lg:right-0"
      >
        <button
          v-if="unseenMentions.length"
          class="pointer-events-auto relative grid size-10 place-items-center rounded-full bg-raised text-rose shadow-raised transition-transform duration-100 ease-out active:scale-90"
          :aria-label="`Go to the ${unseenMentions.length} reply that mentions you`"
          @click="jumpToMention"
        >
          <span class="text-[17px] leading-none font-bold">@</span>
          <span
            class="data absolute -top-1 -right-1 grid h-4.5 min-w-4.5 place-items-center rounded-pill bg-rose-fill px-1 text-[10px] font-bold text-on-rose"
          >
            {{ unseenMentions.length }}
          </span>
        </button>

        <button
          v-if="!atBottom"
          class="pointer-events-auto relative grid size-10 place-items-center rounded-full bg-raised text-ink shadow-raised transition-transform duration-100 ease-out active:scale-90"
          :aria-label="
            newBelow ? `Go to the ${newBelow} newest messages` : 'Go to the latest message'
          "
          @click="scrollToEnd(true)"
        >
          <AppIcon name="chevronDown" :size="20" :stroke="2.2" />
          <span
            v-if="newBelow"
            class="data absolute -top-1 -right-1 grid h-4.5 min-w-4.5 place-items-center rounded-pill bg-rose-fill px-1 text-[10px] font-bold text-on-rose"
          >
            {{ newBelow }}
          </span>
        </button>
      </div>
    </div>

    <div
      class="chat__composer flex shrink-0 flex-col gap-2 px-5 pt-3 pb-[calc(16px+var(--tabbar-gutter))] lg:px-0"
    >
      <p v-if="reading" class="m-0 text-xs text-muted">Adding to your message…</p>
      <p v-else-if="sending" class="m-0 text-xs text-muted">Uploading and sending…</p>
      <p v-else-if="sendError" class="m-0 text-xs text-rose">{{ sendError }}</p>
      <p v-else-if="attachError" class="m-0 text-xs text-rose">{{ attachError }}</p>
      <p v-else-if="storageFull" class="m-0 text-xs text-orange-text">
        This device is out of space. Anything you send now will be gone after a
        reload, so clear a few progress photos to make room.
      </p>

      <!--
        What is being answered, above the field it will be answered in. The
        accent bar is the same one the sent quote carries, so the strip and the
        bubble it becomes are recognisably the same thing.
      -->
      <div
        v-if="replyingTo"
        class="flex items-center gap-2.5 rounded-xl border-l-[3px] border-rose-fill bg-raised py-2 pr-1.5 pl-3 shadow-card"
      >
        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="text-[11px] font-bold text-rose">
            Replying to {{ replyingTo.isSelf ? 'yourself' : `@${replyingTo.authorName}` }}
          </span>
          <span class="truncate text-[12px] text-muted">
            {{ replyPreview(replyRefFor(replyingTo)) }}
          </span>
        </div>
        <img
          v-if="replyingTo.attachments?.[0]?.kind === 'image'"
          :src="replyingTo.attachments[0].downloadUrl"
          :alt="replyingTo.attachments[0].name"
          class="size-9 shrink-0 rounded-lg object-cover"
          decoding="async"
        />
        <button
          class="grid size-8 shrink-0 place-items-center rounded-full text-muted"
          aria-label="Cancel reply"
          @click="cancelReply"
        >
          <AppIcon name="close" :size="14" :stroke="2.4" />
        </button>
      </div>

      <div
        v-if="pending.length"
        class="flex gap-2.5 overflow-x-auto px-1 pt-1.5 pb-0.5 scrollbar-none [&::-webkit-scrollbar]:hidden"
      >
        <div v-for="item in pending" :key="item.id" class="relative shrink-0">
          <img
            v-if="item.previewUrl"
            :src="item.previewUrl"
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
              {{ formatBytes(item.bytes) }}
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
            ref="composer"
            v-model="draft"
            class="h-full min-w-0 flex-1 border-none bg-transparent text-sm text-ink outline-none"
            :placeholder="replyingTo ? 'Write your reply…' : placeholder"
            @keyup.enter="submit"
            @keyup.esc="cancelReply"
          />
          <button
            :class="TOOL"
            aria-label="Attach a file"
            :disabled="reading || sending || roomLeft <= 0"
            @click="openPicker(attachInput)"
          >
            <AppIcon name="paperclip" :size="19" :stroke="1.9" />
          </button>
          <button
            :class="TOOL"
            aria-label="Take a photo"
            :disabled="reading || sending || roomLeft <= 0"
            @click="openPicker(cameraInput)"
          >
            <AppIcon name="camera" :size="19" />
          </button>
        </div>

        <!-- Disabled while a send is in flight, not just dimmed: an upload
             takes long enough on a phone that a second tap is the natural
             thing to do, and it would send the same photos twice. -->
        <button
          class="grid size-12 shrink-0 place-items-center rounded-full bg-rose-fill text-on-rose transition-[transform,opacity,background-color] duration-100 ease-out active:scale-[0.94] motion-reduce:transition-none motion-reduce:active:scale-100"
          :class="!canSend && 'opacity-45'"
          :disabled="!canSend"
          aria-label="Send"
          @click="submit"
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
          aria-label="Message actions"
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

          <span class="mx-1 h-6 w-px shrink-0 bg-hairline" aria-hidden="true" />

          <button
            class="grid size-9 place-items-center rounded-full text-muted transition-colors duration-150 hover:bg-rose-soft hover:text-rose"
            role="menuitem"
            aria-label="Reply to this message"
            @click="replyFromPicker"
          >
            <AppIcon name="reply" :size="18" :stroke="2" />
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
          :src="viewing.downloadUrl"
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
