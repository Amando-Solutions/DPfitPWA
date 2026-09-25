// =============================================================================
// Chat helpers shared by the thread and the composer.
//
// The grouping rules and the quote snapshot both have to agree across the
// bubble, the composer strip and whatever writes the message, so they live here
// rather than being re-derived in each template.
// =============================================================================

import type { Timestamp } from 'firebase/firestore'

import type {
  ChatMention,
  ChatMessageView,
  ChatReaction,
  ChatReplyRef,
  Message,
  Notification,
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

/**
 * Whether `message` continues the run `previous` started.
 *
 * A message that did not send stands alone, on both sides. It is not part of
 * the conversation everyone else is reading, and it carries its own line where
 * the run's time would go — "Not sent", and what to do about it — so a run
 * that carried on under it would lose its time to that line, and one that
 * carried on over it would hang the failure on messages that went.
 */
export const continuesRun = (
  message: ChatMessageView,
  previous: ChatMessageView | undefined,
): boolean => {
  if (!previous) return false
  if (previous.authorUid !== message.authorUid) return false
  if (message.delivery === 'failed' || previous.delivery === 'failed') return false
  return message.sentAt.toMillis() - previous.sentAt.toMillis() <= GROUP_WINDOW_MS
}

const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/**
 * A new message id, made on the device before anything is written.
 *
 * The same shape Firestore's own auto ids take — twenty characters from the
 * same sixty-two, from the platform's secure random source — so a message
 * named here is indistinguishable from one the SDK named, and still has no `-`
 * in it for `chatReactionsNotificationId` to trip on.
 *
 * Bytes at or past the last whole multiple of 62 are thrown away rather than
 * wrapped with `%`, which would make the first eight characters likelier than
 * the rest.
 */
export const newMessageId = (): string => {
  const cutoff = 256 - (256 % ID_ALPHABET.length)
  let id = ''
  while (id.length < 20) {
    for (const byte of crypto.getRandomValues(new Uint8Array(40))) {
      if (byte >= cutoff) continue
      id += ID_ALPHABET[byte % ID_ALPHABET.length]
      if (id.length === 20) break
    }
  }
  return id
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

// --- Mentions ----------------------------------------------------------------

/**
 * Who can be named, as the composer's picker needs them.
 *
 * A shape of its own rather than a `LeaderboardEntry`, because the roster the
 * picker draws on is a roster and not a board: it must not carry session counts
 * onto a screen that has no business showing them, least of all in a cohort
 * whose board has not been revealed yet.
 */
export interface MentionCandidate {
  uid: string
  name: string
  avatarUrl: string
}

/**
 * The `@`-token the caret is currently sitting in, or `null`.
 *
 * `at` is where the `@` is, so the caller can replace from there; `query` is
 * what has been typed after it, which is what the list filters on.
 *
 * Two rules decide whether there is a token at all. The `@` has to start a word
 * — preceded by the beginning of the text or by whitespace — so that an email
 * address or a handle typed mid-word does not open a picker over the keyboard.
 * And the query stops at the first space, even though the names it matches
 * contain them: what is being typed is a search, not the name itself, and
 * letting it run past a space means every message that merely *contains* an "@"
 * keeps the picker open for the rest of the sentence.
 */
export const activeMention = (
  text: string,
  caret: number,
): { at: number; query: string } | null => {
  const upto = text.slice(0, caret)
  const at = upto.lastIndexOf('@')
  if (at < 0) return null

  const before = at > 0 ? upto[at - 1] : ''
  if (before && !/\s/.test(before)) return null

  const query = upto.slice(at + 1)
  if (/\s/.test(query)) return null

  return { at, query }
}

/**
 * Candidates whose name matches `query`, best-first.
 *
 * Every match, not the first few. This used to stop at six, which made a bare
 * `@` in a cohort of forty a list of six people with no way to reach the other
 * thirty-four except by already knowing how their name was spelled. The panel
 * scrolls instead.
 */
export const matchMentions = (
  candidates: MentionCandidate[],
  query: string,
): MentionCandidate[] => {
  const needle = query.trim().toLowerCase()
  if (!needle) return candidates

  // Names that *start* with what was typed come first: typing "to" means Tomi
  // before Victoria, even though both match.
  const starts: MentionCandidate[] = []
  const contains: MentionCandidate[] = []
  for (const candidate of candidates) {
    const name = candidate.name.toLowerCase()
    if (name.startsWith(needle)) starts.push(candidate)
    else if (name.includes(needle)) contains.push(candidate)
  }
  return [...starts, ...contains]
}

/**
 * The text with `@query` swapped for `@Name `, and where to put the caret.
 *
 * The trailing space is not a nicety: without it the caret sits at the end of a
 * name that is itself a valid `@`-token, so the picker reopens on the mention
 * that was just chosen and the next keystroke filters a list nobody asked for.
 */
export const applyMention = (
  text: string,
  at: number,
  queryLength: number,
  name: string,
): { text: string; caret: number } => {
  const rest = text.slice(at + 1 + queryLength)
  // Unless the text already continues with one, in which case adding another
  // leaves a gap in the middle of a sentence the member did not type.
  const spaced = !/^\s/.test(rest)
  const inserted = spaced ? `@${name} ` : `@${name}`
  return {
    text: text.slice(0, at) + inserted + rest,
    // Past the space either way, so typing carries on after the name rather
    // than between it and the word that follows.
    caret: at + inserted.length + (spaced ? 0 : 1),
  }
}

/**
 * `text` split into the runs that are mentions and the runs that are not.
 *
 * Driven by the stored `mentions` rather than by scanning for `@`, so what gets
 * highlighted is what the sender actually picked: typing "@nobody" by hand
 * leaves plain text, which is the honest rendering of a name that was never a
 * reference to anyone.
 *
 * Longest name first, so "@Tomi A" is not eaten by "@Tomi" in a cohort that has
 * both, and claimed ranges are never re-matched. The result is always a
 * complete cover of `text`, so a caller can render it end to end.
 */
export const mentionSegments = (
  text: string,
  mentions: ChatMention[],
): { text: string; mention: ChatMention | null }[] => {
  if (!text) return []
  if (!mentions?.length) return [{ text, mention: null }]

  const hits: { start: number; end: number; mention: ChatMention }[] = []
  const byLongest = [...mentions].sort((a, b) => b.name.length - a.name.length)

  for (const mention of byLongest) {
    if (!mention?.name) continue
    const token = `@${mention.name}`
    let from = 0
    for (;;) {
      const start = text.indexOf(token, from)
      if (start < 0) break
      const end = start + token.length
      // A longer name already covering this span wins it. Anything that
      // overlaps one at all is skipped rather than trimmed: half a name in
      // bold is worse than none of it.
      if (!hits.some((hit) => start < hit.end && end > hit.start)) {
        hits.push({ start, end, mention })
      }
      from = end
    }
  }

  if (!hits.length) return [{ text, mention: null }]
  hits.sort((a, b) => a.start - b.start)

  const segments: { text: string; mention: ChatMention | null }[] = []
  let cursor = 0
  for (const hit of hits) {
    if (hit.start > cursor) {
      segments.push({ text: text.slice(cursor, hit.start), mention: null })
    }
    segments.push({ text: text.slice(hit.start, hit.end), mention: hit.mention })
    cursor = hit.end
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), mention: null })
  return segments
}

