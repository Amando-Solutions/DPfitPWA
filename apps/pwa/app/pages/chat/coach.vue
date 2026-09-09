<script setup lang="ts">
// 28 · Coach DM
definePageMeta({ layout: false })

import { useDataSourceClient } from '~/lib/datasource'
import type { ChatAttachment, ChatMessageView } from '~/data/types'
import type { PendingAttachment } from '~/lib/attachments'

const data = useDataSourceClient()
const store = useAppStore()
const messages = ref<ChatMessageView[]>([])

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

onMounted(async () => {
  messages.value = await data.listMessages('coach')
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
    await data.sendMessage('coach', payload.text, attachments),
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
  <div class="dm-page relative h-full flex flex-col [background:var(--paper)]">
    <div class="dm-page__main flex-1 min-h-0 flex flex-col lg:w-full lg:max-w-(--focus-max) lg:m-[0_auto] lg:p-[32px_40px_8px]">
      <ScreenHeader :title="coachName" />
      <ChatView
        :messages="messages"
        eyebrow="Direct message"
        :title="coachName"
        :subtitle="coachTitle"
        placeholder="Message your coach…"
        class="dm-page__view [&_.chat__composer]:pb-[calc(16px+env(safe-area-inset-bottom))] [&_.chat__header]:hidden"
        :storage-full="storageFull"
        :send="send"
        @react="react"
      />
    </div>
  </div>
</template>
