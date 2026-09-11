<script setup lang="ts">
// 20 · Cohort Chat
definePageMeta({ layout: false })

import { useDataSourceClient } from '~/lib/datasource'
import type {
  ChatAttachment,
  ChatMessageView,
  ChatReaction,
  ChatReplyRef,
  TypingPeer,
} from '~/data/types'
import { toggledReactions } from '~/lib/chat'
import { trustedTimestamp } from '~/lib/time'
import type { PendingAttachment } from '~/lib/attachments'

const data = useDataSourceClient()
const store = useAppStore()
const messages = ref<ChatMessageView[]>([])

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
 * Upload first, then send.
 *
 * The composer hands over decoded files, not stored ones: documents cap at
 * 1 MiB, so the bytes have to reach Cloud Storage before a message can
 * reference them. Uploading in parallel keeps a four-photo send from taking
 * four round trips.
 *
 * Anything that throws here reaches the composer, which keeps the draft and
 * shows the reason. So the messages thrown are ones a member can read.
 */
const send = async (payload: {
  text: string
  attachments: PendingAttachment[]
  replyTo: ChatReplyRef | null
}) => {
  const attachments = await Promise.all(
    payload.attachments.map((item) =>
      item.kind === 'image'
        ? data
            .uploadImage(item.image, 'chat')
            .then(
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
        : data.uploadAttachment(item.file),
    ),
  )

  const sent = await data.sendMessage('cohort', payload.text, attachments, payload.replyTo)
  // Usually already here: the watcher sees this member's own write as it is
  // made. Appending it is for the implementation that cannot — the polled one,
  // where the next tick is seconds away and the bubble should not be.
  if (!messages.value.some((m) => m.id === sent.id)) {
    messages.value = [...messages.value, sent]
  }
  // Not awaited, and deliberately outside what the composer treats as the
  // send. The message has landed by this line; a device-space check that
  // failed must not be reported to the member as a message that did not go,
  // and must not put their draft back in the box underneath it.
  data
    .storageFull()
    .then((full) => {
      storageFull.value = full
    })
    .catch(() => {
      // Not knowing how full the device is changes nothing that just happened.
    })
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
const editMessage = async (payload: { messageId: string; text: string }) => {
  const before = messages.value.find((m) => m.id === payload.messageId)
  if (!before) return

  const apply = (message: ChatMessageView) => {
    messages.value = messages.value.map((m) => (m.id === payload.messageId ? message : m))
  }

  apply({ ...before, text: payload.text, editedAt: trustedTimestamp() })

  try {
    apply(await data.editMessage('cohort', payload.messageId, payload.text))
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
        :messages="messages"
        thread="cohort"
        :typing="typing"
        eyebrow="Private group"
        :title="title"
        :subtitle="subtitle"
        placeholder="Say something to the group…"
        :storage-full="storageFull"
        :send="send"
        :edit="editMessage"
        @react="react"
        @typing="(on: boolean) => data.setTyping('cohort', on)"
      />
    </div>
  </div>
</template>
