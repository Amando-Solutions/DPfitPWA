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
  <div class="inbox [padding:var(--screen-pad-top)_20px_0] [&_.inbox__title]:[margin:5px_0_0] [&_.inbox__title]:[font-family:var(--font-display)] [&_.inbox__title]:[font-weight:900] [&_.inbox__title]:[font-size:24px] [&_.inbox__title]:[line-height:1.08] [&_.inbox__title]:[letter-spacing:-0.48px] [&_.inbox__title]:[color:var(--ink)] [&_.inbox__sub]:[margin:3px_0_0] [&_.inbox__sub]:[font-size:13.5px] [&_.inbox__sub]:[line-height:1.45] [&_.inbox__sub]:[color:var(--violet-28)] lg:[padding:0] lg:[&_.inbox__title]:[font-size:30px] lg:[&_.inbox__sub]:[font-size:15px]">
    <ScreenIntro
      eyebrow="Inbox"
      title="Notifications"
      subtitle="Announcements, calls and coach updates."
      class="inbox__header [margin-bottom:12px]"
    >
      <template v-if="hasUnread" #actions>
        <button class="inbox__mark [flex-shrink:0] [padding:0] [font-size:12.5px] [font-weight:700] [color:var(--rose)]" @click="store.markAllNotificationsRead()">
          Mark all read
        </button>
      </template>
    </ScreenIntro>

    <div class="inbox__list [margin-top:12px] [display:flex] [flex-direction:column] [gap:10px] lg:[display:grid] lg:[grid-template-columns:repeat(2,_minmax(0,_1fr))] lg:[align-items:start] lg:[gap:14px]">
      <article
        v-for="item in store.notifications.value"
        :key="item.id"
        class="note [display:flex] [gap:12px] [padding:16px] [background:var(--paper-raised)] [border:1px_solid_var(--hairline)] [border-radius:var(--radius-card)] [filter:var(--drop-md)] [&.note--unread]:[border-color:var(--orange-ring)]"
        :class="{ 'note--unread': !item.read }"
      >
        <span class="note__icon [width:38px] [height:38px] [border-radius:var(--radius-pill)] [display:grid] [place-items:center] [flex-shrink:0] [&.note__icon--orange]:[background:var(--orange-soft)] [&.note__icon--orange]:[color:var(--orange-text)] [&.note__icon--rose]:[background:var(--rose-soft)] [&.note__icon--rose]:[color:var(--rose)]" :class="`note__icon--${accentFor(item.type)}`">
          <AppIcon :name="item.icon" :size="17" :stroke="2" />
        </span>
        <div class="note__body [flex:1] [min-width:0]">
          <div class="note__top [display:flex] [align-items:center] [gap:7px]">
            <span class="note__kind [font-family:var(--font-data)] [text-transform:uppercase] [letter-spacing:0.85px] [font-size:8.5px] [font-weight:700] [&.note__kind--orange]:[color:var(--orange-text)] [&.note__kind--rose]:[color:var(--rose)]" :class="`note__kind--${accentFor(item.type)}`">
              {{ item.title }}
            </span>
            <span v-if="!item.read" class="note__dot [width:6px] [height:6px] [border-radius:var(--radius-pill)] [background:var(--rose-fill)] [flex-shrink:0]" />
          </div>
          <p class="note__text [margin:4px_0_0] [font-size:13.5px] [line-height:1.45] [color:var(--ink)]">{{ item.body }}</p>
          <span class="note__time data [display:block] [margin-top:6px] [font-size:9px] [letter-spacing:0.45px] [color:var(--violet-28)]">{{ item.timeLabel }}</span>
        </div>
      </article>
    </div>

    <NuxtLink to="/home/announcements" class="inbox__deck [display:flex] [align-items:center] [gap:8px] [margin-top:14px] [padding:14px_16px] [border-radius:var(--radius-card)] [box-shadow:inset_0_0_0_1.5px_var(--hairline)] [font-size:13.5px] [font-weight:600] [color:var(--ink)] [&_span]:[flex:1] lg:[max-width:420px] lg:[margin-top:18px]">
      <AppIcon name="info" :size="16" />
      <span>See the full announcement deck</span>
      <AppIcon name="chevronRight" :size="16" />
    </NuxtLink>
  </div>
</template>
