<script setup lang="ts">
// 20 · Cohort Chat
definePageMeta({ layout: false })

import { cohort } from '~/data/program'
import { useDataSourceClient } from '~/lib/datasource'
import type { ChatAttachment, ChatMessage } from '~/data/types'

const data = useDataSourceClient()
const messages = ref<ChatMessage[]>([])

/** Set once a write has failed for want of room. See `DataSource.storageFull`. */
const storageFull = ref(false)

onMounted(async () => {
  messages.value = await data.listMessages('cohort')
})

const send = async (payload: { text: string; attachments: ChatAttachment[] }) => {
  messages.value = [
    ...messages.value,
    await data.sendMessage('cohort', payload.text, payload.attachments),
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
  <div class="chat-page">
    <AppNav />

    <div class="chat-page__main">
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

<style scoped lang="scss">
.chat-page {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--paper);

  &__main {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
}

@media (min-width: 1024px) {
  .chat-page {
    flex-direction: row;

    &__main {
      min-width: 0;
      width: 100%;
      max-width: var(--focus-max);
      margin: 0 auto;
      padding: 32px 40px 0;
    }
  }
}
</style>
