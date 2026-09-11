<script setup lang="ts">
// 28 · Coach DM
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
import type { PendingAttachment } from '~/lib/attachments'

const data = useDataSourceClient()
const store = useAppStore()
const messages = ref<ChatMessageView[]>([])

/** Everyone else with the composer open, live. See `DataSource.watchTyping`. */
const typing = ref<TypingPeer[]>([])

/**
 * Whose thread this is, from the cohort document rather than a fixture.
 *
 * Every cohort has its own coach denormalised onto it, so the header is the
 * name of the person actually on the other end of this thread. The fallbacks
 * cover the moment before the cohort has loaded, and a cohort document with no
 * coach block — a generic title beats a blank header bar.
 */
const coachName = computed(() => store.coach.value?.name?.trim() || 'Your coach')
const coachTitle = computed(() => store.coach.value?.title?.trim() || 'Direct message')

/** Set once a write has failed for want of room. See `DataSource.storageFull`. */
const storageFull = ref(false)

/**
 * The thread, live — so the coach's reply lands here rather than on the next
 * reload. See `DataSource.watchMessages`, and the cohort thread, which does
 * exactly the same thing.
 */
let unwatch: (() => void) | null = null
let unwatchTyping: (() => void) | null = null
let unmounted = false

onMounted(async () => {
  const stop = await data.watchMessages(
    'coach',
    (next) => {
      messages.value = next
    },
    (error) => {
      console.error('[chat] the live thread stopped', error)
    },
  )

  if (unmounted) stop()
  else unwatch = stop

  const stopTyping = await data.watchTyping(
    'coach',
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
  data.setTyping('coach', false)
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

  const sent = await data.sendMessage('coach', payload.text, attachments, payload.replyTo)
  // The watcher has usually delivered this already. See the cohort thread.
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
    apply(await data.toggleReaction('coach', payload.messageId, payload.emoji))
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
  <div class="dm-page relative h-full flex flex-col [background:var(--paper)]">
    <div class="dm-page__main flex-1 min-h-0 flex flex-col lg:w-full lg:max-w-(--focus-max) lg:m-[0_auto] lg:p-[32px_40px_8px]">
      <ScreenHeader :title="coachName" />
      <ChatView
        :messages="messages"
        thread="coach"
        :typing="typing"
        eyebrow="Direct message"
        :title="coachName"
        :subtitle="coachTitle"
        placeholder="Message your coach…"
        class="dm-page__view [&_.chat__composer]:pb-[calc(16px+env(safe-area-inset-bottom))] [&_.chat__header]:hidden"
        :storage-full="storageFull"
        :send="send"
        @react="react"
        @typing="(on: boolean) => data.setTyping('coach', on)"
      />
    </div>
  </div>
</template>
