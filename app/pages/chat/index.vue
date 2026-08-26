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
  <div class="chat-page [position:relative] [height:100%] [display:flex] [flex-direction:column] [background:var(--paper)] lg:[flex-direction:row]">
    <AppNav />

    <div class="chat-page__main [flex:1] [min-height:0] [display:flex] [flex-direction:column] lg:[min-width:0] lg:[width:100%] lg:[max-width:var(--focus-max)] lg:[margin:0_auto] lg:[padding:32px_40px_0]">
      <ChatView
        :messages="messages"
        eyebrow="Private group"
        :title="cohort.name"
        :subtitle="`Coach and ${cohort.memberCount - 1} members`"
        placeholder="Say something to the group…"
        dm-link
        :storage-full="storageFull"
        @send="send"
        @react="react"
      />
    </div>
  </div>
</template>
