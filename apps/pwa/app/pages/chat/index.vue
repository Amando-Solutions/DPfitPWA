<script setup lang="ts">
// 20 · Cohort Chat
definePageMeta({ layout: false })

import { useDataSourceClient } from '~/lib/datasource'
import type {
  ChatMention,
  ChatMessageView,
  ChatReaction,
  TypingPeer,
} from '~/data/types'
import type { OutgoingPayload } from '~/composables/useChatOutbox'
import { toggledReactions, type MentionCandidate } from '~/lib/chat'
import { readThreadCache, writeThreadCache } from '~/lib/chat-cache'
import { trustedTimestamp } from '~/lib/time'

const data = useDataSourceClient()
const store = useAppStore()
const route = useRoute()
const outbox = useChatOutbox('cohort')

/**
 * The message a notification was tapped for, from `?message=`.
 *
 * Left in the URL once used. Reloading on it lands on the same message again,
 * which is what the address says, and nothing else reads it.
 */
const focusMessage = computed(() =>
  typeof route.query.message === 'string' ? route.query.message : '',
)
/**
 * Whose reading of the thread this is, for the on-disk copy below.
 *
 * The store has the member by the time this screen can be reached — the route
 * that leads here is gated on it — so this is read once rather than watched.
 */
const viewerUid = computed(() => store.member.value?.id ?? '')

/**
 * The thread as it was last seen, drawn before anything is fetched.
 *
 * `ref([])` is what made opening this screen a blank one: the live listener
 * cannot deliver until the member has been read, the thread resolved and the
 * query opened, and until then there was nothing on screen at all — for a
 * conversation that had been on this device since the last time it was read.
 * Seeded synchronously, so the first paint already has the thread in it; the
 * listener replaces it wholesale a moment later, with the same messages plus
 * whatever has been said since.
 *
 * It is also what the screen falls back to with no connection. Firestore's own
 * cache answers offline too, and answers more fully, but it answers a tick
 * later — and if the member document itself cannot be read, not at all.
 */
const messages = ref<ChatMessageView[]>(readThreadCache('cohort', viewerUid.value))

/**
 * What the screen draws: the thread, with the member's own messages that have
 * not reached it slotted in — photos still uploading, and sends that failed.
 *
 * Kept apart from `messages` rather than mixed into it, because `messages` is
 * what goes to disk and what the live listener replaces wholesale. A copy
 * carrying four decoded photos has no business in the first, and would be
 * wiped by the second on the next delivery. See `useChatOutbox`.
 */
const thread = computed(() => outbox.merge(messages.value))

/**
 * Whether the live thread has delivered yet.
 *
 * Until it has, what is on screen is the copy restored from disk, and the view
 * treats it as the placeholder it is — see `ChatView`'s `live` prop. It never
 * goes back to false: a listener that stops leaves the last real thread up,
 * which is still the thread.
 */
const live = ref(false)

/** Everyone else with the composer open, live. See `DataSource.watchTyping`. */
const typing = ref<TypingPeer[]>([])

/** Set once a write has failed for want of room. See `DataSource.storageFull`. */
const storageFull = ref(false)

/**
 * The thread, live.
 *
 * A group chat that is read once on mount is a group chat where everyone else
 * is silent until you reload, so this subscribes instead: the data source
 * pushes the whole thread down on every change to it, including this member's
 * own sends. See `DataSource.watchMessages`.
 */
let unwatch: (() => void) | null = null
let unwatchTyping: (() => void) | null = null
let unmounted = false

