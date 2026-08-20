<script setup lang="ts">
import type { LoggedSet, Units } from '~/data/types'
import {
  fromDisplayWeight,
  toDisplayWeight,
  unitLabel,
  weightStep,
} from '~/lib/domain/nutrition'

const props = withDefaults(
  defineProps<{
    name: string
    muscleGroup: string
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
const noteDraft = ref(props.note)
watch(
  () => props.note,
  (value) => (noteDraft.value = value),
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

/**
 * Last session's numbers. Sessions logged before units were switchable only
 * kept a pre-formatted string, so fall back to it rather than showing nothing.
 */
const previousLabel = (set: LoggedSet): string => {
  if (set.previousWeightKg === undefined || set.previousReps === undefined) {
    return set.previous || '—'
  }
  if (!set.previousWeightKg) return `× ${set.previousReps}`
  return `${toDisplayWeight(set.previousWeightKg, props.unit)}${unitLabel(props.unit)} × ${set.previousReps}`
}

const ROW =
  'grid grid-cols-[28px_1fr_58px_58px_34px] items-center gap-1.5 border-b py-1.75'
// Chrome/Safari spinners eat the available width in a 58px cell.
const NO_SPINNER =
  'appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none'
</script>

<template>
  <AppCard variant="raised" class="flex flex-col">
    <div class="flex items-center gap-2.5">
      <div
        class="grid size-8 shrink-0 place-items-center rounded-pill bg-rose-soft text-rose"
      >
        <AppIcon name="train" :size="16" :stroke="2.2" />
      </div>

      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <h3 class="m-0 font-display text-[15px] font-black text-rose">
          {{ name }}
        </h3>
        <span
          class="self-start rounded-pill bg-rose-soft px-1.75 py-0.75 font-eyebrow text-[8px] font-bold uppercase tracking-[0.5px] text-rose"
        >
          {{ muscleGroup }}
        </span>
      </div>

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
      class="mt-2 block min-h-7.5 w-full py-1.5 text-left font-body text-[13px] text-muted"
      @click="menuOpen = true"
    >
      {{ note || 'Add notes here…' }}
    </button>
    <p
      v-else-if="note"
      class="mt-2 mb-0 min-h-7.5 py-1.5 text-left font-body text-[13px] text-ink"
    >
      {{ note }}
    </p>

    <button
      v-if="!readonly"
      class="mt-0.5 flex min-h-7 items-center gap-1.5 py-1 text-[12.5px] font-semibold text-rose"
      @click="emit('rest', restSeconds)"
    >
      <AppIcon name="clock" :size="14" :stroke="2" />
      <span>Rest Timer: {{ restLabel }}</span>
    </button>

    <div class="mt-3">
      <div
        :class="ROW"
        class="border-fill-muted font-eyebrow text-[8.5px] font-bold uppercase tracking-[0.5px] text-muted"
      >
        <span>Set</span>
        <span>Previous</span>
        <span class="text-right">{{ unitLabel(unit) }}</span>
        <span class="text-right">Reps</span>
        <span class="grid place-items-center">
          <AppIcon name="check" :size="13" :stroke="2.6" />
        </span>
      </div>

      <div
        v-for="(set, index) in sets"
        :key="index"
        :class="[
          ROW,
          'border-fill-subtle',
          set.done && 'rounded-sm bg-rose-softer',
        ]"
      >
        <span class="data pl-1 text-xs text-muted">{{ index + 1 }}</span>
        <span class="truncate text-[11.5px] text-muted">
          {{ previousLabel(set) }}
        </span>

        <input
          v-if="!readonly"
          class="data h-8 w-full rounded-sm border-none bg-sunken px-2 text-right text-[13.5px] font-bold text-ink shadow-[inset_0_0_0_1px_var(--hairline)] outline-none focus:shadow-[inset_0_0_0_1.5px_var(--rose)]"
          :class="NO_SPINNER"
          type="number"
          inputmode="decimal"
          min="0"
          :step="weightStep(unit)"
          :value="weightIn(set)"
          :aria-label="`Set ${index + 1} weight in ${unit === 'kg' ? 'kilograms' : 'pounds'}`"
          @change="onNumber(index, 'weightKg', $event)"
        />
        <span v-else class="data text-right text-[13.5px] font-bold text-ink">
          {{ weightIn(set) }}
        </span>

        <input
          v-if="!readonly"
          class="data h-8 w-full rounded-sm border-none bg-sunken px-2 text-right text-[13.5px] font-bold text-ink shadow-[inset_0_0_0_1px_var(--hairline)] outline-none focus:shadow-[inset_0_0_0_1.5px_var(--rose)]"
          :class="NO_SPINNER"
          type="number"
          inputmode="numeric"
          min="0"
          step="1"
          :value="set.reps"
          :aria-label="`Set ${index + 1} reps`"
          @change="onNumber(index, 'reps', $event)"
        />
        <span v-else class="data text-right text-[13.5px] font-bold text-ink">
          {{ set.reps }}
        </span>

        <button
          class="grid size-7 place-items-center justify-self-center rounded-[9px] text-on-rose transition-colors duration-150 disabled:cursor-default disabled:opacity-60"
          :class="set.done ? 'bg-rose-fill' : 'bg-fill-subtle'"
          :disabled="readonly"
          :aria-label="`Mark set ${index + 1} ${set.done ? 'not done' : 'done'}`"
          @click="emit('toggle-set', index)"
        >
          <AppIcon v-if="set.done" name="check" :size="13" :stroke="3" />
        </button>
      </div>
    </div>

    <button
      v-if="!readonly"
      class="btn-raised mt-3 flex h-10 items-center justify-center gap-1.5 rounded-pill bg-fill-subtle text-[13px] font-bold text-rose [--btn-face:var(--face-subtle)]"
      @click="emit('add-set')"
    >
      <AppIcon name="plus" :size="15" :stroke="2.4" />
      <span>Add Set</span>
    </button>

    <!-- 16 · Exercise Menu -->
    <BottomSheet v-model="menuOpen" :title="name">
      <div class="flex flex-col gap-3">
        <label
          class="font-eyebrow text-[10px] font-bold uppercase tracking-[1px] text-muted"
        >
          Note for this exercise
        </label>
        <textarea
          v-model="noteDraft"
          class="w-full resize-none rounded-md border-none bg-sunken px-3.5 py-3 font-body text-sm text-ink shadow-[inset_0_0_0_1.5px_var(--hairline)] outline-none"
          rows="2"
          placeholder="Felt heavy, dropped to 12kg on the last set…"
        />
        <AppButton variant="secondary" @click="saveNote">Save note</AppButton>
        <AppButton
          v-if="sets.length > 1"
          variant="ghost"
          @click="
            () => {
              emit('remove-set', sets.length - 1)
              menuOpen = false
            }
          "
        >
          Remove last set
        </AppButton>
      </div>
    </BottomSheet>
  </AppCard>
</template>