/**
 * The mentions that survived editing, dropped down to the ones still written.
 *
 * The composer collects a mention when it is picked and never removes one, so
 * a member who backspaces over "@Tomi" would otherwise send a message that
 * still claims to name her. Checked against the text at send time instead,
 * which is the only moment the two are certainly in step.
 */
export const mentionsInText = (
  text: string,
  mentions: ChatMention[],
): ChatMention[] => {
  const kept = mentions.filter((m) => m?.name && text.includes(`@${m.name}`))
  // The same person picked twice is one mention. `uid` rather than name,
  // because two members may share a display name and both were really named.
  return kept.filter((m, i) => kept.findIndex((other) => other.uid === m.uid) === i)
}

// --- Notifications -----------------------------------------------------------

/**
 * Who `message` is aimed at: everyone it names, and whoever it answers.
 *
 * The one definition of "this is for you", written onto the message as
 * `addressedUids` so the inbox can query for it. The sender is never in it —
 * naming yourself or answering your own message tells you nothing — and each
 * person appears once, however many ways the message reaches them.
 */
export const addressedUidsOf = (
  message: Pick<Message, 'authorUid' | 'mentions' | 'replyTo'>,
): string[] => {
  const uids = new Set<string>()
  for (const mention of message.mentions ?? []) {
    if (mention?.uid) uids.add(mention.uid)
  }
  if (message.replyTo?.authorUid) uids.add(message.replyTo.authorUid)
  uids.delete(message.authorUid)
  return [...uids]
}

