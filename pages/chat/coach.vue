<script setup lang="ts">
// 28 · Coach DM
definePageMeta({ layout: false })

import { coach } from '~/data/program'
import { useDataSourceClient } from '~/lib/datasource'
import type { ChatAttachment, ChatMessage } from '~/data/types'

const data = useDataSourceClient()
const messages = ref<ChatMessage[]>([])

/** Set once a write has failed for want of room. See `DataSource.storageFull`. */
const storageFull = ref(false)

onMounted(async () => {
  messages.value = await data.listMessages('coach')
})

const send = async (payload: { text: string; attachments: ChatAttachment[] }) => {
  messages.value = [
    ...messages.value,
    await data.sendMessage('coach', payload.text, payload.attachments),
  ]
  storageFull.value = await data.storageFull()
}

/** Hold a message to react; the data source hands back the new counts. */
const react = async (payload: { messageId: string; emoji: string }) => {
  const reactions = await data.toggleReaction('coach', payload.messageId, payload.emoji)
  messages.value = messages.value.map((m) =>
    m.id === payload.messageId ? { ...m, reactions } : m,
  )
}
</script>

<template>
  <div class="dm-page [position:relative] [height:100%] [display:flex] [flex-direction:column] [background:var(--paper)]">
    <div class="dm-page__main [flex:1] [min-height:0] [display:flex] [flex-direction:column] lg:[width:100%] lg:[max-width:var(--focus-max)] lg:[margin:0_auto] lg:[padding:32px_40px_8px]">
      <ScreenHeader :title="coach.name" />
      <ChatView
        :messages="messages"
        eyebrow="Direct message"
        :title="coach.name"
        :subtitle="coach.title"
        placeholder="Message your coach…"
        class="dm-page__view [&_.chat__composer]:[padding-bottom:calc(16px_+_env(safe-area-inset-bottom))] [&_.chat__header]:[display:none]"
        :storage-full="storageFull"
        @send="send"
        @react="react"
      />
    </div>
  </div>
</template>
