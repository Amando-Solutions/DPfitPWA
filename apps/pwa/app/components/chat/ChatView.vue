<script setup lang="ts">
import { Bubble, BubbleContent, BubbleReactions } from '~/components/ui/bubble'
import type {
  ChatAttachment,
  ChatDelivery,
  ChatMention,
  ChatMessageView,
  ChatReplyRef,
  TypingPeer,
} from '~/data/types'
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
  activeMention,
  applyMention,
  canEditMessage,
  continuesRun,
  matchMentions,
  mentionSegments,
  mentionsInText,
  replyPreview,
  replyRefFor,
  typingLabel,
  type MentionCandidate,
} from '~/lib/chat'
import { storage } from '~/lib/storage'
import { formatTime, trustedNow } from '~/lib/time'

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
     * Who can be named with an `@`, if anyone.
     *
     * Empty turns the feature off, which is what a thread with two people in it
     * wants: mentioning the only other person in a direct message is noise. The
     * roster is passed in rather than read here because who is mentionable is a
     * fact about the thread — this component renders whatever conversation it
     * is handed and does not know that one of them has a cohort behind it.
     */
    mentionable?: MentionCandidate[]
    /**
     * Whether `messages` has come from the live thread yet.
     *
     * `false` while the screen is showing the copy it restored from disk — see
     * `readThreadCache`. That copy exists to be looked at immediately and is
     * nothing more: it is the tail of the thread as of the last visit, so it
     * can be missing messages at both ends, and the marker of what the member
     * has read must not be moved against it. Everything that decides where the
     * thread opens, and what counts as unread in it, waits for this.
     */
    live?: boolean
    /**
     * A message to open on, instead of wherever the member left off.
     *
     * Set when the member arrives from a notification: they tapped a mention or
     * a reply, and the thing they came to see is that message, not the unread
     * band. Best effort, like tapping a quote: a message older than the loaded
     * window has no row to land on, and the thread opens as it normally would.
     */
    focusMessage?: string
    /**
     * Send the composer's contents, and let go of them.
     *
     * This used to be awaited, so a refused upload could hand the member their
     * text and their four photos back in the composer. That made the composer
     * the place a send's fate was told, which it cannot be offline: an upload
     * with no network behind it takes ten minutes to give up, and the field sat
     * locked for all of them. The screen behind this puts the message in the
     * thread at once — see `useChatOutbox` — and whatever happens to it
     * afterwards is drawn on its bubble: a clock, a tick, or "Not sent" with a
     * way to try again. So the composer's part ends when it hands over.
     */
    send: (payload: {
      text: string
      attachments: PendingAttachment[]
      replyTo: ChatReplyRef | null
      mentions: ChatMention[]
    }) => void
    /**
     * Rewrite a message this member already sent. Awaited for the reason `send`
     * is: the thread is the only place a refusal can be shown, and the member
     * has to get their correction back if it does not land.
     *
     * Optional, and the hold menu offers editing only when it is here — a
     * thread mounted without it is one nobody can rewrite, which is a decision
     * the screen mounting it gets to make rather than one hidden in here.
     */
    edit?: (payload: {
      messageId: string
      text: string
      mentions: ChatMention[]
    }) => Promise<void>
  }>(),
  {
    placeholder: 'Say something…',
    storageFull: false,
    live: false,
    focusMessage: '',
    typing: () => [],
    mentionable: () => [],
  },
)

const emit = defineEmits<{
  (e: 'react', payload: { messageId: string; emoji: string }): void
  /**
   * Whether the member is composing. Fired on the edges rather than on every
   * keystroke — on the first character, every few seconds while they keep
   * going, and once when they stop — because the handler behind it is a write.
   */
  (e: 'typing', typing: boolean): void
  /**
   * The read marker just moved past these messages, and each was aimed at the
   * member — see `MessageDoc.addressedUids`. Ids, oldest first.
   *
   * What lets reading a mention in the thread clear it from the inbox. An emit
   * rather than a store call, because whether a thread has an inbox behind it
   * is the screen's to know, not this component's.
   */
  (e: 'seen', messageIds: string[]): void
  /** Send a message that failed again. See `ChatDelivery`. */
  (e: 'retry', messageId: string): void
  /** Throw away a message that failed rather than send it. */
  (e: 'discard', messageId: string): void
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

/** The browser's word on the network, for the line above the composer. */
const online = useOnline()

/**
 * Whether a message exists on the server yet, which is what everything a hold
 * or a swipe does is attached to.
 *
 * A reaction is a write against the message's document, an edit rewrites it,
 * and a reply quotes it for everybody else to tap through to. None of those has
 * anything to land on while the message is still on its way, or never got
 * there — so until it has a tick, it has no hold menu and no reply gesture,
 * the same as a message with a clock on it in WhatsApp.
 */
const onServer = (id: string) => {
  const delivery = props.messages.find((m) => m.id === id)?.delivery
  return !delivery || delivery === 'sent'
}

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
  if (!target || !onServer(id)) return
  // One strip above the field, one draft in it, so a reply ends an edit — and
  // `cancelEdit` puts back the draft the edit stashed, which is very often the
  // message the member was about to reply with anyway.
  cancelEdit()
  replyingTo.value = target
  navigator.vibrate?.(8)
  // Focusing raises the keyboard, which is the point: a reply that needs a
  // second tap on the field is slower than not having the gesture at all.
  nextTick(() => composer.value?.focus())
}

const cancelReply = () => {
  replyingTo.value = null
}

// --- Editing ---------------------------------------------------------------
/**
 * The sent message the composer is rewriting, or `null` when it is writing a
 * new one. The whole message, like `replyingTo`, so the strip can show it and
 * `submitEdit` can tell a real correction from a member who changed nothing.
 */
const editing = ref<ChatMessageView | null>(null)

/**
 * The draft that was in the composer when the edit started.
 *
 * Stashed rather than dropped. Noticing a typo in the message you just sent,
 * while halfway through the next one, is precisely when this feature gets used;
 * losing the half-written message in order to fix the sent one would be a bad
 * trade to make silently.
 */
const beforeEdit = ref('')

