<script setup lang="ts">
import type { ChatMessage } from '~/data/types'

const props = withDefaults(
  defineProps<{
    messages: ChatMessage[]
    eyebrow: string
    title: string
    subtitle: string
    placeholder?: string
    /** Show the shortcut through to the coach DM (cohort thread only). */
    dmLink?: boolean
  }>(),
  { placeholder: 'Say something…', dmLink: false },
)

const emit = defineEmits<{ (e: 'send', text: string): void }>()

const draft = ref('')
const scroller = ref<HTMLElement | null>(null)

const scrollToEnd = async () => {
  await nextTick()
  const el = scroller.value
  if (el) el.scrollTop = el.scrollHeight
}

const send = () => {
  const text = draft.value.trim()
  if (!text) return
  emit('send', text)
  draft.value = ''
  scrollToEnd()
}

onMounted(scrollToEnd)
watch(() => props.messages.length, scrollToEnd)

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
</script>

<template>
  <div class="chat">
    <header class="chat__header">
      <div>
        <EyebrowLabel>{{ eyebrow }}</EyebrowLabel>
        <h1 class="chat__title display-md">{{ title }}</h1>
        <p class="chat__sub muted">{{ subtitle }}</p>
      </div>
      <NuxtLink
        v-if="dmLink"
        to="/chat/coach"
        class="chat__dm"
        aria-label="Message coach"
      >
        <AppIcon name="user" :size="18" />
      </NuxtLink>
    </header>

    <div ref="scroller" class="chat__messages scroll-y">
      <div
        v-for="m in messages"
        :key="m.id"
        class="chat__msg"
        :class="{
          'chat__msg--self': m.isSelf,
          'chat__msg--coach': m.isCoach,
        }"
      >
        <img
          v-if="!m.isSelf"
          :src="m.authorAvatar"
          class="chat__avatar"
          :alt="m.authorName"
        />
        <div class="chat__bubble-wrap">
          <span v-if="!m.isSelf" class="chat__author" :class="{ 'chat__author--coach': m.isCoach }">
            {{ m.authorName }}
          </span>
          <div class="chat__bubble">{{ m.text }}</div>
          <span class="chat__time data">{{ timeOf(m.sentAt) }}</span>
          <div v-if="m.reactions?.length" class="chat__reactions">
            <span v-for="r in m.reactions" :key="r.emoji" class="chat__reaction">
              {{ r.emoji }} {{ r.count }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div class="chat__composer">
      <input
        v-model="draft"
        class="chat__input"
        :placeholder="placeholder"
        @keyup.enter="send"
      />
      <button
        class="chat__send"
        :class="{ 'chat__send--idle': !draft.trim() }"
        aria-label="Send"
        @click="send"
      >
        <AppIcon name="send" :size="18" fill />
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.chat {
  height: 100%;
  display: flex;
  flex-direction: column;

  &__header {
    padding: 4px 20px 12px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  &__title {
    margin: 6px 0 4px;
  }

  &__sub {
    margin: 0;
    font-size: 13px;
  }

  &__dm {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: var(--paper-raised);
    box-shadow: var(--shadow-card);
    display: grid;
    place-items: center;
    color: var(--ink);
    flex-shrink: 0;
  }

  &__messages {
    flex: 1;
    min-height: 0;
    padding: 8px 20px 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    justify-content: flex-end;
  }

  &__msg {
    display: flex;
    gap: 8px;
    max-width: 82%;

    &--self {
      align-self: flex-end;
      flex-direction: row-reverse;
    }
  }

  &__avatar {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
    margin-top: 16px;
  }

  &__bubble-wrap {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__author {
    font-family: var(--font-eyebrow);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-size: 8.5px;
    font-weight: 700;
    color: var(--violet-45);

    &--coach {
      color: var(--orange);
    }
  }

  &__bubble {
    padding: 12px 14px;
    border-radius: 16px;
    font-size: 14px;
    line-height: 1.45;
    background: var(--paper-raised);
    box-shadow: var(--shadow-card);
    color: var(--ink);
    border-top-left-radius: 4px;

    .chat__msg--coach & {
      background: #f2e4c9;
    }
    .chat__msg--self & {
      background: var(--rose);
      color: var(--paper-raised);
      border-top-left-radius: 16px;
      border-top-right-radius: 4px;
    }
  }

  &__time {
    align-self: flex-end;
    font-size: 9px;
    color: var(--violet-45);

    .chat__msg--self & {
      align-self: flex-start;
    }
  }

  &__reactions {
    display: flex;
    gap: 6px;
  }

  &__reaction {
    font-size: 11px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: var(--radius-pill);
    background: var(--paper-raised);
    box-shadow: var(--shadow-card);
  }

  &__composer {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 20px calc(16px + var(--tabbar-gutter));
  }

  &__input {
    flex: 1;
    height: 48px;
    padding: 0 18px;
    border-radius: var(--radius-pill);
    background: var(--paper-raised);
    box-shadow: inset 0 0 0 1.5px rgba(36, 27, 46, 0.1);
    border: none;
    outline: none;
    font-size: 14px;
    color: var(--ink);

    &::placeholder {
      color: rgba(36, 27, 46, 0.4);
    }
  }

  @media (min-width: 1024px) {
    &__msg {
      max-width: 68%;
    }

    &__composer {
      padding-left: 0;
      padding-right: 0;
    }

    &__messages {
      padding-left: 0;
      padding-right: 0;
    }

    &__header {
      padding-left: 0;
      padding-right: 0;
    }
  }

  &__send {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--rose);
    color: var(--paper-raised);
    display: grid;
    place-items: center;
    flex-shrink: 0;
    box-shadow: var(--shadow-glow);
    transition: opacity 0.15s ease;

    &--idle {
      opacity: 0.45;
    }
  }
}
</style>
