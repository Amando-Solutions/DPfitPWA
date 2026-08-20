<script setup lang="ts">
withDefaults(
  defineProps<{
    step: number
    total: number
    eyebrow: string
    title: string
    subtitle?: string
    cta?: string
    /** Continue stays disabled until the step's required fields are filled. */
    canContinue?: boolean
    busy?: boolean
  }>(),
  { canContinue: true, busy: false },
)

const emit = defineEmits<{ (e: 'continue'): void }>()
const router = useRouter()
</script>

<template>
  <div class="flex flex-1 flex-col px-6 pt-2 pb-6 lg:px-11 lg:pt-8 lg:pb-9">
    <header class="mb-4 flex items-center justify-between">
      <button
        class="grid size-9.5 place-items-center rounded-full bg-raised text-ink shadow-card"
        aria-label="Back"
        @click="router.back()"
      >
        <AppIcon name="arrowLeft" :size="20" :stroke="2.2" />
      </button>
      <span
        class="font-eyebrow text-[10px] font-bold uppercase tracking-[1.5px] text-muted"
      >
        Step {{ step }} of {{ total }}
      </span>
    </header>

    <div class="mb-5.5 flex gap-1.5">
      <div
        v-for="n in total"
        :key="n"
        class="h-1 flex-1 rounded-pill transition-colors duration-300"
        :class="n <= step ? 'bg-rose-fill' : 'bg-fill-muted'"
      />
    </div>

    <div class="mb-5.5">
      <EyebrowLabel>{{ eyebrow }}</EyebrowLabel>
      <h1 class="display-lg mt-2.5 mb-2">{{ title }}</h1>
      <p v-if="subtitle" class="muted m-0 text-sm leading-[1.45] lg:text-[15px]">
        {{ subtitle }}
      </p>
    </div>

    <div class="flex-1 lg:mb-3 lg:flex-[0_1_auto]">
      <slot />
    </div>

    <div class="pt-4">
      <AppButton
        glow
        icon-right="arrowRight"
        :disabled="!canContinue || busy"
        @click="emit('continue')"
      >
        {{ busy ? 'Saving…' : (cta ?? 'Continue') }}
      </AppButton>
    </div>
  </div>
</template>