/**
 * The inbox id for a message aimed at the member.
 *
 * Prefixed so it can never collide with a coach announcement's id, since both
 * keep their read state in the same `notificationState` collection.
 */
export const chatNotificationId = (messageId: string): string => `chat-${messageId}`

/**
 * The inbox id for the reactions on one of the member's own messages.
 *
 * Under the same `chat-` prefix as `chatNotificationId`, and unable to collide
 * with it: a message id is an auto id, which has no `-` in it.
 */
export const chatReactionsNotificationId = (messageId: string): string =>
  `chat-${messageId}-reactions`

/** How much of the message the inbox line carries. */
const NOTIFICATION_EXCERPT_CHARS = 120

/** The inbox's one-line stand-in for a message. */
const excerptOf = (message: Message): string => {
  const text = message.text.trim()
  const [first] = message.attachments ?? []
  if (!text) return first?.kind === 'image' ? 'Photo' : 'Attachment'
  return text.length > NOTIFICATION_EXCERPT_CHARS
    ? `${text.slice(0, NOTIFICATION_EXCERPT_CHARS).trimEnd()}…`
    : text
}

/**
 * A message aimed at `viewerUid`, in the inbox's own shape.
 *
 * A reply wins over a mention when a message is both: "replied to you" is the
 * stronger claim, and one line per message is the rule — see
 * `chatNotificationId`, which is keyed on the message and not on the reason.
 */
export const chatNotificationFor = (message: Message, viewerUid: string): Notification => {
  const replied = message.replyTo?.authorUid === viewerUid
  const name = message.authorName || 'Someone'

  return {
    id: chatNotificationId(message.id),
    type: message.isCoach ? 'coach' : 'community',
    title: replied ? `${name} replied to you` : `${name} mentioned you`,
    body: excerptOf(message),
    publishedAt: message.sentAt,
    icon: replied ? 'reply' : 'chat',
    pinned: false,
    createdAt: message.sentAt,
    createdByUid: message.authorUid,
    createdByEmail: '',
  }
}

/**
 * The reactions on the viewer's own message, as one inbox line, or `null` when
 * nobody else is reacting to it any more.
 *
 * One line per message however many people react, named by the newest: "Tomi",
 * "Tomi and Ada", "Tomi and 4 others". Dated by that newest reaction too, which
 * is what lets the line come back unread when somebody else joins in — see
 * `reopens` on the inbox's items in `useAppStore`.
 *
 * The emojis are the message's chips as they stand, so they are what the member
 * finds when they tap through, including any they left on it themselves.
 */
export const reactionsNotificationFor = (
  message: Message,
  viewerUid: string,
): Notification | null => {
  const reactors = Object.entries(message.reactors ?? {})
    // `at` is null in a snapshot of a write still pending its server time.
    .filter(([uid, r]) => uid !== viewerUid && typeof r?.at?.toMillis === 'function')
    .map(([uid, r]) => ({ uid, name: r.name || 'Someone', at: r.at }))
    .sort((a, b) => b.at.toMillis() - a.at.toMillis())

  const [newest, next] = reactors
  if (!newest) return null

  const who = !next
    ? newest.name
    : reactors.length === 2
      ? `${newest.name} and ${next.name}`
      : `${newest.name} and ${reactors.length - 1} others`

  const emojis = Object.entries(message.reactionCounts ?? {})
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([emoji]) => emoji)
    .join('')

  return {
    id: chatReactionsNotificationId(message.id),
    type: 'community',
    title: `${who} reacted to your message`,
    body: emojis ? `${emojis} · ${excerptOf(message)}` : excerptOf(message),
    publishedAt: newest.at,
    icon: 'heart',
    pinned: false,
    createdAt: newest.at,
    createdByUid: newest.uid,
    createdByEmail: '',
  }
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
