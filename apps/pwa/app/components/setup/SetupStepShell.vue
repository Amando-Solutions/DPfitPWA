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
    /**
     * A save is in flight.
     *
     * Freezes the whole step, not just the button: `inert` on the body means
     * the fields, the pickers and anything a slot puts in them stop taking
     * input, and Back stops being a way out mid-write. A step that only greys
     * its CTA leaves the member editing the answers that have already been
     * read and are on their way to Firestore, so what they end up looking at
     * is not what got written.
     *
     * `inert` rather than a `<fieldset disabled>` wrapper: it needs no element
     * of its own, so it cannot disturb the step's layout, and it covers the
     * plain `<div @click>` an option list might be built from as well as the
     * real controls.
     */
    busy?: boolean
    /**
     * Why the last save did not land.
     *
     * Required by `busy`, not decoration. The step freezes for the duration of
     * the write, so the member has to be told when the write is the thing that
     * failed — a step that silently unfreezes with the same answers in it
     * looks like a button that did nothing, and the natural response is to
     * press it again.
     */
    error?: string
  }>(),
  { canContinue: true, busy: false, error: '' },
)

const emit = defineEmits<{ (e: 'continue'): void }>()
const router = useRouter()
</script>

<template>
  <div class="flex flex-1 flex-col px-6 pt-(--screen-pad-top) pb-6 lg:px-11 lg:pt-8 lg:pb-9">
    <header class="mb-4 flex items-center justify-between">
      <button
        class="grid size-9.5 place-items-center rounded-full bg-raised text-ink shadow-card disabled:opacity-45"
        aria-label="Back"
        :disabled="busy"
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

    <div
      class="flex-1 transition-opacity duration-150 lg:mb-3 lg:flex-[0_1_auto]"
      :class="busy && 'opacity-60'"
      :inert="busy"
      :aria-busy="busy || undefined"
    >
      <slot />
    </div>

    <div class="pt-4">
      <p
        v-if="error"
        role="alert"
        class="mb-2.5 text-center text-[13px] font-semibold text-rose"
      >
        {{ error }}
      </p>
      <AppButton
        :disabled="!canContinue || busy"
        @click="emit('continue')"
      >
        {{ busy ? 'Saving…' : (cta ?? 'Continue') }}
      </AppButton>
    </div>
  </div>
</template>