onMounted(async () => {
  // Not awaited with the subscription: the thread is what the member came for,
  // and a slow count should not hold the first message back. It never throws.
  store.refreshCohortMemberCount()

  const stop = await data.watchMessages(
    'cohort',
    (next) => {
      messages.value = next
      live.value = true
      outbox.settle(next)
      // Kept as it arrives rather than on the way out: the screen can be left
      // by a route change, a closed tab or a killed app, and only the first of
      // those would ever reach an unmount hook.
      writeThreadCache('cohort', viewerUid.value, next)
    },
    (error) => {
      // The listener is over, not retrying. Whatever is already on screen
      // stays there — a thread that has stopped updating is still worth
      // reading, and the reason belongs where whoever set the project up
      // will see it.
      console.error('[chat] the live thread stopped', error)
    },
  )

  // The screen can be left before the subscription resolves — a member who
  // taps straight back out. Nothing would ever stop this listener otherwise.
  if (unmounted) stop()
  else unwatch = stop

  const stopTyping = await data.watchTyping(
    'cohort',
    (peers) => {
      typing.value = peers
    },
    (error) => {
      // Losing this listener leaves the indicator permanently empty, which
      // is the right way for it to fail: nobody is worse off for not knowing
      // that someone is typing. Logged, and otherwise left alone.
      console.error('[chat] the typing listener stopped', error)
    },
  )

  if (unmounted) stopTyping()
  else unwatchTyping = stopTyping
})

onBeforeUnmount(() => {
  unmounted = true
  unwatch?.()
  unwatch = null
  unwatchTyping?.()
  unwatchTyping = null
  // The composer emits this on its way out too. Repeated here because leaving
  // the screen is the one exit that is certain, and a marker nobody clears is
  // somebody the cohort sees typing a message that will never arrive.
  data.setTyping('cohort', false)
})

/**
 * The thread's name, from the member's own membership.
 *
 * The member document records which cohort they bought a seat in and carries
 * its name denormalised, so this needs no second read; the cohort document is
 * the fallback for a member whose copy predates that field, and the generic
 * last resort covers a header that would otherwise be blank.
 */
const title = computed(
  () => store.member.value?.cohortName || store.cohort.value?.name || 'Cohort chat',
)

/**
 * "Coach and 12 members", counted rather than declared.
 *
 * This used to read `cohort.memberCount - 1` off a fixture, which is why every
 * cohort was told it had 47 of them, and then the length of the leaderboard
 * page, which is capped and read once at boot. It is now a count of the roster
 * taken when this screen opens — see `DataSource.countCohortMembers` — because
 * the line is really answering "how many people will read what I type", and
 * that is not a number to be casual about.
 *
 * The coach is not one of them: they are the cohort's `coach`, not a member
 * document, so the count is not reduced by one to make room for them.
 */
const subtitle = computed(() => {
  const count = store.cohortMemberCount.value
  return `Coach and ${count} ${count === 1 ? 'member' : 'members'}`
})

/**
 * Who can be named with an `@` in here.
 *
 * The board projection is the roster, and it is the only list of this cohort a
 * member is allowed to read — see `LeaderboardEntryDoc`, which exists precisely
 * so that "who is in my cohort" does not require read access to everyone's
 * email address and injuries. Only the three fields a name needs are taken off
 * it; the session counts stay out of a feature that has no business showing
 * them, least of all in a cohort whose board has not been revealed yet.
 *
 * Already in the store from boot, so this costs nothing. The coach goes first
 * because they are the one person in here everybody has a reason to call; the
 * rest are alphabetical, since the order sessions ranks them in means nothing
 * when you are looking for a name.
 *
 * The member themselves is left out. Naming yourself does nothing to anyone.
 */
const mentionable = computed<MentionCandidate[]>(() => {
  const coach = store.coach.value
  const people: MentionCandidate[] = coach?.uid
    ? [{ uid: coach.uid, name: coach.name, avatarUrl: coach.avatarUrl }]
    : []

  const members = store.leaderboard.value
    // A member with no display name has nothing to be named by: their row is
    // written when they set one, so this is somebody mid-setup.
    .filter((row) => !row.isSelf && row.name.trim())
    .map((row) => ({ uid: row.memberId, name: row.name, avatarUrl: row.avatarUrl }))
    .sort((a, b) => a.name.localeCompare(b.name))

  for (const member of members) {
    if (!people.some((person) => person.uid === member.uid)) people.push(member)
  }
  return people
})