/** The stashed draft's mentions, kept beside it and restored with it. */
const beforeEditMentions = ref<ChatMention[]>([])

const startEdit = (id: string) => {
  const target = props.messages.find((m) => m.id === id)
  if (!target) return
  // Only on the way in. Editing a second message without leaving the first
  // must not stash the first message's text as "the draft to go back to".
  if (!editing.value) {
    beforeEdit.value = draft.value
    beforeEditMentions.value = draftMentions.value
  }
  editing.value = target
  replyingTo.value = null
  draft.value = target.text
  // The message's own mentions become the draft's, so editing the words around
  // a name keeps it a reference rather than quietly demoting it to plain text.
  draftMentions.value = [...(target.mentions ?? [])]
  navigator.vibrate?.(8)
  nextTick(() => composer.value?.focus())
}

const cancelEdit = () => {
  if (!editing.value) return
  editing.value = null
  draft.value = beforeEdit.value
  draftMentions.value = beforeEditMentions.value
  beforeEdit.value = ''
  beforeEditMentions.value = []
}

/**
 * Esc backs out of one thing at a time, innermost first: the name list if it is
 * up, then whichever message the composer is attached to. Closing the list and
 * abandoning the edit it was opened inside would be two undos for one press.
 */
const onEscape = () => {
  if (mentionsOpen.value) {
    mentionsClosed.value = true
    return
  }
  if (editing.value) cancelEdit()
  else cancelReply()
}

// --- Mentions --------------------------------------------------------------
/**
 * Who the draft currently claims to name.
 *
 * Collected as they are picked and never pruned here, because a member who
 * backspaces through half a name has not necessarily finished editing it.
 * `mentionsInText` settles it against the text at the moment it is sent, which
 * is the only moment the two are certainly in step.
 */
const draftMentions = ref<ChatMention[]>([])

/**
 * The draft in runs, for the tinted copy of it drawn behind the field.
 *
 * An `<input>` paints its value in one colour and nothing can change that for
 * part of it, so a picked name is coloured by drawing the text twice: this copy
 * underneath with the names in the accent, and the field on top with its own
 * text made transparent, so only its caret and selection show.
 *
 * `null` whenever nothing in the draft is a picked name, and that is doing real
 * work. The field only hides its text while this is set, so a draft with no
 * mention in it — which is almost every draft — is drawn by the input exactly
 * as it always was, placeholder and selection and all, and the copy only has
 * to line up while there is something in it to colour.
 */
const draftRuns = computed(() => {
  if (!draftMentions.value.length) return null
  const runs = mentionSegments(draft.value, draftMentions.value)
  return runs.some((run) => run.mention) ? runs : null
})

/**
 * How far the field has scrolled its own text sideways, in pixels.
 *
 * A single-line input that is fuller than it is wide scrolls its contents to
 * keep the caret in view, and the copy behind it has no idea. Without following
 * this, the coloured name stays where it was typed while the real text slides
 * left over it, and the two stop agreeing on where anything is.
 */
const fieldScroll = ref(0)

const syncFieldScroll = () => {
  fieldScroll.value = composer.value?.scrollLeft ?? 0
}

// Anything that rewrites the draft from code — a mention chosen, an edit
// started, a send clearing the field — moves the text without an event from
// the field to say so.
watch(draft, () => {
  nextTick(syncFieldScroll)
})

/**
 * Where the caret is, tracked because `v-model` does not report it.
 *
 * An `@` only opens the picker for the token the caret is *in*, so this has to
 * follow clicks and arrow keys as well as typing — otherwise moving back into
 * an earlier word and typing would filter a list against the wrong one.
 */
const caret = ref(0)

/** Closed by hand, until the next keystroke. Escape has to mean something. */
const mentionsClosed = ref(false)

const mentionToken = computed(() =>
  props.mentionable.length ? activeMention(draft.value, caret.value) : null,
)

const mentionMatches = computed(() => {
  const token = mentionToken.value
  if (!token) return []
  return matchMentions(props.mentionable, token.query)
})

const mentionsOpen = computed(() => !mentionsClosed.value && mentionMatches.value.length > 0)

/** Which row Enter would take. Reset whenever the list underneath it changes. */
const mentionIndex = ref(0)
watch(mentionMatches, () => {
  mentionIndex.value = 0
})

const trackCaret = (event: Event) => {
  caret.value = (event.target as HTMLInputElement).selectionStart ?? draft.value.length
  // The same events that move the caret are the ones that scroll the field to
  // keep it in view, and not every engine reports that as a `scroll` of its own.
  syncFieldScroll()
}

/**
 * Enter chose from the list on the way down, so the keyup it is followed by is
 * not a send.
 *
 * `preventDefault` on a keydown does not stop the keyup, and sending is bound
 * to the keyup — so without this, picking a name with the keyboard also posted
 * the half-written message it was being picked into.
 */
let enterTookMention = false

/** Typing is what reopens a list that was dismissed. */
const onComposerInput = (event: Event) => {
  mentionsClosed.value = false
  // Cleared here as well as on the keyup it is meant for, so a press that
  // never produced one — the field lost focus mid-chord, the key was held
  // through a re-render — cannot swallow the *next* Enter instead.
  enterTookMention = false
  trackCaret(event)
}

const chooseMention = (person: MentionCandidate) => {
  const token = mentionToken.value
  if (!token) return

  const next = applyMention(draft.value, token.at, token.query.length, person.name)
  draft.value = next.text
  if (!draftMentions.value.some((m) => m.uid === person.uid)) {
    draftMentions.value = [...draftMentions.value, { uid: person.uid, name: person.name }]
  }

  // The caret goes back where the member was, which the browser will not do on
  // its own after the value is replaced wholesale — it would land at the end,
  // behind whatever they had already written after the mention.
  nextTick(() => {
    const field = composer.value
    if (!field) return
    field.focus()
    field.setSelectionRange(next.caret, next.caret)
    caret.value = next.caret
    syncFieldScroll()
  })
}

/** The picker's scroller, so a highlight moved by the keyboard can be kept in view. */
const mentionList = ref<HTMLElement | null>(null)

