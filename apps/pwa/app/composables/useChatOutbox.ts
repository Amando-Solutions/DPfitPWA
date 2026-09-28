// =============================================================================
// Messages this device has sent and the server has not confirmed.
//
// Pressing send used to hand the composer's contents to the data source and
// wait. For text that mostly worked, because Firestore draws a pending write
// straight away — but a refused write took the bubble back off the screen and
// dropped the words into the composer, which reads as the app having eaten the
// message. For photos it did not work at all: they have to reach Cloud Storage
// before a document can name them, so there was nothing to draw, and offline
// the upload retries for ten minutes before it gives up. The composer sat on
// "Uploading and sending…" for all ten, with the send button off.
//
// So a message is on screen from the moment it is sent, whatever it carries,
// and what happens to it afterwards happens *to the bubble*, the way it does in
// WhatsApp: a clock while it is on its way, a tick when the server has it, a
// red mark with "Try again" when it is not going to get there on its own.
//
// This is not a second offline queue. Firestore's persistent cache already is
// one, and a better one than this could be: it survives a reload, and a text
// message is handed to it the instant it is sent. What this holds is the part
// Firestore cannot: photos waiting for a connection before they can be
// uploaded, and the record of a send that failed, so there is something to try
// again. It is in memory, for the life of the app — see `useChatOutbox` for
// why that is the whole app and not the screen.
// =============================================================================

import type { Timestamp } from 'firebase/firestore'

import type {
  ChatAttachment,
  ChatMention,
  ChatMessageView,
  ChatReplyRef,
  ThreadId,
} from '~/data/types'
import type { PendingAttachment } from '~/lib/attachments'
import { addressedUidsOf, newMessageId } from '~/lib/chat'
import { useDataSourceClient, type DataSource } from '~/lib/datasource'
import { trustedTimestamp } from '~/lib/time'

/** What the composer hands over when the member presses send. */
export interface OutgoingPayload {
  text: string
  attachments: PendingAttachment[]
  replyTo: ChatReplyRef | null
  mentions: ChatMention[]
}

/**
 * Where one outgoing message has got to.
 *
 * - `waiting` — nothing in flight. It has photos to upload and the device is
 *   offline, so it is held until the connection comes back rather than started
 *   into a retry loop that burns ten minutes of battery to fail.
 * - `sending` — in flight: uploading, or written and not yet acknowledged.
 * - `sent` — the server has it. Kept until the live thread has it too, so the
 *   bubble does not blink out between the two on a backend that polls.
 * - `failed` — refused, or broke with a connection present. Stays until the
 *   member retries or deletes it; nothing retries a failure on its own, because
 *   whatever refused it once will usually refuse it again.
 *
 * The thread draws the first two as one clock. See `ChatDelivery`.
 */
type OutboxState = 'waiting' | 'sending' | 'sent' | 'failed'

interface Outgoing {
  /** The id the message will be written under, chosen before any of it is. */
  id: string
  threadId: ThreadId
  /**
   * Who sent it, taken when they did.
   *
   * Checked again before every attempt: a member who signs out with a message
   * waiting must not have it go out under whoever signs in next, which is what
   * the data source would do — it writes as whoever is signed in *now*.
   */
  author: { uid: string; name: string; avatarUrl: string }
  sentAt: Timestamp
  payload: OutgoingPayload
  /**
   * What has already reached storage, by index into `payload.attachments`.
   *
   * Kept across attempts, so a retry after the fourth of four photos failed
   * uploads one photo and not four.
   */
  uploaded: (ChatAttachment | null)[]
  state: OutboxState
  /** Why a `failed` message did not go, in the member's words. */
  error: string
}

// --- The queue ---------------------------------------------------------------
//
// Module state rather than component state, on purpose. A member who sends four
// photos and taps over to Home while they upload has not cancelled anything:
// the upload carries on, and the message has to still be there — with its
// clock, or its tick, or its red mark — when they come back. State owned by the
// chat screen would go when it unmounted and take the only record of a failure
// with it.

/** Shallow, and replaced rather than mutated, so the data URLs inside are never proxied. */
const entries = shallowRef<Outgoing[]>([])

/**
 * Per thread, the ids the live thread last showed as on the server.
 *
 * A send can be confirmed by the listener before its own promise settles, and
 * then no later delivery arrives to say so again. This is what the promise
 * checks on the way back, so the entry goes at once instead of lingering,
 * invisible behind the live copy, with its photos in memory.
 */
const confirmed = new Map<ThreadId, Set<string>>()

let data: DataSource | null = null
let store: ReturnType<typeof useAppStore> | null = null
let listening = false

const find = (id: string) => entries.value.find((entry) => entry.id === id)

