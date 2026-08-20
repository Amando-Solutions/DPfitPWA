<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string
    back?: boolean
    action?: string // icon name for a right-side action
  }>(),
  { back: true },
)

const emit = defineEmits<{ (e: 'action'): void }>()
const router = useRouter()

const goBack = () => {
  if (window.history.length > 1) router.back()
  else router.push('/home')
}
</script>

<template>
  <header class="screen-header">
    <button v-if="back" class="screen-header__btn" aria-label="Back" @click="goBack">
      <AppIcon name="arrowLeft" :size="22" :stroke="2.2" />
    </button>
    <div v-else class="screen-header__spacer" />

    <h1 v-if="title" class="screen-header__title">{{ title }}</h1>
    <slot name="title" />

    <button
      v-if="action"
      class="screen-header__btn"
      aria-label="Action"
      @click="emit('action')"
    >
      <AppIcon :name="action" :size="22" :stroke="2.2" />
    </button>
    <div v-else class="screen-header__spacer" />
  </header>
</template>

<style scoped lang="scss">
.screen-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 20px 12px;

  &__btn {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-pill);
    display: grid;
    place-items: center;
    color: var(--ink);
    background: rgba(36, 27, 46, 0.06);
    flex-shrink: 0;
  }

  &__spacer {
    width: 40px;
    flex-shrink: 0;
  }

  @media (min-width: 1024px) {
    padding-left: 0;
    padding-right: 0;
  }

  &__title {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 17px;
    text-align: center;
    flex: 1;
    color: var(--ink);
  }
}
</style>
