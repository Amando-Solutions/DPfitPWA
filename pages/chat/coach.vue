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
  <div class="dm-page">
    <div class="dm-page__main">
      <ScreenHeader :title="coach.name" />
      <ChatView
        :messages="messages"
        eyebrow="Direct message"
        :title="coach.name"
        :subtitle="coach.title"
        placeholder="Message your coach…"
        class="dm-page__view"
        :storage-full="storageFull"
        @send="send"
        @react="react"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.dm-page {
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

  // No tab bar on this screen, so the composer shouldn't reserve space for it.
  &__view :deep(.chat__composer) {
    padding-bottom: calc(16px + env(safe-area-inset-bottom));
  }
  // The header already shows the title, so hide the ChatView's own header.
  &__view :deep(.chat__header) {
    display: none;
  }
}

@media (min-width: 1024px) {
  .dm-page__main {
    width: 100%;
    max-width: var(--focus-max);
    margin: 0 auto;
    padding: 32px 40px 8px;
  }
}
</style>
