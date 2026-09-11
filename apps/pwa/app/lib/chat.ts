// =============================================================================
// Chat helpers shared by the thread and the composer.
//
// The grouping rules and the quote snapshot both have to agree across the
// bubble, the composer strip and whatever writes the message, so they live here
// rather than being re-derived in each template.
// =============================================================================

import type { Timestamp } from 'firebase/firestore'

import type {
  ChatMessageView,
  ChatReaction,
  ChatReplyRef,
  Message,
  TypingPeer,
} from '~/data/types'

/**
 * How long a silence has to be before the next message starts a new run.
 *
 * Back-to-back messages from one person are one turn in the conversation and
 * are drawn as one: name and face once, at the top. But "back to back" is about
 * the conversation, not the author — somebody answering their own message the
 * next morning is a new turn, and stacking it under yesterday's would date it
 * wrongly. Five minutes is the usual line, and it is short enough that the
 * timestamp on the last bubble of a run still describes the whole run.
 */
export const GROUP_WINDOW_MS = 5 * 60 * 1000

/** Whether `message` continues the run `previous` started. */
export const continuesRun = (
  message: ChatMessageView,
  previous: ChatMessageView | undefined,
): boolean => {
  if (!previous) return false
  if (previous.authorUid !== message.authorUid) return false
  return message.sentAt.toMillis() - previous.sentAt.toMillis() <= GROUP_WINDOW_MS
}

/**
 * How much of the original a quote carries.
 *
 * Two lines at a phone width. The quote is there to say which message is being
 * answered, not to repeat it — the original is a tap away on the quote itself.
 */
const EXCERPT_CHARS = 140

/**
 * The snapshot a reply carries of the message it answers.
 *
 * Excerpted here rather than at render time so the stored document is already
 * the size it needs to be: a reply to a 2,000-character message should not
 * carry 2,000 characters into every copy of the thread. See `ChatReplyRef`.
 */
export const replyRefFor = (message: Message): ChatReplyRef => {
  const text = message.text.trim()
  const [first] = message.attachments ?? []
  return {
    messageId: message.id,
    authorUid: message.authorUid,
    authorName: message.authorName,
    text: text.length > EXCERPT_CHARS ? `${text.slice(0, EXCERPT_CHARS).trimEnd()}…` : text,
    attachmentKind: text ? null : (first?.kind ?? null),
  }
}

/**
 * What a quote reads as when the message it answers had no words in it.
 *
 * An empty line under an author's name looks like a rendering failure, so a
 * photos-only message is described instead.
 */
export const replyPreview = (ref: ChatReplyRef): string => {
  if (ref.text) return ref.text
  if (ref.attachmentKind === 'image') return 'Photo'
  if (ref.attachmentKind === 'file') return 'Attachment'
  return 'Message'
}

// --- Editing -----------------------------------------------------------------

/**
 * How long after sending a message can still be rewritten.
 *
 * WhatsApp's fifteen minutes, for WhatsApp's reason. An edit window exists to
 * fix a typo, a wrong weight or a wrong time while the message is still the
 * last thing on the screen — not to let somebody quietly restate what they said
 * after it has been read, answered and acted on. Long enough to catch the
 * mistake you notice the moment you send it; short enough that the thread
 * everyone remembers is the thread that happened.
 *
 * This constant decides what the hold menu offers. What the *server* accepts is
 * decided by the same fifteen minutes in `firestore.rules`, measured against
 * `request.time`. Both exist on purpose: the one here is how a member finds out
 * politely, the one there is what makes it true.
 */
export const EDIT_WINDOW_MS = 15 * 60 * 1000

/**
 * Whether `message` is still the viewer's to rewrite, as of `nowMs`.
 *
 * Three conditions. It has to be theirs — `isSelf`, resolved by the data source
 * against the identity it authenticated, not by comparing names. It has to have
 * words in it, because editing is editing text and a photo posted without a
 * caption has none to edit. And it has to be inside the window.
 *
 * `nowMs` is a parameter rather than a `Date.now()` in here so the caller is
 * forced to hand over the *trusted* clock: a member who sets their phone back
 * an hour must not thereby get an hour of extra edit window, which is the same
 * reason the training day is read off the network. See `lib/time.ts`.
 */
