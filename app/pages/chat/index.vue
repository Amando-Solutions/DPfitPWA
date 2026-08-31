<script setup lang="ts">
// 20 · Cohort Chat
definePageMeta({ layout: false })

import { cohort } from '~/data/program'
import { useDataSourceClient } from '~/lib/datasource'
import type { ChatAttachment, ChatMessageView } from '~/data/types'
import type { PendingAttachment } from '~/lib/attachments'

const data = useDataSourceClient()
const messages = ref<ChatMessageView[]>([])

/** Set once a write has failed for want of room. See `DataSource.storageFull`. */
const storageFull = ref(false)

onMounted(async () => {
  messages.value = await data.listMessages('cohort')
})

/**
 * Upload first, then send.
 *
 * The composer hands over decoded files, not stored ones: documents cap at
 * 1 MiB, so the bytes have to reach Cloud Storage before a message can
 * reference them. Uploading in parallel keeps a four-photo send from taking
 * four round trips.
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
        :title="cohort.name"
        :subtitle="`Coach and ${cohort.memberCount - 1} members`"
        placeholder="Say something to the group…"
        :storage-full="storageFull"
        @send="send"
        @react="react"
      />
    </div>
  </div>
</template>