const patch = (id: string, changes: Partial<Outgoing>) => {
  entries.value = entries.value.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry))
}

const drop = (id: string) => {
  entries.value = entries.value.filter((entry) => entry.id !== id)
}

/** `navigator.onLine` is only believed when it says no. See `useOnline`. */
const offline = () => import.meta.client && navigator.onLine === false

const upload = (source: DataSource, item: PendingAttachment): Promise<ChatAttachment> =>
  item.kind === 'image'
    ? source.uploadImage(item.image, 'chat').then(
        (stored): ChatAttachment => ({
          id: stored.storagePath,
          kind: 'image',
          name: item.name,
          bytes: stored.bytes,
          mimeType: item.mimeType,
          storagePath: stored.storagePath,
          downloadUrl: stored.downloadUrl,
        }),
      )
    : source.uploadAttachment(item.file)

/**
 * Take one message as far as it will go.
 *
 * Everything up to the first `await` runs synchronously, and that includes
 * moving the message out of `waiting` — so a second call arriving while this
 * one is in flight, from the `online` event firing twice, finds it `sending`
 * and leaves it alone.
 */
const attempt = async (id: string): Promise<void> => {
  const entry = find(id)
  const source = data
  if (!entry || !source) return

  // Somebody else signed in since: theirs to lose, not to send under a new
  // name. Nobody signed in at all is only a moment — a member being re-read —
  // so that one waits for the next connection to come round instead.
  const viewer = store?.member.value?.id
  if (viewer !== entry.author.uid) {
    if (viewer) drop(id)
    else patch(id, { state: 'waiting', error: '' })
    return
  }

  // Text goes to the data source even offline: Firestore queues it on disk,
  // and a queue that survives a reload is better than this one. Uploads do
  // not queue anywhere, so a message that still has one waits for a network.
  const uploadsLeft = entry.payload.attachments.some((_, index) => !entry.uploaded[index])
  if (uploadsLeft && offline()) {
    patch(id, { state: 'waiting', error: '' })
    return
  }

  patch(id, { state: 'sending', error: '' })

  try {
    const attachments = await Promise.all(
      entry.payload.attachments.map(async (item, index) => {
        const done = find(id)?.uploaded[index]
        if (done) return done

        const stored = await upload(source, item)
        // Recorded as each one lands rather than once they all have, which
        // is what lets a retry skip the ones that made it.
        const current = find(id)
        if (current) {
          const uploaded = [...current.uploaded]
          uploaded[index] = stored
          patch(id, { uploaded })
        }
        return stored
      }),
    )

    await source.sendMessage(
      entry.threadId,
      entry.payload.text,
      attachments,
      entry.payload.replyTo,
      entry.payload.mentions,
      { id, sentAt: entry.sentAt },
    )

    if (confirmed.get(entry.threadId)?.has(id)) drop(id)
    else if (find(id)) patch(id, { state: 'sent' })
  } catch (cause) {
    console.error('[chat] send failed', cause)
    if (!find(id)) return
    // Broke because the connection went, which is not a failure the member
    // has to act on: it goes back to waiting and goes out on its own.
    if (offline()) {
      patch(id, { state: 'waiting', error: '' })
      return
    }
    patch(id, {
      state: 'failed',
      error: cause instanceof Error ? cause.message : 'Couldn’t send that.',
    })
  }
}

/** Everything held for a connection, now that there is one. */
const flush = () => {
  for (const entry of entries.value) {
    if (entry.state === 'waiting') void attempt(entry.id)
  }
}

/** One outgoing message as the thread draws it. */
const viewOf = (entry: Outgoing): ChatMessageView => {
  const { text, replyTo, mentions } = entry.payload
  return {
    id: entry.id,
    authorUid: entry.author.uid,
    authorName: entry.author.name,
    authorAvatarUrl: entry.author.avatarUrl,
    isCoach: false,
    text,
    sentAt: entry.sentAt,
    editedAt: null,
    // The copies on the device, not the uploaded ones, even once they exist:
    // they are already decoded, and swapping to a download URL mid-send would
    // make the photo blank out while the same picture came back over the
    // network. The live thread's copy takes over once it has one.
    attachments: entry.payload.attachments.map(
      (item, index): ChatAttachment =>
        item.kind === 'image'
          ? {
              id: `${entry.id}-${index}`,
              kind: 'image',
              name: item.name,
              bytes: item.image.bytes,
              mimeType: item.mimeType,
              storagePath: '',
              downloadUrl: item.image.dataUrl,
            }
          : {
              id: `${entry.id}-${index}`,
              kind: 'file',
              name: item.file.name,
              bytes: item.file.bytes,
              mimeType: item.file.mimeType,
              storagePath: '',
              downloadUrl: item.file.dataUrl,
            },
    ),
    replyTo,
    mentions,
    addressedUids: addressedUidsOf({ authorUid: entry.author.uid, mentions, replyTo }),
    reactionCounts: {},
    isSelf: true,
    reactions: [],
    delivery: entry.state === 'failed' ? 'failed' : entry.state === 'sent' ? 'sent' : 'sending',
    ...(entry.error && { deliveryError: entry.error }),
  }
}

