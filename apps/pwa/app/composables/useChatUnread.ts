import { useDataSourceClient } from '~/lib/datasource'
import { storage } from '~/lib/storage'
import type { Message } from '~/data/types'

/**
 * The threads that live behind the Chat tab.
 *
 * Both of them: the tab's badge answers "is there anything for me in chat",
 * and a coach's reply is the message a member most wants that answered for.
 * `/chat` is the cohort room and `/chat/coach` is the DM, so one dot covers
 * the pair.
 */
const THREADS = ['cohort', 'coach'] as const

export type ChatThread = (typeof THREADS)[number]

/**
 * The deepest message the member has actually scrolled past in a thread.
 *
 * The same key `ChatView` keeps its place with, read rather than written here,
 * and deliberately so: the dot and the thread's "unread messages" band are one
 * fact, and two records of it would sooner or later disagree — a tab saying
 * you are caught up over a thread that opens on a band saying you are three
 * behind. Opening the screen is not what clears this. Reaching the newest
 * message on it is.
 *
 * Per device rather than per member, which is where it differs from the
 * inbox's read state — a document under the member that follows them between
 * devices. A tab dot is an attention cue for the phone it is drawn on: clearing
 * it here should not clear it on a laptop that has genuinely not been looked
 * at.
 */
const seenKey = (thread: ChatThread) => `chat-seen:${thread}`

type Seen = Record<ChatThread, string>

const readSeen = (): Seen =>
  Object.fromEntries(
    THREADS.map((thread) => [thread, storage.read<string>(seenKey(thread), '')]),
  ) as Seen

const buildChatUnread = () => {
  const data = useDataSourceClient()
  const store = useAppStore()

  /** The newest message in each thread, live. `null` until one arrives. */
  const latest = ref<Partial<Record<ChatThread, Message | null>>>({})
  const seen = ref<Seen>(readSeen())

  /**
   * Web Storage is not reactive, and the writer is another component.
   *
   * `ChatView` advances the marker as the member scrolls, which is what has to
   * put the dot out. Its write notifies every subscriber, and re-reading two
   * short strings is cheap enough to do on any of them; the equality check is
   * what keeps an unrelated write — a set logged, a photo saved — from
   * invalidating everything downstream of this.
   */
  const stopListening = storage.subscribe(() => {
    const next = readSeen()
    if (THREADS.every((thread) => next[thread] === seen.value[thread])) return
    seen.value = next
  })

  /**
   * Threads whose newest message the member has not scrolled to yet.
   *
   * Their own message never counts, whichever device they sent it from: the
   * thread's newest message being one they wrote is the definition of caught
   * up, and a dot over a message you just sent is noise.
   */
  const unreadThreads = computed(() =>
    THREADS.filter((thread) => {
      const message = latest.value[thread]
      if (!message) return false
      if (message.authorUid === store.authUser.value?.uid) return false
      return message.id !== seen.value[thread]
    }),
  )

  /** What the tab badge renders off: something, somewhere in chat, is new. */
  const hasUnread = computed(() => unreadThreads.value.length > 0)

  // --- Subscriptions --------------------------------------------------------
  //
  // One per thread, held for as long as somebody is signed in, because the
  // badge has to be right on every screen and not only on the chat one. They
  // are cheap by construction — see `DataSource.watchLatestMessage`, which
  // reads the top of the thread rather than the thread.

  let stops: Array<() => void> = []

  const unwatchAll = () => {
    stops.forEach((stop) => stop())
    stops = []
  }

  const watchAll = async (memberId: string) => {
    for (const thread of THREADS) {
      try {
        const stop = await data.watchLatestMessage(
          thread,
          (message) => {
            latest.value = { ...latest.value, [thread]: message }
          },
          (error) => {
            // A badge that has stopped updating is not worth taking a screen
            // down for, and there is nothing the member could do about it. The
            // dot simply stops moving; whoever set the project up sees why.
            console.error(`[chat] the ${thread} badge listener stopped`, error)
          },
        )

        // Signed out while this was resolving — nothing else would ever stop
        // the listener — or signed in as somebody else, whose threads the
        // next run of this is already subscribing to.
        if (store.member.value?.id !== memberId) stop()
        else stops.push(stop)
      } catch (cause) {
        // Subscribing failed outright: a refused read, or a thread path that
        // could not be resolved. Same trade as a listener that stops — no dot
        // rather than no app.
        console.error(`[chat] could not watch the ${thread} thread`, cause)
      }
    }
  }

  /**
   * Follow the signed-in member.
   *
   * Keyed on the member rather than on the auth user, because every
   * implementation resolves a thread path through the member document: a
   * subscription opened for somebody who has signed in but not yet redeemed a
   * code is a read with nowhere to point. Signing out drops the listeners and
   * the badge with them, so the next member in does not inherit the last one's
   * dot.
   */
  watch(
    () => store.member.value?.id ?? null,
    (memberId) => {
      unwatchAll()
      latest.value = {}
      if (!memberId) return
      seen.value = readSeen()
      void watchAll(memberId)
    },
    { immediate: true },
  )

  // The scope only ever goes away with the page, or with an HMR edit to this
  // module. The latter is what this is for: without it every edit leaves the
  // previous build's listeners open alongside their replacement.
  onScopeDispose(() => {
    unwatchAll()
    stopListening()
  })

  return { hasUnread, unreadThreads }
}

type ChatUnread = ReturnType<typeof buildChatUnread>

/**
 * The unread state behind the Chat tab, built once per app.
 *
 * Memoised on the Nuxt instance for the same reason `useAppStore` is: both the
 * tab bar and the side rail ask for it, on every screen, and each caller
 * building its own would open its own pair of listeners. The detached
 * `effectScope` keeps the graph alive when whichever component asked first
 * unmounts.
 */
export const useChatUnread = (): ChatUnread => {
  const nuxtApp = useNuxtApp()
  const existing = nuxtApp.$chatUnread as ChatUnread | undefined
  if (existing) return existing

  const scope = effectScope(true)
  const unread = scope.run(buildChatUnread)!
  nuxtApp.$chatUnread = unread
  import.meta.hot?.dispose(() => scope.stop())
  return unread
}

declare module '#app' {
  interface NuxtApp {
    $chatUnread?: ChatUnread
  }
}
