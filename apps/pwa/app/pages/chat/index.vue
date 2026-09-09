<script setup lang="ts">
// 20 · Cohort Chat
definePageMeta({ layout: false })

import { useDataSourceClient } from '~/lib/datasource'
import type { ChatAttachment, ChatMessageView } from '~/data/types'
import type { PendingAttachment } from '~/lib/attachments'

const data = useDataSourceClient()
const store = useAppStore()
const messages = ref<ChatMessageView[]>([])

/** Set once a write has failed for want of room. See `DataSource.storageFull`. */
const storageFull = ref(false)

onMounted(async () => {
  messages.value = await data.listMessages('cohort')
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
 * This used to read `cohort.memberCount - 1` off the same fixture, which is why
 * every cohort was told it had 47 of them. See `cohortMemberCount`, and note
 * that the coach is not one of them: they are the cohort's `coach`, not a
 * member document, so the count is not reduced by one to make room for them.
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
const send = async (payload: { text: string; attachments: PendingAttachment[] }) => {
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

  messages.value = [
    ...messages.value,
    await data.sendMessage('cohort', payload.text, attachments),
  ]
  storageFull.value = await data.storageFull()
}

/** Hold a message to react; the data source hands back the new counts. */
const react = async (payload: { messageId: string; emoji: string }) => {
  const reactions = await data.toggleReaction('cohort', payload.messageId, payload.emoji)
  messages.value = messages.value.map((m) =>
    m.id === payload.messageId ? { ...m, reactions } : m,
  )
}
</script>

<template>
  <div class="chat-page relative h-full flex flex-col bg-surface lg:flex-row">
    <AppNav />

    <div class="chat-page__main flex-1 min-h-0 flex flex-col lg:min-w-0 lg:w-full lg:max-w-(--focus-max) lg:my-0 lg:mx-auto lg:pt-8 lg:px-10 lg:pb-0">
      <ChatView
        :messages="messages"
        eyebrow="Private group"
        :title="title"
        :subtitle="subtitle"
        placeholder="Say something to the group…"
        :storage-full="storageFull"
        :send="send"
        @react="react"
      />
    </div>
  </div>
</template>
