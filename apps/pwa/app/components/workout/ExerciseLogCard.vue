<script setup lang="ts">
import type { LoggedSet, SetType, Units } from '~/data/types'
import type { SetRow } from '~/lib/domain/sets'
import {
  fromDisplayWeight,
  toDisplayWeight,
  unitLabel,
  weightStep,
} from '~/lib/domain/nutrition'
import { normalNumberFor, setRows, setTypeOf, setTypes } from '~/lib/domain/sets'

const props = withDefaults(
  defineProps<{
    name: string
    restSeconds: number
    note: string
    /** Weights are kilograms; `unit` only decides how they are shown. */
    sets: LoggedSet[]
    unit?: Units
    /** Read-only rendering for a session that has already been saved. */
    readonly?: boolean
  }>(),
  { unit: 'kg' },
)

const emit = defineEmits<{
  (e: 'toggle-set', index: number): void
  (e: 'update-set', payload: { index: number; field: 'reps' | 'weightKg'; value: number }): void
  (e: 'update-set-type', payload: { index: number; setType: SetType }): void
  (e: 'add-set'): void
  (e: 'remove-set', index: number): void
  (e: 'update-note', value: string): void
  (e: 'rest', seconds: number): void
}>()

const restLabel = computed(() => {
  const m = Math.floor(props.restSeconds / 60)
  const s = props.restSeconds % 60
  return m ? `${m}min ${s}s` : `${s}s`
})

const menuOpen = ref(false)
const noteFocused = ref(false)
const noteId = useId()
const noteDraft = ref(props.note)
watch(
  () => props.note,
  (value) => (noteDraft.value = value),
)
watch(menuOpen, (open) => {
  if (!open) noteFocused.value = false
})

const modalPosition = computed(() =>
  noteFocused.value ? 'top-4 translate-y-0' : 'top-1/2 -translate-y-1/2',
)

const saveNote = () => {
  emit('update-note', noteDraft.value.trim())
  menuOpen.value = false
}

const onNumber = (index: number, field: 'reps' | 'weightKg', event: Event) => {
  const raw = (event.target as HTMLInputElement).value
  const value = Number(raw)
  const safe = Number.isFinite(value) && value >= 0 ? value : 0
  emit('update-set', {
    index,
    field,
    // The field is typed in the member's unit; the store only ever holds kg.
    value: field === 'weightKg' ? fromDisplayWeight(safe, props.unit) : safe,
  })
}

/** The weight column, shown in whichever unit is selected. */
const weightIn = (set: LoggedSet) => toDisplayWeight(set.weightKg, props.unit)

// --- Set types -------------------------------------------------------------
/**
 * The rows to draw, and the SET column, recomputed on every render.
 *
 * Deliberately derived rather than stored. Only normal sets are numbered, so
 * turning the second of four into a warm-up has to renumber the two below it;
 * an index written onto each set would need a second pass to fix up, and any
 * row that missed it would be wrong for the rest of the session.
 *
 * `row.index` is the position in `sets`, which is what every event carries.
 */
const rows = computed(() => setRows(props.sets))

const metaFor = (type: SetType) => setTypes.find((meta) => meta.type === type)!

/** How a row is named out loud — position included, since W/F/D repeat. */
const rowName = (row: SetRow, position: number) => {
  const type = setTypeOf(row.set)
  return type === 'normal'
    ? `set ${row.label}`
    : `${metaFor(type).label.toLowerCase()} ${position + 1}`
}

/** Which set the picker is open on, as an index into `sets`, or -1. */
const typeSheetFor = ref(-1)
const typeSheetOpen = computed({
  get: () => typeSheetFor.value >= 0,
  set: (open: boolean) => {
    if (!open) typeSheetFor.value = -1
  },
})

/* A row that goes away while its picker is open would leave the sheet pointing
   at whichever set slid into that index. */
watch(
  () => rows.value.length,
  () => (typeSheetFor.value = -1),
)

const sheetSet = computed(() => props.sets[typeSheetFor.value])

const sheetType = computed(() =>
  sheetSet.value ? setTypeOf(sheetSet.value) : 'normal',
)

/**
 * What the picker's "Normal Set" option shows.
 *
 * A number, always — the option is the one whose badge is positional, so it
 * cannot borrow the row's current badge the way the other three do.
 */
const sheetNormalLabel = computed(() =>
  typeSheetFor.value >= 0 ? normalNumberFor(props.sets, typeSheetFor.value) : '1',
)

/**
 * Whether the open row can be taken out of the log.
 *
 * Only the member's own extra sets. The prescribed ones are the coach's plan,
 * authored in the admin panel and read from the program — a member removing one
 * would be editing the workout rather than recording it.
 */
const sheetRemovable = computed(() => sheetSet.value?.added === true)

const applyType = (setType: SetType) => {
  if (typeSheetFor.value >= 0)
    emit('update-set-type', { index: typeSheetFor.value, setType })
}

const removeFromSheet = () => {
  if (typeSheetFor.value >= 0) emit('remove-set', typeSheetFor.value)
}

