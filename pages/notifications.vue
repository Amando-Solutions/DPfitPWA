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
  <div class="inbox">
    <ScreenIntro
      eyebrow="Inbox"
      title="Notifications"
      subtitle="Announcements, calls and coach updates."
      class="inbox__header"
    >
      <template v-if="hasUnread" #actions>
        <button class="inbox__mark" @click="store.markAllNotificationsRead()">
          Mark all read
        </button>
      </template>
    </ScreenIntro>

    <div class="inbox__list">
      <article
        v-for="item in store.notifications.value"
        :key="item.id"
        class="note"
        :class="{ 'note--unread': !item.read }"
      >
        <span class="note__icon" :class="`note__icon--${accentFor(item.type)}`">
          <AppIcon :name="item.icon" :size="17" :stroke="2" />
        </span>
        <div class="note__body">
          <div class="note__top">
            <span class="note__kind" :class="`note__kind--${accentFor(item.type)}`">
              {{ item.title }}
            </span>
            <span v-if="!item.read" class="note__dot" />
          </div>
          <p class="note__text">{{ item.body }}</p>
          <span class="note__time data">{{ item.time }}</span>
        </div>
      </article>
    </div>

    <NuxtLink to="/home/announcements" class="inbox__deck">
      <AppIcon name="info" :size="16" />
      <span>See the full announcement deck</span>
      <AppIcon name="chevronRight" :size="16" />
    </NuxtLink>
  </div>
</template>

<style scoped lang="scss">
.inbox {
  padding: var(--screen-pad-top) 20px 0;

  &__header {
    margin-bottom: 12px;
  }

  &__title {
    margin: 5px 0 0;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 24px;
    line-height: 1.08;
    letter-spacing: -0.48px;
    color: var(--ink);
  }

  &__sub {
    margin: 3px 0 0;
    font-size: 13.5px;
    line-height: 1.45;
    color: var(--violet-28);
  }

  &__mark {
    flex-shrink: 0;
    padding: 0;
    font-size: 12.5px;
    font-weight: 700;
    color: var(--rose);
  }

  &__list {
    margin-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  &__deck {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 14px;
    padding: 14px 16px;
    border-radius: var(--radius-card);
    box-shadow: inset 0 0 0 1.5px rgba(36, 27, 46, 0.09);
    font-size: 13.5px;
    font-weight: 600;
    color: var(--ink);

    span {
      flex: 1;
    }
  }
}

.note {
  display: flex;
  gap: 12px;
  padding: 16px;
  background: var(--paper-raised);
  border: 1px solid rgba(36, 27, 46, 0.09);
  border-radius: var(--radius-card);
  filter: drop-shadow(0 4px 7px rgba(36, 27, 46, 0.04));

  &--unread {
    border-color: rgba(232, 163, 61, 0.3);
  }

  &__icon {
    width: 38px;
    height: 38px;
    border-radius: var(--radius-pill);
    display: grid;
    place-items: center;
    flex-shrink: 0;

    &--orange {
      background: rgba(232, 163, 61, 0.2);
      color: var(--orange);
    }
    &--rose {
      background: rgba(200, 30, 92, 0.1);
      color: var(--rose);
    }
  }

  &__body {
    flex: 1;
    min-width: 0;
  }

  &__top {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  &__kind {
    font-family: var(--font-data);
    text-transform: uppercase;
    letter-spacing: 0.85px;
    font-size: 8.5px;
    font-weight: 700;

    &--orange {
      color: var(--orange);
    }
    &--rose {
      color: var(--rose);
    }
  }

  &__dot {
    width: 6px;
    height: 6px;
    border-radius: var(--radius-pill);
    background: var(--rose);
    flex-shrink: 0;
  }

  &__text {
    margin: 4px 0 0;
    font-size: 13.5px;
    line-height: 1.45;
    color: var(--ink);
  }

  &__time {
    display: block;
    margin-top: 6px;
    font-size: 9px;
    letter-spacing: 0.45px;
    color: var(--violet-28);
  }
}

@media (min-width: 1024px) {
  .inbox {
    padding: 0;

    &__title {
      font-size: 30px;
    }

    &__sub {
      font-size: 15px;
    }

    &__list {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: start;
      gap: 14px;
    }

    &__deck {
      max-width: 420px;
      margin-top: 18px;
    }
  }
}
</style>