/**
 * Bring the highlighted row into the list's view.
 *
 * Called from the arrow keys only, not from a watcher on the index. A finger
 * resting on a row also moves the highlight, and scrolling the list to meet it
 * in the middle of a swipe would fight the swipe.
 */
const revealMention = () => {
  nextTick(() => {
    mentionList.value
      ?.querySelector<HTMLElement>(`[data-mention-row="${mentionIndex.value}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  })
}

const onComposerKeydown = (event: KeyboardEvent) => {
  if (!mentionsOpen.value) return
  const matches = mentionMatches.value

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    mentionIndex.value = (mentionIndex.value + 1) % matches.length
    revealMention()
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    mentionIndex.value = (mentionIndex.value - 1 + matches.length) % matches.length
    revealMention()
    return
  }
  if (event.key === 'Enter' || event.key === 'Tab') {
    event.preventDefault()
    enterTookMention = event.key === 'Enter'
    const picked = matches[mentionIndex.value]
    if (picked) chooseMention(picked)
  }
}

const onComposerEnter = () => {
  if (enterTookMention) {
    enterTookMention = false
    return
  }
  submit()
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

const jumpToMessage = async (messageId: string, smooth = true) => {
  const target = scroller.value?.querySelector<HTMLElement>(
    `[data-message="${CSS.escape(messageId)}"]`,
  )
  if (!target) return
  // Smooth for a tap inside the thread, where watching it travel says where the
  // message was. Not when the screen opens on it: there is no "from" to show.
  target.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' })

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

/** The edit button, on the messages that still have one. Widens the bar. */
const EDIT_BUTTON_PX = 36

const BAR_HEIGHT = 46

/**
 * The message the picker is open against, with the numbers to anchor it to.
 *
 * Plain numbers rather than the DOMRect: a rect read through a reactive proxy
 * throws, because its getters need the real object as `this`.
 */
const reacting = ref<{
  id: string
  top: number
  bottom: number
  left: number
  /** Whether this message is still the member's to rewrite. Settled on open. */
  canEdit: boolean
} | null>(null)

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
  // After the reset rather than before it, so a click left armed by some other
  // message's gesture cannot swallow "Try again" on this one.
  if (!onServer(id)) return

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
  if (!onServer(id)) return
  const box = bubble.getBoundingClientRect()
  const message = props.messages.find((m) => m.id === id)

  // Settled here, once, rather than by a timer re-testing every message on
  // screen against a deadline that moves for each of them. The menu is open for
  // seconds; the window is a quarter of an hour. Holding it open until the
  // window shuts offers an edit that `editMessage` then refuses in words —
  // which is the right way round, because the member finds out by trying rather
  // than by watching a button disappear under their thumb.
  //
  // `trustedNow`, not `Date.now`: the window is not the device's to extend.
  const canEdit =
    Boolean(props.edit) && !!message && canEditMessage(message, trustedNow().getTime())

  reacting.value = { id, top: box.top, bottom: box.bottom, left: box.left, canEdit }
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
  const width = BAR_WIDTH + (anchor.canEdit ? EDIT_BUTTON_PX : 0)
  const left = Math.min(Math.max(8, anchor.left), window.innerWidth - width - 8)
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

/**
 * Edit from the hold menu, which is the only way in — as it is in WhatsApp.
 *
 * No gesture for this one, deliberately. A swipe and a double tap are worth
 * spending on reply and react, which happen constantly and are trivially
 * undone; rewriting what you already said is rarer and is not undoable, and is
 * worth the two deliberate taps it costs here.
 */
const editFromPicker = () => {
  const id = reacting.value?.id
  reacting.value = null
  if (id) startEdit(id)
}

// A hold that scrolls out of view would leave the bar floating over nothing.
const closePicker = () => (reacting.value = null)

// --- Sending ---------------------------------------------------------------
/**
 * Why the last edit did not go, in the member's words.
 *
 * Edits only. A send that fails says so on its own bubble, where the message
 * is — see `submit` — so this line is left to the one write that still has its
 * words back in the composer when it is refused.
 */
const sendError = ref('')

/**
 * An edit has to have words in it, and that is the whole difference.
 *
 * Photos cannot rescue an empty one the way they can an empty send: emptying a
 * message down to nothing is a delete wearing an edit's clothes, and this is
 * not the control for that.
 */
const canSend = computed(() =>
  editing.value
    ? Boolean(draft.value.trim())
    : Boolean(draft.value.trim() || pending.value.length),
)

/**
 * What went wrong, in the member's words.
 *
 * The write throws sentences written to be read, so one is shown as-is. The
 * cause still goes to the console: what a member needs to read and what
 * whoever configured the project needs to read are rarely the same.
 */
const reportFailure = (cause: unknown) => {
  console.error('[chat] edit failed', cause)
  sendError.value = cause instanceof Error ? cause.message : 'Could not save that. Try again.'
}

/**
 * Save a correction.
 *
 * The composer is cleared before the write is acknowledged, like a text send
 * and for the same reason: the screen above already shows the new words — the
 * page applies them the moment it is asked — so leaving them in the box too
 * would just be a second copy of the message, sitting under the first.
 *
 * Everything needed to undo that is captured first, so a refusal — the window
 * having closed while they typed, a connection that was not there — puts the
 * member back exactly where they were, correction and all, rather than
 * discarding the words and leaving the old ones standing.
 */
const submitEdit = () => {
  const target = editing.value
  if (!target || !props.edit) return

  const next = draft.value.trim()
  // Unchanged is not an edit. Writing it anyway would hang "Edited" on a
  // message nobody edited, which is the one thing that label must never say.
  if (next === target.text) return cancelEdit()

  const mentions = mentionsInText(next, draftMentions.value)
  const stashed = beforeEdit.value
  const stashedMentions = beforeEditMentions.value
  editing.value = null
  beforeEdit.value = ''
  beforeEditMentions.value = []
  draft.value = ''
  draftMentions.value = []
  sendError.value = ''
  stopTyping()

  props.edit({ messageId: target.id, text: next, mentions }).catch((cause) => {
    reportFailure(cause)
    // Unless they have started something else in the meantime, in which case
    // what they are writing now matters more than the edit they watched fail.
    if (draft.value || editing.value || replyingTo.value) return
    editing.value = target
    beforeEdit.value = stashed
    beforeEditMentions.value = stashedMentions
    draft.value = next
    draftMentions.value = mentions
  })
}

/**
 * Send, and clear the composer for the next one — photos or not.
 *
 * The message is in the thread by the time this returns, with a clock on it.
 * Text is drawn by the data source's own pending write, photos by the local
 * copies the composer already decoded, and from there the bubble is what says
 * how it went: a tick when the server has it, "Not sent" with a way to try
 * again when it will not get there on its own. See `useChatOutbox`.
 *
 * Which is why nothing here waits, and nothing is put back. Offline, the write
 * behind a text message does not resolve until the connection returns, and an
 * upload takes ten minutes to give up; a composer that waited on either sat
 * full and locked for that long over a message that was, as far as the member
 * could see, already sent. And a failure that pushed the words back into the
 * field took them off the screen and out of the order they were said in,
 * which reads as the app having lost them.
 */
const submit = () => {
  if (!canSend.value) return
  if (editing.value) return submitEdit()

  const text = draft.value.trim()
  const answering = replyingTo.value
  // Settled against the text rather than sent as collected: a name that was
  // picked and then deleted is not a mention, and the document should not carry
  // a reference to somebody the message no longer names.
  const mentions = mentionsInText(text, draftMentions.value)
  const payload = {
    text,
    attachments: pending.value.map((item) => item.attachment),
    replyTo: answering ? replyRefFor(answering) : null,
    mentions,
  }

  // `stopTyping` is called outright rather than left to the watcher on
  // `draft`, which would not run until the next tick: pressing send is the
  // clearest statement there is that the typing is over.
  draft.value = ''
  draftMentions.value = []
  pending.value = []
  replyingTo.value = null
  attachError.value = ''
  sendError.value = ''
  stopTyping()

  props.send(payload)
  scrollToEnd()
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
 * Whether the thread has been put where it opens.
 *
 * Both jump buttons wait for this. Until `restorePlace` has decided where the
 * member is, the numbers they read are placeholders: `seenIndex` is still `-1`,
 * so every mention in the thread counts as unseen, and `atBottom` flips with
 * every scroll event a thread still being rendered and positioned throws off.
 * Rendering off those showed an `@` and a down arrow for a moment on every
 * open, then took them away again once the real answer landed — two controls
 * announcing things that were not true. Set once, and never unset: after the
 * first placement those values mean what they say.
 */
const settled = ref(false)

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
  // Nothing on screen is being read yet: this is the copy restored from disk,
  // and its positions are not the live thread's. An index taken against sixty
  // cached messages means something else entirely once two hundred arrive, and
  // the marker it would save is the one the tab's unread dot is read off. Both
  // wait, like everything else that depends on the thread being the thread.
  if (!props.live) return

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
 *
 * Watched as the array rather than its length, because the length stopped
 * meaning anything once the thread could fill up. It is the last 200 messages,
 * so every arrival in a full thread pushes the oldest off the top and the
 * count stays exactly where it was: keyed on the length, a busy cohort's chat
 * simply stopped following the conversation. The array also carries every
 * clock turning into a tick and every reaction, so what decides whether
 * anything *arrived* is `arrivalsSince`, not the fact that this ran.
 */
let placeRestored = false

/**
 * How many messages have landed at the end of the thread since `before`.
 *
 * Counted from wherever the old newest message sits now, which is the same
 * answer whether or not anything fell off the top to make room. When that
 * message is gone — the member deleted a failed one at the end — it falls back
 * to the change in length, which is negative for exactly that case and so
 * counts nothing.
 */
const arrivalsSince = (before: ChatMessageView[], next: ChatMessageView[]) => {
  const newest = before.at(-1)
  if (!newest) return next.length
  const at = next.findIndex((m) => m.id === newest.id)
  if (at < 0) return Math.max(0, next.length - before.length)
  return next.length - 1 - at
}

/**
 * Keep the read marker on the message it marks, not the position it was at.
 *
 * `seenIndex` is a position, and a full thread moves every message up one
 * each time something arrives. Left alone the marker would slide down onto a
 * message nobody has read — one more for every arrival — and leaving the screen
 * writes that down as where the member got to, which is what the tab's dot and
 * the unread band are both read from.
 *
 * Walks back to the nearest message still here when the marked one is not: a
 * failed message that was deleted, or one old enough to have fallen off the
 * top.
 */
const reanchorSeen = (before: ChatMessageView[], next: ChatMessageView[]) => {
  const index = seenIndex.value
  if (index < 0 || before[index]?.id === next[index]?.id) return
  for (let i = index; i >= 0; i -= 1) {
    const id = before[i]?.id
    const at = id ? next.findIndex((m) => m.id === id) : -1
    if (at >= 0) {
      seenIndex.value = at
      return
    }
  }
  seenIndex.value = -1
}

watch(
  [() => props.messages, () => props.live],
  ([next, live], previous) => {
    if (!live) {
      // The restored copy gets the placeholder treatment: sit at the newest
      // message in it, which is where a chat opens, and do nothing else.
      // Finding the member's actual place means deciding what they have not
      // read and writing that decision down — see `openAtEnd` — and neither
      // belongs to a thread that is missing however much of itself was never
      // cached.
      if (next.length) scrollToEnd()
      return
    }

    // The first live delivery is the thread arriving, whatever was on screen
    // before it. Nothing is counted here: the messages it fills in above the
    // restored tail are older than everything the member has seen, and
    // treating the difference as arrivals would put a "140 new" button on a
    // conversation where nothing had happened at all.
    if (!placeRestored && next.length) {
      placeRestored = true
      // `finally`, so a placement that throws still lets the buttons work
      // rather than hiding them for the rest of the visit.
      restorePlace()
        // After the member's place is found rather than instead of it: the band
        // still belongs where they left off, and scrolling back up to it from
        // the message they came for is how they catch up on the rest.
        .then(() => {
          if (props.focusMessage) return jumpToMessage(props.focusMessage, false)
        })
        .finally(() => {
          settled.value = true
        })
      return
    }

    // `immediate` runs this once before anything has arrived, where there is no
    // previous thread at all. Empty is the honest reading of that.
    const before = previous?.[0] ?? []
    reanchorSeen(before, next)

    // Nothing new at the end — a tick, a reaction, an edit, or a failed
    // message deleted — says nothing about where the member wants to be.
    const arrived = arrivalsSince(before, next)
    if (!arrived) return

    if (!atEnd()) {
      newBelow.value += arrived
      atBottom.value = false
      return
    }
    // The marker is moved here as well as by the scroll it causes, because in
    // a full thread there may be no scroll: the message that fell off the top
    // can be as tall as the one that arrived, and then `scrollTop` is already
    // where it is being set to and no event fires. The member is looking at
    // the new message either way, and the tab's dot is read off this.
    void scrollToEnd().then(trackSeen)
  },
  { immediate: true },
)

// A notification tapped while the thread is already placed. The first one is
// handled by the placement above, which has to wait for the thread to arrive.
watch(
  () => props.focusMessage,
  (id) => {
    if (id && settled.value) jumpToMessage(id, false)
  },
)

/**
 * Tell the screen which messages aimed at the member have just been read.
 *
 * Off `seenIndex`, which only ever moves down, so each message is reported
 * once per visit however the member scrolls. `addressedUids` rather than the
 * `mentionsMe` the bubbles are lit by: that one is worked out from `mentions`
 * and `replyTo`, and is also true of messages sent before the field existed,
 * which never reached anybody's inbox and have nothing there to clear.
 */
watch(seenIndex, (next, previous) => {
  if (next <= previous) return
  const uid = viewerUid.value
  const ids = props.messages
    .slice(previous + 1, next + 1)
    .filter((m) => !m.isSelf && m.addressedUids?.includes(uid))
    .map((m) => m.id)
  if (ids.length) emit('seen', ids)
})

// The reply strip changes the composer's height, so the last bubble would end
// up behind it on a thread that was sitting exactly at the bottom. The typing
// indicator is a row at the end of the thread and does the same.
watch(replyingTo, (target) => {
  if (target && atEnd()) scrollToEnd()
})

watch(editing, (target) => {
  if (target && atEnd()) scrollToEnd()
})

watch(typingLine, (line) => {
  if (line && atEnd()) scrollToEnd()
})

// A send that fails grows its row without adding one — the run breaks above
// it and "Not sent" takes the place of the time — so a thread sitting at the
// bottom would leave the one line the member now has to act on just under the
// composer, out of sight.
watch(
  () => props.messages.reduce((count, m) => count + (m.delivery === 'failed' ? 1 : 0), 0),
  (failed, before) => {
    if (failed > before && atEnd()) scrollToEnd()
  },
)

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
 *
 * The tick goes beside that time, on the same reasoning, and is the run's
 * rather than the last message's: a clock if anything in the run is still on
 * its way, a tick once all of it is there. Four ticks down one side of a run
 * would be four copies of one fact; one tick over a run whose first message
 * is still uploading would be a claim that is not true yet. A message that
 * *failed* never shares a run — see `continuesRun` — so it has the line to
 * itself.
 */
const rows = computed(() => {
  /** Whether the run being walked has anything in it still sending. */
  let runSending = false

  return props.messages.map((m, index) => {
    const attachments = m.attachments ?? []
    const next = props.messages[index + 1]
    const startsRun = !continuesRun(m, props.messages[index - 1])
    const endsRun = !next || !continuesRun(next, m)
    const delivery: ChatDelivery = m.isSelf ? (m.delivery ?? 'sent') : 'sent'
    if (startsRun) runSending = false
    if (delivery === 'sending') runSending = true
    const mentions = m.mentions ?? []
    // Answered by name, and named with an `@`, are two different facts about
    // one message and are needed separately: the first is what colours the
    // *quote*, and only a reply has one of those.
    const repliesToMe = Boolean(
      m.replyTo && !m.isSelf && m.replyTo.authorUid === viewerUid.value,
    )
    const namesMe =
      !m.isSelf && mentions.some((mention) => mention.uid === viewerUid.value)
    return {
      message: m,
      images: attachments.filter((a) => a.kind === 'image'),
      files: attachments.filter((a) => a.kind !== 'image'),
      startsRun,
      endsRun,
      /** This message on its own. Drives the veil over photos still going up. */
      delivery,
      /**
       * What the run's closing line says about the member's own run, or
       * `null` for anybody else's and for every bubble but the last.
       */
      status: m.isSelf && endsRun ? (runSending ? 'sending' : delivery) : null,
      first: index === 0,
      /** This message opens the unread run, so the band is drawn above it. */
      startsUnread: index === unreadFrom.value,
      shape: bubbleShape(m, startsRun),
      quoteShape: quoteShape(m, startsRun),
      variant: bubbleVariant(m),
      time: formatTime(m.sentAt),
      authorLabel: m.isCoach ? 'Coach' : m.authorName,
      /**
       * Somebody else has answered this member. Colours the quote, which is
       * the half that says `@You`, so it only means anything on a reply.
       */
      repliesToMe,
      /**
       * This message is aimed at the member: answered, or named with an `@`.
       *
       * What makes the bubble itself catch the eye on the way past, and what
       * the jump button counts — being addressed in a thread of forty people
       * is easy to scroll straight through. Never set on their own messages,
       * whichever way it happened: they know.
       */
      mentionsMe: repliesToMe || namesMe,
      /**
       * The text split into plain runs and named ones, ready to render.
       *
       * Here rather than in the template so it is computed once per delivery
       * rather than on every re-render of a screen that re-renders whenever
       * anybody starts typing. See `mentionSegments`.
       */
      runs: mentionSegments(m.text, mentions),
    }
  })
})

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
  'grid size-9 shrink-0 place-items-center rounded-full text-muted transition-colors duration-150 not-disabled:hover:bg-primary-soft not-disabled:hover:text-primary disabled:cursor-default disabled:opacity-40'
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
          class="absolute top-2 right-2 size-2 rounded-full border-[1.5px] border-(--paper-raised) bg-primary-fill"
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
              repliesToMe,
              runs,
              startsUnread,
              quoteShape: quoteCorners,
              authorLabel,
              delivery,
              status,
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
              <span class="h-px flex-1 bg-primary-ring" />
              <span
                class="shrink-0 rounded-pill bg-primary-soft px-2.5 py-1 text-[11.5px] font-semibold text-primary tabular-nums"
              >
                {{ unreadLabel }}
              </span>
              <span class="h-px flex-1 bg-primary-ring" />
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
                class="pointer-events-none absolute inset-x-2 -inset-y-1.5 rounded-2xl bg-primary-ring animate-jump-flash motion-reduce:animate-none"
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
                  class="pointer-events-none absolute top-1/2 left-0 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-primary-soft text-primary"
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
                    <AvatarImage :src="m.authorAvatarUrl ?? ''" :alt="authorLabel" loading="lazy" />
                    <AvatarFallback :class="m.isCoach && 'bg-secondary text-on-secondary'">{{ authorLabel.charAt(0).toUpperCase() }}</AvatarFallback>
                  </Avatar>
                  <span v-else-if="!m.isSelf" class="w-7.5 shrink-0" aria-hidden="true" />

                  <div class="flex min-w-0 flex-col gap-1">
                    <span
                      v-if="!m.isSelf && startsRun"
                      class="text-[11.5px] font-semibold"
                      :class="m.isCoach ? 'text-secondary-ink' : 'text-muted'"
                    >
                      {{ authorLabel }}
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
                          mentionsMe && 'ring-1 ring-primary-ring',
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
                              : repliesToMe
                                ? 'border-primary-fill bg-primary-soft'
                                : 'border-primary-fill bg-fill-subtle',
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
                            :class="repliesToMe ? 'text-primary' : 'opacity-85'"
                          >
                            @{{ quoteAuthor(m.replyTo) }}
                          </span>
                          <span class="line-clamp-2 text-[12px] leading-snug opacity-70">
                            {{ replyPreview(m.replyTo) }}
                          </span>
                        </button>

                        <!--
                          Keyed by position, not by id. A photo being sent is
                          drawn from the copy on the device, and once the live
                          thread has it the same photo arrives again under its
                          storage path. Keyed by that, the swap would be a new
                          element loading a new picture from nothing — a blank
                          tile where the photo just was. By position it is the
                          same `<img>` with a new `src`, which the browser keeps
                          painting until the replacement has decoded. The photos
                          on a message never reorder, so position is stable.
                        -->
                        <div
                          v-if="images.length"
                          class="max-w-58"
                          :class="images.length > 1 ? 'grid grid-cols-2 gap-1' : 'flex'"
                        >
                          <button
                            v-for="(shot, i) in images"
                            :key="i"
                            class="relative block overflow-hidden rounded-xl bg-fill-subtle leading-none"
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
                            <!--
                              Still going up. On the photo rather than only
                              beside the time, because a run can end in a sent
                              message while a photo above it is still uploading,
                              and this is what says which one the clock is for.
                            -->
                            <span
                              v-if="delivery === 'sending'"
                              class="absolute inset-0 grid place-items-center bg-black/30"
                              aria-hidden="true"
                            >
                              <span
                                class="size-6 rounded-full border-2 border-white/35 border-t-white animate-spin motion-reduce:animate-none"
                              />
                            </span>
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
                          <span class="shrink-0 text-[11px] opacity-65 tabular-nums">
                            {{ formatBytes(doc.bytes) }}
                          </span>
                        </a>

                        <!--
                          Rendered in runs rather than as one string, so the
                          names that were picked from the list can be marked.
                          All on one line on purpose: the paragraph keeps its
                          whitespace, so a line break between these spans would
                          be a space that nobody typed. See `mentionSegments`.
                        -->
                        <p
                          v-if="m.text"
                          class="m-0 wrap-break-word whitespace-pre-wrap"
                        ><span
                            v-for="(run, i) in runs"
                            :key="i"
                            :class="
                              run.mention
                                ? m.isSelf
                                  ? 'font-bold underline underline-offset-2'
                                  : 'font-bold text-primary'
                                : ''
                            "
                          >{{ run.text }}</span></p>

                        <!--
                          Inside the bubble rather than out by the time, because
                          the time is drawn once for a whole run and this is
                          true of one message in it. It says that the words
                          above are not the words that were sent, which is the
                          reader's business; when they changed is not, so no
                          date and no history — the same as WhatsApp.
                        -->
                        <span
                          v-if="m.editedAt"
                          class="self-end text-[9px] leading-none opacity-60"
                        >
                          Edited
                        </span>
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
                          :class="r.mine && 'shadow-[0_0_0_1.5px_var(--primary)]'"
                          :aria-pressed="Boolean(r.mine)"
                          :aria-label="`${r.count} reacted ${r.emoji}`"
                          @click="emit('react', { messageId: m.id, emoji: r.emoji })"
                        >
                          {{ r.emoji }} {{ r.count }}
                        </button>
                      </BubbleReactions>

                      <!--
                        A message that did not go, in the place its time would
                        have been. The red mark is WhatsApp's, because it is the
                        one every member already knows means "this did not
                        send"; the two actions sit beside it rather than behind
                        a tap on it, so neither has to be discovered.

                        No time: it was never said, as far as anybody else is
                        concerned, and "Try again" dates it afresh. The reason is
                        there for a screen reader and on hover, not written out —
                        it is nearly always "check your connection", which the
                        mark already says.
                      -->
                      <div
                        v-if="status === 'failed'"
                        class="flex items-center gap-1.5 self-start text-[11px] leading-none"
                        role="status"
                      >
                        <span
                          class="grid size-4 shrink-0 place-items-center rounded-full bg-danger-fill text-[10.5px] font-bold text-on-danger"
                          aria-hidden="true"
                        >!</span>
                        <span class="font-semibold text-danger" :title="m.deliveryError">
                          Not sent<span v-if="m.deliveryError" class="sr-only">. {{ m.deliveryError }}</span>
                        </span>
                        <span class="text-faint" aria-hidden="true">·</span>
                        <!-- Padded out past the text, so the target is a thumb's and not a letter's. -->
                        <button
                          class="-mx-1 -my-2 px-1 py-2 font-semibold text-primary"
                          @click="emit('retry', m.id)"
                        >
                          Try again
                        </button>
                        <span class="text-faint" aria-hidden="true">·</span>
                        <button
                          class="-mx-1 -my-2 px-1 py-2 font-semibold text-muted"
                          @click="emit('discard', m.id)"
                        >
                          Delete
                        </button>
                      </div>

                      <!--
                        One time per run, closing it out under everything else,
                        and on the member's own runs whether it has gone: a clock
                        until the server has all of it, then a tick. See `rows`.
                      -->
                      <span
                        v-else-if="endsRun"
                        class="inline-flex items-center gap-1 text-[10.5px] text-muted tabular-nums"
                        :class="m.isSelf ? 'self-start' : 'self-end'"
                      >
                        {{ time }}
                        <template v-if="status === 'sending'">
                          <AppIcon name="clock" :size="11" :stroke="2.2" />
                          <span class="sr-only">Sending</span>
                        </template>
                        <template v-else-if="status === 'sent'">
                          <AppIcon name="check" :size="12" />
                          <span class="sr-only">Sent</span>
                        </template>
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
        that is not there. Neither appears before `settled`, for the same
        reason: until the thread has been placed, what they would say is not
        true yet. The wrapper ignores pointers so the empty space around them
        is still thread, and the buttons take them back.
      -->
      <div
        class="pointer-events-none absolute right-5 bottom-4 z-20 flex flex-col items-end gap-2 lg:right-0"
      >
        <button
          v-if="settled && unseenMentions.length"
          class="pointer-events-auto relative grid size-10 place-items-center rounded-full bg-raised text-primary shadow-raised transition-transform duration-100 ease-out active:scale-90"
          :aria-label="`Go to the ${unseenMentions.length} reply that mentions you`"
          @click="jumpToMention"
        >
          <span class="text-[17px] leading-none font-bold">@</span>
          <span
            class="absolute -top-1 -right-1 grid h-4.5 min-w-4.5 place-items-center rounded-pill bg-primary-fill px-1 text-[10px] font-bold text-on-primary tabular-nums"
          >
            {{ unseenMentions.length }}
          </span>
        </button>

        <button
          v-if="settled && !atBottom"
          class="pointer-events-auto relative grid size-10 place-items-center rounded-full bg-raised text-ink shadow-raised transition-transform duration-100 ease-out active:scale-90"
          :aria-label="
            newBelow ? `Go to the ${newBelow} newest messages` : 'Go to the latest message'
          "
          @click="scrollToEnd(true)"
        >
          <AppIcon name="chevronDown" :size="20" :stroke="2.2" />
          <span
            v-if="newBelow"
            class="absolute -top-1 -right-1 grid h-4.5 min-w-4.5 place-items-center rounded-pill bg-primary-fill px-1 text-[10px] font-bold text-on-primary tabular-nums"
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
      <p v-else-if="sendError" class="m-0 text-xs text-primary">{{ sendError }}</p>
      <p v-else-if="attachError" class="m-0 text-xs text-primary">{{ attachError }}</p>
      <!--
        Why the clocks are not turning into ticks, said once, here, rather than
        left for the member to work out from a thread that has stopped moving.
        And a promise, because that is what they need to know before pressing
        send: it will go by itself, and nothing has to be typed twice.
      -->
      <p
        v-else-if="!online"
        class="m-0 flex items-center gap-1.5 text-xs text-muted"
        role="status"
      >
        <AppIcon name="clock" :size="13" :stroke="2.2" />
        You’re offline. Messages will send when you reconnect.
      </p>
      <p v-else-if="storageFull" class="m-0 text-xs text-orange-text">
        This device is out of space. Anything you send now will be gone after a
        reload, so clear a few progress photos to make room.
      </p>

      <!--
        Who can be named, filtered by whatever has been typed after the `@`.
        Above the field like every other strip here, because the thumb is at
        the bottom of the screen and a list that opens over the conversation
        would cover the message being replied to.
      -->
      <div
        v-if="mentionsOpen"
        ref="mentionList"
        class="flex max-h-52 flex-col overflow-y-auto overscroll-contain rounded-xl bg-raised p-1 shadow-card"
        role="listbox"
        aria-label="People you can mention"
      >
        <!--
          Chosen on the click, with the press itself only holding focus.

          It used to choose on `pointerdown`, which made the list impossible to
          scroll: a finger coming down to drag it picked whoever it happened to
          land on and closed the list before it had moved a pixel. A click
          fires for a tap and not for a drag — the browser cancels the pointer
          once it becomes a scroll — so choosing there is what separates the
          two.

          `prevent` stays on the press, because that is what keeps the focus in
          the field: without it the press blurs the input, the soft keyboard
          starts to close, and the list slides down the screen with it, out
          from under the finger. It does not stop a touch from scrolling;
          `touch-action` decides that, and nothing here restricts it.

          `shrink-0` so the rows keep their height and overflow the list rather
          than being squeezed to fit it. `overscroll-contain` so reaching either
          end of the list does not carry on and scroll the thread behind it.
        -->
        <button
          v-for="(person, i) in mentionMatches"
          :key="person.uid"
          class="flex w-full shrink-0 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left"
          :class="i === mentionIndex && 'bg-fill-subtle'"
          :data-mention-row="i"
          role="option"
          :aria-selected="i === mentionIndex"
          @pointerenter="mentionIndex = i"
          @pointerdown.prevent
          @click="chooseMention(person)"
        >
          <Avatar size="xs">
            <AvatarImage :src="person.avatarUrl" :alt="person.name" loading="lazy" />
            <AvatarFallback>{{ person.name.charAt(0).toUpperCase() }}</AvatarFallback>
          </Avatar>
          <span class="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
            {{ person.name }}
          </span>
        </button>
      </div>

      <!--
        What is being rewritten, above the field it is being rewritten in.
        Shares the reply strip's slot and its shape — one accent bar, one line
        of context, one way out — because they are the same promise: the field
        below is attached to that message, and this is how you detach it.
      -->
      <div
        v-if="editing"
        class="flex items-center gap-2.5 rounded-xl border-l-[3px] border-primary-fill bg-raised py-2 pr-1.5 pl-3 shadow-card"
      >
        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="text-[11px] font-bold text-primary">Editing message</span>
          <span class="truncate text-[12px] text-muted">{{ editing.text }}</span>
        </div>
        <button
          class="grid size-8 shrink-0 place-items-center rounded-full text-muted"
          aria-label="Cancel edit"
          @click="cancelEdit"
        >
          <AppIcon name="close" :size="14" :stroke="2.4" />
        </button>
      </div>

      <!--
        What is being answered, above the field it will be answered in. The
        accent bar is the same one the sent quote carries, so the strip and the
        bubble it becomes are recognisably the same thing.
      -->
      <div
        v-else-if="replyingTo"
        class="flex items-center gap-2.5 rounded-xl border-l-[3px] border-primary-fill bg-raised py-2 pr-1.5 pl-3 shadow-card"
      >
        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="text-[11px] font-bold text-primary">
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
            <span class="text-[10.5px] text-muted tabular-nums">
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
          <!--
            The field, with a tinted copy of its text underneath. See
            `draftRuns` for why it takes two layers.

            The two have to set their text identically or the colour lands
            beside the name instead of on it: the same size, no padding on
            either, and nothing in the copy that changes a glyph's width —
            which is why a picked name is coloured here and not also bold, the
            way it is once it has been sent.

            And `leading-[normal]` on both, which is the one that is not
            obvious. Chromium positions a field's text by the font's own
            `normal` line height and ignores the `line-height` it is given,
            while the copy honours the 20px `text-sm` asks for — and the
            half-leading that adds is rounded differently on each side, so the
            copy sat a full pixel above the text it was colouring. Every line
            jumped up by that pixel the instant a name was picked, since that is
            the moment the field stops drawing its own text. With no leading on
            either there is nothing to round: measured in headless Chromium the
            two layers match to within anti-aliasing. `normal` on the field too,
            rather than on the copy alone, because engines that *do* honour a
            field's line height then land in the same place instead of a
            different one.

            The copy's spans sit on one line on purpose. It keeps its
            whitespace, as the field does, so a line break between them would
            be a space the member never typed, pushing everything after it out
            of line with the caret.
          -->
          <div class="relative h-full min-w-0 flex-1">
            <div
              v-if="draftRuns"
              class="pointer-events-none absolute inset-0 flex items-center overflow-hidden text-sm leading-[normal] whitespace-pre text-ink"
              aria-hidden="true"
            ><span
                class="shrink-0"
                :style="{ transform: `translateX(${-fieldScroll}px)` }"
              ><span
                  v-for="(run, i) in draftRuns"
                  :key="i"
                  :class="run.mention && 'text-primary'"
                >{{ run.text }}</span></span></div>
            <input
              ref="composer"
              v-model="draft"
              class="relative h-full w-full min-w-0 border-none bg-transparent text-sm leading-[normal] outline-none"
              :class="draftRuns ? 'text-transparent caret-ink' : 'text-ink'"
              :placeholder="
                editing ? 'Edit your message…' : replyingTo ? 'Write your reply…' : placeholder
              "
              @input="onComposerInput"
              @keydown="onComposerKeydown"
              @keyup="trackCaret"
              @click="trackCaret"
              @scroll="syncFieldScroll"
              @keyup.enter="onComposerEnter"
              @keyup.esc="onEscape"
            />
          </div>
          <!--
            Both are off while a message is being edited: an edit rewrites the
            words of a message that has already been sent, and the photos on it
            went to Cloud Storage with it. Disabled rather than hidden, so the
            field does not change width the moment an edit starts.
          -->
          <button
            :class="TOOL"
            aria-label="Attach a file"
            :disabled="reading || roomLeft <= 0 || Boolean(editing)"
            @click="openPicker(attachInput)"
          >
            <AppIcon name="paperclip" :size="19" :stroke="1.9" />
          </button>
          <button
            :class="TOOL"
            aria-label="Take a photo"
            :disabled="reading || roomLeft <= 0 || Boolean(editing)"
            @click="openPicker(cameraInput)"
          >
            <AppIcon name="camera" :size="19" />
          </button>
        </div>

        <!-- Never held for a send in flight: the composer empties as it
             hands the message over, so a second tap has nothing to send
             twice. Off only when there is nothing in it to send. -->
        <button
          class="grid size-12 shrink-0 place-items-center rounded-full bg-primary-fill text-on-primary transition-[transform,opacity,background-color] duration-100 ease-out active:scale-[0.94] motion-reduce:transition-none motion-reduce:active:scale-100"
          :class="!canSend && 'opacity-45'"
          :disabled="!canSend"
          :aria-label="editing ? 'Save edit' : 'Send'"
          @click="submit"
        >
          <!-- A tick, not a paper plane: this one is not going anywhere new. -->
          <AppIcon v-if="editing" name="check" :size="19" :stroke="2.6" />
          <AppIcon v-else name="send" :size="18" fill />
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
            class="grid size-9 place-items-center rounded-full text-muted transition-colors duration-150 hover:bg-primary-soft hover:text-primary"
            role="menuitem"
            aria-label="Reply to this message"
            @click="replyFromPicker"
          >
            <AppIcon name="reply" :size="18" :stroke="2" />
          </button>

          <!--
            Only on the member's own messages, and only while they are still
            young enough to change. See `canEditMessage`: the absence of this
            button is the whole of how the window is communicated, which is why
            it is decided when the menu opens rather than while it is up.
          -->
          <button
            v-if="reacting.canEdit"
            class="grid size-9 place-items-center rounded-full text-muted transition-colors duration-150 hover:bg-primary-soft hover:text-primary"
            role="menuitem"
            aria-label="Edit this message"
            @click="editFromPicker"
          >
            <AppIcon name="edit" :size="18" :stroke="2" />
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