/**
 * `live` with the outgoing messages it does not have yet slotted in by time.
 *
 * The live copy always wins. Firestore draws its own pending write the moment
 * it is made, so for a text message the two are the same message under the
 * same id within a frame of each other, and the live one is the one that will
 * go on to be confirmed. The copy here only shows while there is nothing else:
 * photos still uploading, and a send that failed — which Firestore takes off
 * its own screen, and this is what puts it back.
 *
 * Inserted rather than sorted in, so the live thread's own order is never
 * second-guessed.
 */
const merge = (live: ChatMessageView[], outgoing: ChatMessageView[]): ChatMessageView[] => {
  if (!outgoing.length) return live
  const have = new Set(live.map((message) => message.id))
  const extra = outgoing.filter((message) => !have.has(message.id))
  if (!extra.length) return live

  const thread = [...live]
  for (const message of extra) {
    const at = message.sentAt.toMillis()
    const index = thread.findIndex((other) => other.sentAt.toMillis() > at)
    if (index < 0) thread.push(message)
    else thread.splice(index, 0, message)
  }
  return thread
}

/**
 * The outbox for one thread.
 *
 * Call it from the screen's setup: it is where the data source and the store
 * are picked up, and the queue behind it needs both after the screen has gone.
 */
export const useChatOutbox = (threadId: ThreadId) => {
  data ??= useDataSourceClient()
  store ??= useAppStore()
  const app = store

  if (!listening && import.meta.client) {
    listening = true
    window.addEventListener('online', flush)
  }

  /** Only this member's. See `Outgoing.author`. */
  const outgoing = computed(() => {
    const uid = app.member.value?.id
    return entries.value
      .filter((entry) => entry.threadId === threadId && entry.author.uid === uid)
      .map(viewOf)
  })

  return {
    /**
     * Put a message on screen and start it on its way.
     *
     * Resolves once the first attempt has settled — sent, waiting or failed —
     * and never rejects: what happened is on the bubble, not in the promise.
     */
    send(payload: OutgoingPayload): Promise<void> {
      const member = app.member.value
      if (!member) return Promise.resolve()

      const id = newMessageId()
      entries.value = [
        ...entries.value,
        {
          id,
          threadId,
          author: {
            uid: member.id,
            name: member.profile.displayName || 'You',
            avatarUrl: member.profile.avatarUrl || '',
          },
          sentAt: trustedTimestamp(),
          payload,
          uploaded: payload.attachments.map(() => null),
          state: 'sending',
          error: '',
        },
      ]
      return attempt(id)
    },

    /**
     * Send a failed message again.
     *
     * Dated again, too, which moves it to the bottom of the thread. It was
     * not said at the moment it was first typed — nobody saw it then — and
     * slotting it back in there would put it above messages the rest of the
     * cohort has already read past, where nobody would see it now either.
     * The id stays, so a first attempt that did land after all is updated
     * rather than doubled. See `DataSource.sendMessage`.
     */
    retry(id: string): Promise<void> {
      if (find(id)?.state !== 'failed') return Promise.resolve()
      patch(id, { sentAt: trustedTimestamp() })
      return attempt(id)
    },

    /**
     * Give up on a failed message.
     *
     * Failed ones only. Anything still in flight may land whatever happens
     * here, and taking it off this screen would not take it off anyone else's.
     */
    discard(id: string) {
      if (find(id)?.state === 'failed') drop(id)
    },

    /**
     * Tell the outbox what the live thread just delivered.
     *
     * Anything it now shows as on the server is finished with here. Something
     * it shows as still pending is not: that write can yet be refused, and
     * then Firestore takes it back off the screen and the copy here is the one
     * that has to say so.
     */
    settle(live: ChatMessageView[]) {
      const onServer = new Set(
        live.filter((message) => message.delivery !== 'sending').map((message) => message.id),
      )
      confirmed.set(threadId, onServer)

      const done = entries.value.filter(
        (entry) => entry.threadId === threadId && onServer.has(entry.id),
      )
      if (!done.length) return
      entries.value = entries.value.filter((entry) => !done.includes(entry))
    },

    /** The thread as it should be drawn: live, plus what has not reached it. */
    merge: (live: ChatMessageView[]) => merge(live, outgoing.value),
  }
}
