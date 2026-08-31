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

/* Flat: a subtle fill and the icon, with a small press scale for feedback.
   Matches AppButton, which dropped its raised stack for the same reason. */
const BTN =
  'grid size-10 shrink-0 place-items-center rounded-pill bg-fill-subtle text-ink transition-[transform,background-color] duration-100 ease-out active:scale-[0.94] motion-reduce:transition-none motion-reduce:active:scale-100'
</script>

<template>
  <header
    class="flex shrink-0 items-center justify-between gap-3 px-5 pt-(--screen-pad-top) pb-3 lg:px-0 lg:pt-1.5"
  >
    <button v-if="back" :class="BTN" aria-label="Back" @click="goBack">
      <AppIcon name="arrowLeft" :size="22" :stroke="2.2" />
    </button>
    <div v-else class="size-10 shrink-0" />

    <h1
      v-if="title"
      class="m-0 flex-1 text-center font-display text-[17px] font-black text-ink"
    >
      {{ title }}
    </h1>
    <slot name="title" />

    <button
      v-if="action"
      :class="BTN"
      aria-label="Action"
      @click="emit('action')"
    >
      <AppIcon :name="action" :size="22" :stroke="2.2" />
    </button>
    <div v-else class="size-10 shrink-0" />
  </header>
</template>