export const canEditMessage = (message: ChatMessageView, nowMs: number): boolean => {
  if (!message.isSelf) return false
  if (!message.text.trim()) return false
  return nowMs - message.sentAt.toMillis() < EDIT_WINDOW_MS
}

// --- Reactions ---------------------------------------------------------------

/**
 * The chips as they will look once the member's tap has landed.
 *
 * Reacting is a transaction against two documents over a phone connection, and
 * the chip used to wait for all of it: tap, a beat of nothing, then the count
 * moves. That beat is the whole interaction. The tap is not a question the
 * server has to answer — the member's own reactions are theirs, the toggle is
 * decided entirely by whether the chip is already lit — so the answer is known
 * here and drawn immediately, and the write reconciles behind it.
 *
 * Pure, and the same in both threads, because the optimistic state and the
 * state the server will eventually report have to agree; two versions of this
 * rule would show one thing and settle on another.
 *
 * Only the viewer's own half moves. Everyone else's count is not this device's
 * to guess at, so an emoji whose last reactor was this member drops out of the
 * list rather than lingering at zero — the same rule the stored counts follow.
 */
export const toggledReactions = (
  reactions: ChatReaction[],
  emoji: string,
): ChatReaction[] => {
  const existing = reactions.find((r) => r.emoji === emoji)
  if (!existing) return [...reactions, { emoji, count: 1, mine: true }]

  const count = existing.count + (existing.mine ? -1 : 1)
  if (count <= 0) return reactions.filter((r) => r.emoji !== emoji)

  return reactions.map((r) =>
    r.emoji === emoji ? { ...r, count, mine: !r.mine } : r,
  )
}

// --- Typing ----------------------------------------------------------------

/**
 * How often a member who is still typing re-states it.
 *
 * Every refresh is a document write that fans out to a listener on every phone
 * with the thread open, so this is the cost knob. Four seconds is slow enough
 * that a long message costs a handful of writes rather than one per keystroke,
 * and fast enough that the indicator does not flicker between refreshes.
 */
export const TYPING_REFRESH_MS = 4000

/**
 * How long a marker is trusted after it was last written.
 *
 * Comfortably more than two refreshes, because the failure it has to tolerate
 * is a slow round trip, not a slow typist. Below two the indicator blinks on a
 * bad connection; far above it, a tab that was closed mid-sentence leaves
 * somebody "typing" long after they have gone.
 */
export const TYPING_TTL_MS = 10_000

/**
 * How long the composer can sit untouched before the member counts as stopped.
 *
 * Longer than the refresh, so somebody who is still typing never flickers off
 * between keystrokes, and short enough that walking away from a half-written
 * message clears within a breath of the TTL that would clear it anyway. It is
 * the polite half of the contract: the TTL is the backstop for a tab that
 * cannot say anything, this is for one that can.
 */
export const TYPING_IDLE_MS = 5000

/** Whether a marker written at `at` is still worth rendering. */
export const typingIsFresh = (at: Timestamp | null | undefined, nowMs: number): boolean => {
  if (!at) return false
  const age = nowMs - at.toMillis()
  // A marker from the future is a clock that disagrees, not a stale one. The
  // writer's clock is theirs and the reader's is the trusted one, and the two
  // are allowed to differ; refusing the future would hide a live indicator for
  // as long as the skew lasts.
  return age < TYPING_TTL_MS
}

/**
 * The line under the thread: who is typing, in the fewest words that are true.
 *
 * One person is named, because in a cohort of forty that is the useful fact.
 * Two or more are not: the names would be longer than the thread is wide, they
 * change as people start and stop, and nobody is waiting on a particular one of
 * them. Empty string when nobody is, which is also the caller's render guard.
 */
export const typingLabel = (peers: TypingPeer[]): string => {
  const [only] = peers
  if (!only) return ''
  if (peers.length === 1) return `${only.name || 'Someone'} is typing…`
  return 'Multiple people are typing…'
}