/*
  Badge tints, one per type.

  Normal gets the neutral fill rather than no chip at all: every badge in the
  column is a button now, and one that is bare text while its neighbours are
  chips does not look like something you can press.
*/
const SET_BADGE: Record<SetType, string> = {
  warmup: 'bg-set-warmup-soft text-set-warmup',
  normal: 'bg-fill-subtle text-soft',
  failure: 'bg-set-fail-soft text-set-fail',
  drop: 'bg-set-drop-soft text-set-drop',
}

/**
 * Last session's numbers.
 *
 * A dash covers two different cases that look the same to the member: the
 * first time an exercise is done, and a set they added themselves, which has
 * no counterpart in a previous week to refer to.
 */
const previousLabel = (set: LoggedSet): string => {
  if (set.previousReps === null) return '-'
  if (!set.previousWeightKg) return `× ${set.previousReps}`
  return `${toDisplayWeight(set.previousWeightKg, props.unit)}${unitLabel(props.unit)} × ${set.previousReps}`
}

const ROW =
  'grid grid-cols-[28px_1fr_58px_58px_34px] items-center gap-1.5 border-b py-1.75'

/*
  One radius, used everywhere on this card that isn't a button.

  The card, the inputs and the checkmarks were each rounded differently, and the
  inputs were close enough to pills that a row of them read as four buttons. A
  modest, consistent corner puts the emphasis back on the numbers; true pills
  are reserved for things you press.
*/
const INPUT =
  'h-8 w-full rounded-field border-none bg-sunken px-2 text-right text-[13.5px] font-bold text-ink tabular-nums shadow-[inset_0_0_0_1px_var(--hairline)] outline-none focus:shadow-[inset_0_0_0_1.5px_var(--rose)]'
// Chrome/Safari spinners eat the available width in a 58px cell.
const NO_SPINNER =
  'appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none'
</script>

