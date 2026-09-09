<script setup lang="ts">
import type { SetType } from '~/data/types'
import { setTypeCopy, removeSetCopy } from '~/data/setTypes'

/*
  What a set was, chosen from the badge in the SET column.

  Removing the row lives here too, next to the types, because from the member's
  side it is the same decision: this row is a warm-up, or a failure, or it
  should not be in the log at all. It is kept visually apart — and last — since
  it is the one option that does not come back.

  Every word in here comes from `~/data/setTypes`.
*/
const props = defineProps<{
  modelValue: boolean
  /** The type currently on the row, so the sheet opens showing where it is. */
  current: SetType
  /**
   * The number this row would carry as a normal set.
   *
   * The "Normal Set" option shows this rather than the row's current badge. It
   * is the one option whose badge is positional, and borrowing the row's badge
   * meant opening the picker on a warm-up drew "Normal Set · W" — an option
   * labelled with the very thing choosing it would undo.
   */
  normalLabel: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'select', type: SetType): void
  (e: 'remove'): void
}>()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

/**
 * Which explanation is open, if any.
 *
 * It is a dialog over the sheet rather than a panel inside it. The sheet is
 * already a list of five options near the bottom of the screen, and growing it
 * by a paragraph pushed the option the member was reaching for out from under
 * their thumb. Reading an explanation and choosing an option are two different
 * moments, so they get two different surfaces.
 */
const explaining = ref<SetType | null>(null)

const explanation = computed(
  () => setTypeCopy.find((meta) => meta.type === explaining.value) ?? null,
)

const explainerOpen = computed({
  get: () => explaining.value !== null,
  set: (v: boolean) => {
    if (!v) explaining.value = null
  },
})

// A question left open from last time isn't an answer to this row.
watch(open, (isOpen) => {
  if (!isOpen) explaining.value = null
})

const choose = (type: SetType) => {
  emit('select', type)
  open.value = false
}

const remove = () => {
  emit('remove')
  open.value = false
}

/** The badge shown against an option: its letter, or the number for `normal`. */
const badgeFor = (type: SetType, badge: string) =>
  type === 'normal' ? props.normalLabel : badge

/*
  Badge tints. The same pairs the SET column uses, so the option in the sheet
  and the row behind it are recognisably the same thing.
*/
const BADGE: Record<SetType, string> = {
  warmup: 'bg-set-warmup-soft text-set-warmup',
  normal: 'bg-fill-muted text-soft',
  failure: 'bg-set-fail-soft text-set-fail',
  drop: 'bg-set-drop-soft text-set-drop',
}

const ROW =
  'flex w-full items-center gap-3 rounded-md bg-sunken pl-3.5 pr-2 transition-colors duration-150'
</script>

<template>
  <BottomSheet v-model="open" title="Select Set Type">
    <div class="flex flex-col gap-2">
      <div
        v-for="meta in setTypeCopy"
        :key="meta.type"
        :class="[
          ROW,
          current === meta.type
            ? 'bg-rose-softer shadow-[inset_0_0_0_1.5px_var(--rose)]'
            : 'shadow-[inset_0_0_0_1.5px_var(--hairline)]',
        ]"
      >
        <!--
          The option and its "?" are siblings rather than a button inside a
          button, which is not something a browser will render as two separate
          targets — and a screen reader would announce the outer one only.
        -->
        <button
          type="button"
          class="flex flex-1 items-center gap-3 py-3.5 text-left"
          :aria-pressed="current === meta.type"
          @click="choose(meta.type)"
        >
          <span
            class="grid size-8 shrink-0 place-items-center rounded-field text-[13px] font-bold tabular-nums"
            :class="BADGE[meta.type]"
            aria-hidden="true"
          >
            {{ badgeFor(meta.type, meta.badge) }}
          </span>
          <span class="flex-1 text-[15px] font-bold text-ink">{{ meta.label }}</span>
          <AppIcon
            v-if="current === meta.type"
            name="check"
            :size="16"
            :stroke="3"
            class="text-rose"
          />
        </button>

        <button
          type="button"
          class="grid size-9 shrink-0 place-items-center self-center rounded-pill text-[13px] font-bold text-muted shadow-[inset_0_0_0_1.5px_var(--hairline)] transition-colors hover:text-ink"
          :aria-label="`What is a ${meta.label.toLowerCase()}?`"
          @click="explaining = meta.type"
        >
          ?
        </button>
      </div>

      <!-- Not a set type, so it is separated from the four that are. -->
      <button
        type="button"
        class="mt-1 flex w-full items-center gap-3 rounded-md bg-sunken px-3.5 py-3.5 text-left shadow-[inset_0_0_0_1.5px_var(--hairline)] transition-opacity duration-100 active:opacity-70"
        @click="remove"
      >
        <span
          class="grid size-8 shrink-0 place-items-center rounded-field bg-set-fail-soft text-[13px] font-bold text-set-fail"
          aria-hidden="true"
        >
          {{ removeSetCopy.badge }}
        </span>
        <span class="flex-1 text-[15px] font-bold text-set-fail">
          {{ removeSetCopy.label }}
        </span>
      </button>
    </div>

    <!--
      The explainer, over the sheet rather than inside it. `z-210` puts it above
      the sheet's own `z-200`: DOM order would mostly do that on its own, but
      the two portals are siblings and nothing guarantees which mounts last.
    -->
    <Dialog v-model:open="explainerOpen">
      <DialogContent
        class="z-210 w-[calc(100%-32px)] max-w-100 gap-0 rounded-lg bg-raised p-5 font-exercise"
        :aria-describedby="undefined"
      >
        <div class="flex items-start gap-3">
          <span
            v-if="explanation"
            class="grid size-8 shrink-0 place-items-center rounded-field text-[13px] font-bold tabular-nums"
            :class="BADGE[explanation.type]"
            aria-hidden="true"
          >
            {{ badgeFor(explanation.type, explanation.badge) }}
          </span>
          <DialogTitle class="flex-1 pt-1 text-[16px]">
            {{ explanation?.title }}
          </DialogTitle>
        </div>

        <p class="mt-3 mb-0 text-[13.5px] leading-[1.5] text-soft">
          {{ explanation?.description }}
        </p>

        <AppButton variant="secondary" size="md" class="mt-4" @click="explaining = null">
          Got it
        </AppButton>
      </DialogContent>
    </Dialog>
  </BottomSheet>
</template>
