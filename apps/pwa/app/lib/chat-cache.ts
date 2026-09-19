// =============================================================================
// The last thread each member read, kept on disk so reopening it is instant.
//
// A thread is live data, and the live listener is what it is really made of —
// but that listener cannot say anything until the member document has been
// read, the thread has been resolved and Firestore has opened its query, and
// the page it feeds starts with an empty array. So opening the chat showed
// nothing at all for as long as that took, on a screen whose entire content had
// already been on this device since the last time it was looked at.
//
// What is kept here is the *view*, not the documents: `isSelf` and the `mine`
// flag on each reaction are facts about the reader, already resolved by the
// data source, and re-deriving them would mean knowing who is looking before
// anything can be drawn. That is also why the reader's uid is stored alongside
// them and checked on the way out — see `readThreadCache`.
//
// This is not the offline story. Firestore's own persistent cache is, and it
// holds the whole 200-message query rather than the tail kept here; this is the
// part that is *synchronous*, which is the part a first paint needs.
// =============================================================================

import type { ChatMessageView, ThreadId } from '~/data/types'
import { storage } from '~/lib/storage'

/**
 * How much of a thread is worth keeping.
 *
 * The thread query reads 200 messages and Firestore's cache holds all of them.
 * This copy only has to cover what a member sees when the screen opens — the
 * bottom of the thread — and stay small enough that it is never the reason
 * their photos have nowhere to go, since Web Storage is one shared quota and
 * this is the one thing in it that can be rebuilt from the server for free.
 * Sixty is several screens' worth of scrollback.
 */
const KEEP = 60

interface CachedThread {
  /**
   * Whose reading of the thread this is.
   *
   * Sign-out clears the whole store, so ordinarily nobody else's copy can be
   * here. This is for the way that fails: a session that ends without a
   * sign-out — a revoked token, an expired refresh — leaves the store intact
   * for whoever signs in next, and a thread restored under the wrong reader
   * would draw the last member's messages as the new one's own. Blank is a
   * worse first paint than this; somebody else's words in your colour is a
   * worse bug than blank.
   */
  viewerUid: string
  messages: ChatMessageView[]
}

const keyFor = (threadId: ThreadId) => `chat-thread:${threadId}`

/**
 * The thread as this member last saw it, or nothing.
 *
 * `viewerUid` is who the caller believes is looking. An empty string means they
 * do not know yet, and the cache is served anyway: that only happens before the
 * store has a member, which is a moment too early for anyone to have signed in
 * as somebody else, and refusing it there would give back the blank screen this
 * exists to remove.
 */
export const readThreadCache = (
  threadId: ThreadId,
  viewerUid: string,
): ChatMessageView[] => {
  const cached = storage.read<CachedThread | null>(keyFor(threadId), null)
  if (!cached?.messages?.length) return []
  if (viewerUid && cached.viewerUid !== viewerUid) return []
  return cached.messages
}

/**
 * Keep the tail of what the live listener just delivered.
 *
 * Skipped when the viewer is unknown, rather than stored under an empty uid: a
 * copy nobody can be matched against is one that has to be either trusted
 * blindly or thrown away later, and neither is worth a write.
 */
export const writeThreadCache = (
  threadId: ThreadId,
  viewerUid: string,
  messages: ChatMessageView[],
): void => {
  if (!viewerUid) return
  storage.write<CachedThread>(keyFor(threadId), {
    viewerUid,
    messages: messages.slice(-KEEP),
  })
}