/**
 * Hand the message to the outbox, which draws it and sends it.
 *
 * Uploads, the write, the clock, the tick and "Not sent" all live there — see
 * `useChatOutbox` — because they have to carry on if this screen is left
 * mid-upload, and the next time it is opened has to find them as they were.
 */
const send = (payload: OutgoingPayload) => {
  // Checked once the attempt has settled, which on the device store is the
  // write that could have filled it. Never reported as the message failing:
  // a space check that goes wrong changes nothing that just happened.
  void outbox.send(payload).then(() =>
    data
      .storageFull()
      .then((full) => {
        storageFull.value = full
      })
      .catch(() => {}),
  )
}

/**
 * Rewrite a message, on screen first and in the document behind it.
 *
 * Drawn before it is written, like a reaction and for the same reason: the
 * member is looking at the bubble they just corrected, and a round trip between
 * the tap and the words changing is the whole of what the interaction feels
 * like. The watcher settles the real document a moment later — including the
 * server's `editedAt`, which is the one field this cannot guess.
 *
 * A refusal puts the old words back and rethrows, so the composer can hand the
 * member their correction along with the reason it did not go. Rethrowing is
 * the point: swallowing it here would leave the thread showing an edit the
 * server never took.
 */
const editMessage = async (payload: {
  messageId: string
  text: string
  mentions: ChatMention[]
}) => {
  const before = messages.value.find((m) => m.id === payload.messageId)
  if (!before) return

  const apply = (message: ChatMessageView) => {
    messages.value = messages.value.map((m) => (m.id === payload.messageId ? message : m))
  }

  apply({
    ...before,
    text: payload.text,
    mentions: payload.mentions,
    editedAt: trustedTimestamp(),
  })

  try {
    apply(
      await data.editMessage('cohort', payload.messageId, payload.text, payload.mentions),
    )
  } catch (cause) {
    apply(before)
    throw cause
  }
}

/**
 * Hold a message to react.
 *
 * Drawn before it is written. The toggle is decided by the chip the member
 * tapped and nothing else — see `toggledReactions` — so waiting on a two
 * document transaction and its confirming read before moving the count put a
 * visible beat between the tap and anything happening. The write still settles
 * the real counts, including whatever anyone else did in the meantime, and the
 * chips move to those when it lands.
 */
const react = async (payload: { messageId: string; emoji: string }) => {
  const before = messages.value.find((m) => m.id === payload.messageId)
  if (!before) return

  const apply = (reactions: ChatReaction[]) => {
    messages.value = messages.value.map((m) =>
      m.id === payload.messageId ? { ...m, reactions } : m,
    )
  }

  apply(toggledReactions(before.reactions, payload.emoji))

  try {
    apply(await data.toggleReaction('cohort', payload.messageId, payload.emoji))
  } catch (cause) {
    // Put the chip back where it was. A reaction is not worth a message across
    // the screen, but leaving a count the server never took is worse than the
    // pause this replaced: the member would go on believing they had reacted.
    apply(before.reactions)
    console.error('[chat] the reaction did not stick', cause)
  }
}
</script>

<template>
  <div class="chat-page relative h-full flex flex-col bg-surface lg:flex-row">
    <AppNav />

    <div class="chat-page__main flex-1 min-h-0 flex flex-col lg:min-w-0 lg:w-full lg:max-w-(--focus-max) lg:my-0 lg:mx-auto lg:pt-8 lg:px-10 lg:pb-0">
      <ChatView
        :messages="thread"
        thread="cohort"
        :typing="typing"
        eyebrow="Private group"
        :title="title"
        :subtitle="subtitle"
        placeholder="Say something to the group…"
        :mentionable="mentionable"
        :live="live"
        :focus-message="focusMessage"
        :storage-full="storageFull"
        :send="send"
        :edit="editMessage"
        @react="react"
        @retry="outbox.retry"
        @discard="outbox.discard"
        @typing="(on: boolean) => data.setTyping('cohort', on)"
        @seen="store.markChatMessagesSeen"
      />
    </div>
  </div>
</template>
