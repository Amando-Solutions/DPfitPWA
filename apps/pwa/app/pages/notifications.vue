<script setup lang="ts">
// 27 · Notifications
definePageMeta({ layout: 'app' })

const store = useAppStore()

const hasUnread = computed(() => store.unreadNotifications.value > 0)

// Opening the inbox is the read receipt for whatever is on screen.
onMounted(() => {
  store.notifications.value.forEach((n) => {
    if (!n.read) store.markNotificationRead(n.id)
  })
})

const accentFor = (type: string) => (type === 'coach' ? 'orange' : 'rose')
</script>

<template>
  <div class="inbox pt-(--screen-pad-top) px-5 pb-0 [&_.inbox__title]:mt-1.25 [&_.inbox__title]:mx-0 [&_.inbox__title]:mb-0 [&_.inbox__title]:font-display [&_.inbox__title]:font-black [&_.inbox__title]:text-[24px] [&_.inbox__title]:leading-[1.08] [&_.inbox__title]:tracking-[-0.48px] [&_.inbox__title]:text-ink [&_.inbox__sub]:mt-0.75 [&_.inbox__sub]:mx-0 [&_.inbox__sub]:mb-0 [&_.inbox__sub]:text-[13.5px] [&_.inbox__sub]:leading-[1.45] [&_.inbox__sub]:text-soft lg:p-0 lg:[&_.inbox__title]:text-[30px] lg:[&_.inbox__sub]:text-[15px]">
    <ScreenIntro
      eyebrow="Inbox"
      title="Notifications"
      subtitle="Announcements, calls and coach updates."
      class="inbox__header mb-3"
    >
      <template v-if="hasUnread" #actions>
        <button class="inbox__mark shrink-0 p-0 text-[12.5px] font-bold text-rose" @click="store.markAllNotificationsRead()">
          Mark all read
        </button>
      </template>
    </ScreenIntro>

    <div class="inbox__list mt-3 flex flex-col gap-2.5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3.5">
      <article
        v-for="item in store.notifications.value"
        :key="item.id"
        class="note flex gap-3 p-4 bg-raised border border-hairline rounded-card filter-(--drop-md) [&.note--unread]:border-orange-ring"
        :class="{ 'note--unread': !item.read }"
      >
        <span class="note__icon w-9.5 h-9.5 rounded-pill grid place-items-center shrink-0 [&.note__icon--orange]:bg-orange-soft [&.note__icon--orange]:text-orange-text [&.note__icon--rose]:bg-rose-soft [&.note__icon--rose]:text-rose" :class="`note__icon--${accentFor(item.type)}`">
          <AppIcon :name="item.icon" :size="17" :stroke="2" />
        </span>
        <div class="note__body flex-1 min-w-0">
          <div class="note__top flex items-center gap-1.75">
            <span class="note__kind text-[11.5px] [&.note__kind--orange]:text-orange-text [&.note__kind--rose]:text-rose" :class="`note__kind--${accentFor(item.type)}`">
              {{ item.title }}
            </span>
            <span v-if="!item.read" class="note__dot w-1.5 h-1.5 rounded-pill bg-rose-fill shrink-0" />
          </div>
          <p class="note__text mt-1 mx-0 mb-0 text-[13.5px] leading-[1.45] text-ink">{{ item.body }}</p>
          <span class="note__time block mt-1.5 text-[11.5px] text-soft">{{ item.timeLabel }}</span>
        </div>
      </article>
    </div>

    <NuxtLink to="/home/announcements" class="inbox__deck flex items-center gap-2 mt-3.5 py-3.5 px-4 rounded-card shadow-[inset_0_0_0_1.5px_var(--hairline)] text-[13.5px] font-semibold text-ink [&_span]:flex-1 lg:max-w-[420px] lg:mt-4.5">
      <AppIcon name="info" :size="16" />
      <span>See the full announcement deck</span>
      <AppIcon name="chevronRight" :size="16" />
    </NuxtLink>
  </div>
</template>
