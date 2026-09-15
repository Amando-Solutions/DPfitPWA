<script setup lang="ts">
// 27 · Notifications
definePageMeta({ layout: 'app' })

const store = useAppStore()
const NuxtLink = resolveComponent('NuxtLink')

const hasUnread = computed(() => store.unreadNotifications.value > 0)

/**
 * What was unread when it reached this screen, for as long as the screen is open.
 *
 * Opening the inbox is the read receipt (see `receipt`), and the receipt lands
 * a round trip later. Drawing unread off `read` meant every highlight went out
 * that round trip after the screen opened, so the member never saw which lines
 * were new. The highlight follows this set instead, and it only grows.
 */
const fresh = ref(new Set<string>())

/**
 * A receipt in flight, and whether the last one failed.
 *
 * Receipts are automatic, so "Mark all read" is only offered once one has
 * failed. Offering it all the time put a button on screen that went away on its
 * own a moment later, every time the inbox opened.
 */
const receipting = ref(false)
const receiptFailed = ref(false)

/**
 * Mark everything on screen read.
 *
 * Runs on open and again whenever something new arrives while the inbox is
 * up, since both lists are live. Not while the page is hidden: a mention that
 * lands while the member is in another app has not been seen, and marking it
 * read would put the bell out before they had looked.
 */
const receipt = async () => {
  if (receipting.value || document.hidden) return
  const unread = store.notifications.value.filter((n) => !n.read)
  if (!unread.length) return

  const next = new Set(fresh.value)
  unread.forEach((n) => next.add(n.id))
  fresh.value = next

  receipting.value = true
  let landed = false
  try {
    await store.markAllNotificationsRead()
    receiptFailed.value = false
    landed = true
  } catch (cause) {
    receiptFailed.value = true
    console.error('[inbox] could not mark notifications read', cause)
  } finally {
    receipting.value = false
  }
  // Something arrived during the write. Only after a success, or a write that
  // keeps failing would retry in a tight loop.
  if (landed) void receipt()
}

watch(() => store.unreadNotifications.value, () => void receipt(), { immediate: true })

const onVisibility = () => void receipt()
onMounted(() => document.addEventListener('visibilitychange', onVisibility))
onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisibility))

const accentFor = (type: string) => (type === 'coach' ? 'orange' : 'rose')
</script>

<template>
  <div class="inbox pt-(--screen-pad-top) px-5 pb-0 [&_.inbox__title]:mt-1.25 [&_.inbox__title]:mx-0 [&_.inbox__title]:mb-0 [&_.inbox__title]:font-display [&_.inbox__title]:font-black [&_.inbox__title]:text-[24px] [&_.inbox__title]:leading-[1.08] [&_.inbox__title]:tracking-[-0.48px] [&_.inbox__title]:text-ink [&_.inbox__sub]:mt-0.75 [&_.inbox__sub]:mx-0 [&_.inbox__sub]:mb-0 [&_.inbox__sub]:text-[13.5px] [&_.inbox__sub]:leading-[1.45] [&_.inbox__sub]:text-soft lg:p-0 lg:[&_.inbox__title]:text-[30px] lg:[&_.inbox__sub]:text-[15px]">
    <ScreenIntro
      eyebrow="Inbox"
      title="Notifications"
      subtitle="Announcements, mentions and replies."
      class="inbox__header mb-3"
    >
      <template v-if="receiptFailed && hasUnread" #actions>
        <button
          class="inbox__mark shrink-0 p-0 text-[12.5px] font-bold text-rose disabled:opacity-45"
          :disabled="receipting"
          @click="receipt"
        >
          {{ receipting ? 'Marking…' : 'Mark all read' }}
        </button>
      </template>
    </ScreenIntro>

    <!-- `inert` only while the member's own "Mark all read" is in flight. The
         automatic receipts run on every arrival, and freezing the list for each
         of those would eat the tap on the mention that just came in. -->
    <div
      class="inbox__list mt-3 flex flex-col gap-2.5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3.5"
      :inert="receiptFailed && receipting"
    >
      <p
        v-if="!store.notifications.value.length"
        class="inbox__empty m-0 py-6 text-center text-[13.5px] text-soft lg:col-span-2"
      >
        Nothing yet. Mentions, replies and announcements from your coach land here.
      </p>

      <component
        :is="item.to ? NuxtLink : 'article'"
        v-for="item in store.notifications.value"
        :key="item.id"
        :to="item.to ?? undefined"
        class="note flex gap-3 p-4 bg-raised border border-hairline rounded-card filter-(--drop-md) [&.note--unread]:border-orange-ring [&.note--link]:transition-colors [&.note--link]:hover:bg-fill-subtle"
        :class="{ 'note--unread': fresh.has(item.id) || !item.read, 'note--link': item.to }"
      >
        <span class="note__icon w-9.5 h-9.5 rounded-pill grid place-items-center shrink-0 [&.note__icon--orange]:bg-orange-soft [&.note__icon--orange]:text-orange-text [&.note__icon--rose]:bg-rose-soft [&.note__icon--rose]:text-rose" :class="`note__icon--${accentFor(item.type)}`">
          <AppIcon :name="item.icon" :size="17" :stroke="2" />
        </span>
        <div class="note__body flex-1 min-w-0">
          <div class="note__top flex items-center gap-1.75">
            <span class="note__kind text-[11.5px] [&.note__kind--orange]:text-orange-text [&.note__kind--rose]:text-rose" :class="`note__kind--${accentFor(item.type)}`">
              {{ item.title }}
            </span>
            <span v-if="fresh.has(item.id) || !item.read" class="note__dot w-1.5 h-1.5 rounded-pill bg-rose-fill shrink-0" />
          </div>
          <p class="note__text mt-1 mx-0 mb-0 text-[13.5px] leading-[1.45] text-ink wrap-break-word">{{ item.body }}</p>
          <span class="note__time block mt-1.5 text-[11.5px] text-soft">{{ item.timeLabel }}</span>
        </div>
        <AppIcon v-if="item.to" name="chevronRight" :size="16" class="note__go self-center shrink-0 text-soft" />
      </component>
    </div>

    <NuxtLink to="/home/announcements" class="inbox__deck flex items-center gap-2 mt-3.5 py-3.5 px-4 rounded-card shadow-[inset_0_0_0_1.5px_var(--hairline)] text-[13.5px] font-semibold text-ink [&_span]:flex-1 lg:max-w-[420px] lg:mt-4.5">
      <AppIcon name="info" :size="16" />
      <span>See the full announcement deck</span>
      <AppIcon name="chevronRight" :size="16" />
    </NuxtLink>
  </div>
</template>