<template>
  <!--
    Everything here is the body face at a restrained weight. The monospace that
    used to run through the set numbers, previous column and inputs bought
    nothing a `tabular-nums` body font doesn't, and it made a workout log read
    like a terminal. Bold survives in exactly three places: the exercise name,
    the numbers being entered, and the primary button.
  -->
  <AppCard variant="raised" class="flex flex-col rounded-2xl font-exercise">
    <div class="flex items-center gap-2.5">
      <div
        class="grid size-8 shrink-0 place-items-center rounded-pill bg-rose-soft text-rose"
      >
        <AppIcon name="train" :size="16" :stroke="2.2" />
      </div>

      <!--
        The muscle-group tag ("QUADS") and the exercise-type tag ("WEIGHT +
        REPS") both used to hang under this name. Neither told the member
        anything the exercise name and the columns below don't: you can see it
        is a weight-and-reps exercise because there is a weight column and a
        reps column.
      -->
      <h3 class="m-0 min-w-0 flex-1 truncate text-[15px] font-bold text-rose">
        {{ name }}
      </h3>

      <button
        v-if="!readonly"
        class="-mr-1.5 grid size-8 shrink-0 place-items-center rounded-pill text-muted transition-colors hover:text-ink"
        aria-label="Exercise options"
        @click="menuOpen = true"
      >
        <AppIcon name="more" :size="18" :stroke="2.4" />
      </button>
    </div>

    <button
      v-if="!readonly"
      class="mt-2 block min-h-7.5 w-full py-1.5 text-left text-[13px] text-muted"
      @click="menuOpen = true"
    >
      {{ note || 'Add notes here…' }}
    </button>
    <p
      v-else-if="note"
      class="mt-2 mb-0 min-h-7.5 py-1.5 text-left text-[13px] text-ink"
    >
      {{ note }}
    </p>

    <button
      v-if="!readonly"
      class="mt-0.5 flex min-h-7 items-center gap-1.5 py-1 text-[12.5px] text-rose"
      @click="emit('rest', restSeconds)"
    >
      <AppIcon name="clock" :size="14" :stroke="2" />
      <span>Rest timer: {{ restLabel }}</span>
    </button>

    <div class="mt-3">
      <div :class="ROW" class="border-fill-muted text-[11.5px] text-muted">
        <span>Set</span>
        <span>Previous</span>
        <span class="text-right">{{ unitLabel(unit) }}</span>
        <span class="text-right">Reps</span>
        <span class="grid place-items-center">
          <AppIcon name="check" :size="13" :stroke="2.2" />
        </span>
      </div>

      <div
        v-for="(row, position) in rows"
        :key="row.index"
        :class="[
          ROW,
          'border-fill-subtle',
          row.set.done && 'rounded-field bg-rose-softer',
        ]"
      >
        <!-- 16b · Select Set Type. The badge is the control: there is nowhere
             else on a row this tight to put one, and it is also the thing the
             choice changes, so it doubles as its own preview. -->
        <button
          v-if="!readonly"
          type="button"
          class="grid size-7 place-items-center justify-self-center rounded-field text-[11.5px] font-bold tabular-nums transition-colors duration-150"
          :class="SET_BADGE[setTypeOf(row.set)]"
          :aria-label="`${row.label} — ${metaFor(setTypeOf(row.set)).label}. Change set type`"
          @click="typeSheetFor = row.index"
        >
          {{ row.label }}
        </button>
        <span
          v-else
          class="grid size-7 place-items-center justify-self-center rounded-field text-[11.5px] font-bold tabular-nums"
          :class="SET_BADGE[setTypeOf(row.set)]"
        >
          {{ row.label }}
        </span>
        <span class="truncate text-[11.5px] text-muted tabular-nums">
          {{ previousLabel(row.set) }}
        </span>

        <input
          v-if="!readonly"
          :class="[INPUT, NO_SPINNER]"
          type="number"
          inputmode="decimal"
          min="0"
          :step="weightStep(unit)"
          :value="weightIn(row.set)"
          :aria-label="`${rowName(row, position)} weight in ${unit === 'kg' ? 'kilograms' : 'pounds'}`"
          @change="onNumber(row.index, 'weightKg', $event)"
        />
        <span v-else class="text-right text-[13.5px] font-bold text-ink tabular-nums">
          {{ weightIn(row.set) }}
        </span>

        <input
          v-if="!readonly"
          :class="[INPUT, NO_SPINNER]"
          type="number"
          inputmode="numeric"
          min="0"
          step="1"
          :value="row.set.reps"
          :aria-label="`${rowName(row, position)} reps`"
          @change="onNumber(row.index, 'reps', $event)"
        />
        <span v-else class="text-right text-[13.5px] font-bold text-ink tabular-nums">
          {{ row.set.reps }}
        </span>

        <!-- Neutral until it is ticked, and ticked it fills with the surface's
             own strong ink rather than a second accent colour. -->
        <button
          class="grid size-7 place-items-center justify-self-center rounded-field transition-colors duration-150 disabled:cursor-default disabled:opacity-60"
          :class="row.set.done ? 'bg-rose-fill text-on-rose' : 'bg-fill-subtle text-transparent'"
          :disabled="readonly"
          :aria-label="`Mark ${rowName(row, position)} ${row.set.done ? 'not done' : 'done'}`"
          @click="emit('toggle-set', row.index)"
        >
          <AppIcon v-if="row.set.done" name="check" :size="13" :stroke="3" />
        </button>
      </div>
    </div>

    <button
      v-if="!readonly"
      class="mt-3 flex h-10 items-center justify-center gap-1.5 rounded-pill bg-fill-subtle text-[13px] text-ink transition-opacity duration-100 active:opacity-70"
      @click="emit('add-set')"
    >
      <AppIcon name="plus" :size="15" :stroke="2.4" />
      <span>Add set</span>
    </button>

    <!-- 16 · Exercise Menu. Input belongs in a modal rather than a bottom
         sheet, so the software keyboard cannot cover the editor. -->
    <Dialog v-model:open="menuOpen">
      <DialogContent
        :class="[
          'w-[calc(100%-32px)] max-w-md max-h-[calc(100dvh-32px)] gap-0 overflow-y-auto rounded-lg bg-raised p-5 font-exercise transition-[top,transform] duration-200 sm:p-6',
          modalPosition,
        ]"
        :aria-describedby="undefined"
      >
        <DialogClose
          class="absolute top-3 right-3 grid size-9 place-items-center rounded-pill text-muted transition-colors hover:bg-fill-subtle hover:text-ink"
          aria-label="Close exercise options"
        >
          <AppIcon name="close" :size="18" :stroke="2.2" />
        </DialogClose>

        <DialogTitle class="pr-10">{{ name }}</DialogTitle>

        <div class="mt-4 flex flex-col gap-3">
          <label class="text-[13px] text-muted" :for="noteId">
            Note for this exercise
          </label>
          <textarea
            :id="noteId"
            v-model="noteDraft"
            class="w-full scroll-mt-4 resize-none rounded-field border-none bg-sunken px-3.5 py-3 text-base text-ink shadow-[inset_0_0_0_1.5px_var(--hairline)] outline-none focus:shadow-[inset_0_0_0_1.5px_var(--rose)] sm:text-sm"
            rows="3"
            placeholder="Felt heavy, dropped to 12kg on the last set…"
            @focus="noteFocused = true"
            @blur="noteFocused = false"
          />
          <!-- Removing a set used to live here, and could only ever take the
               last one the member had added. The badge in the SET column now
               offers it on any row, which is both easier to find and the row
               you are actually looking at, so this button was the same job
               done worse. -->
          <AppButton variant="secondary" @click="saveNote">Save note</AppButton>
        </div>
      </DialogContent>
    </Dialog>

    <SetTypeSheet
      v-model="typeSheetOpen"
      :current="sheetType"
      :normal-label="sheetNormalLabel"
      :removable="sheetRemovable"
      @select="applyType"
      @remove="removeFromSheet"
    />
  </AppCard>
</template>
