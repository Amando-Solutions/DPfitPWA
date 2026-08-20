<script setup lang="ts">
import type { LoggedSet } from '~/data/types'

const props = defineProps<{
  name: string
  muscleGroup: string
  restSeconds: number
  note: string
  sets: LoggedSet[]
  /** Read-only rendering for a session that has already been saved. */
  readonly?: boolean
}>()

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
  emit('update-set', {
    index,
    field,
    value: Number.isFinite(value) && value >= 0 ? value : 0,
  })
}
</script>

<template>
  <AppCard variant="raised" class="elog">
    <div class="elog__head">
      <div class="elog__icon"><AppIcon name="train" :size="16" :stroke="2.2" /></div>
      <div class="elog__title-wrap">
        <h3 class="elog__name">{{ name }}</h3>
        <span class="elog__chip">{{ muscleGroup }}</span>
      </div>
      <button
        v-if="!readonly"
        class="elog__more"
        aria-label="Exercise options"
        @click="menuOpen = true"
      >
        <AppIcon name="more" :size="18" :stroke="2.4" />
      </button>
    </div>

    <button v-if="!readonly" class="elog__note" @click="menuOpen = true">
      {{ note || 'Add notes here…' }}
    </button>
    <p v-else-if="note" class="elog__note elog__note--static">{{ note }}</p>

    <button v-if="!readonly" class="elog__rest" @click="emit('rest', restSeconds)">
      <AppIcon name="clock" :size="14" :stroke="2" />
      <span>Rest Timer: {{ restLabel }}</span>
    </button>

    <div class="elog__table">
      <div class="elog__row elog__row--head">
        <span>Set</span>
        <span>Previous</span>
        <span class="elog__num">Kg</span>
        <span class="elog__num">Reps</span>
        <span class="elog__check-col">
          <AppIcon name="check" :size="13" :stroke="2.6" />
        </span>
      </div>
      <div
        v-for="(set, index) in sets"
        :key="index"
        class="elog__row"
        :class="{ 'elog__row--done': set.done }"
      >
        <span class="elog__set-n data">{{ index + 1 }}</span>
        <span class="elog__prev">{{ set.previous || '—' }}</span>
        <input
          v-if="!readonly"
          class="elog__input data"
          type="number"
          inputmode="decimal"
          min="0"
          step="0.5"
          :value="set.weightKg"
          :aria-label="`Set ${index + 1} weight in kilograms`"
          @change="onNumber(index, 'weightKg', $event)"
        />
        <span v-else class="elog__num data elog__val">{{ set.weightKg }}</span>
        <input
          v-if="!readonly"
          class="elog__input data"
          type="number"
          inputmode="numeric"
          min="0"
          step="1"
          :value="set.reps"
          :aria-label="`Set ${index + 1} reps`"
          @change="onNumber(index, 'reps', $event)"
        />
        <span v-else class="elog__num data elog__val">{{ set.reps }}</span>
        <button
          class="elog__check"
          :class="{ 'elog__check--on': set.done }"
          :disabled="readonly"
          :aria-label="`Mark set ${index + 1} ${set.done ? 'not done' : 'done'}`"
          @click="emit('toggle-set', index)"
        >
          <AppIcon v-if="set.done" name="check" :size="13" :stroke="3" />
        </button>
      </div>
    </div>

    <button v-if="!readonly" class="elog__add" @click="emit('add-set')">
      <AppIcon name="plus" :size="15" :stroke="2.4" />
      <span>Add Set</span>
    </button>

    <!-- 16 · Exercise Menu -->
    <BottomSheet v-model="menuOpen" :title="name">
      <div class="elog__menu">
        <label class="elog__menu-label">Note for this exercise</label>
        <textarea
          v-model="noteDraft"
          class="elog__menu-area"
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

<style scoped lang="scss">
.elog {
  display: flex;
  flex-direction: column;

  &__head {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  &__icon {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-pill);
    background: var(--rose-25);
    color: var(--rose);
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }

  &__title-wrap {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__name {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 15px;
    color: var(--rose);
  }

  &__chip {
    align-self: flex-start;
    font-family: var(--font-eyebrow);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-size: 8px;
    font-weight: 700;
    color: var(--rose);
    background: var(--rose-25);
    padding: 3px 7px;
    border-radius: var(--radius-pill);
  }

  &__more {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    margin-right: -6px;
    border-radius: var(--radius-pill);
    color: var(--violet-45);
    flex-shrink: 0;
  }

  &__note {
    display: block;
    width: 100%;
    min-height: 30px;
    text-align: left;
    margin: 8px 0 0;
    padding: 6px 0;
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--violet-45);

    &--static {
      color: var(--ink);
    }
  }

  &__rest {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 28px;
    margin-top: 2px;
    padding: 4px 0;
    color: var(--rose);
    font-size: 12.5px;
    font-weight: 600;
  }

  &__table {
    margin-top: 12px;
  }

  &__row {
    display: grid;
    grid-template-columns: 28px 1fr 58px 58px 34px;
    align-items: center;
    gap: 6px;
    padding: 7px 0;
    border-bottom: 1px solid rgba(36, 27, 46, 0.06);

    &--head {
      font-family: var(--font-eyebrow);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-size: 8.5px;
      font-weight: 700;
      color: var(--violet-45);
      border-bottom-color: rgba(36, 27, 46, 0.1);
    }

    &--done {
      background: rgba(200, 30, 92, 0.05);
      border-radius: var(--radius-sm);
    }
  }

  &__set-n {
    font-size: 12px;
    color: var(--violet-45);
    padding-left: 4px;
  }

  &__prev {
    font-size: 11.5px;
    color: var(--violet-45);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__num {
    text-align: right;
  }

  &__val {
    font-size: 13.5px;
    font-weight: 700;
    color: var(--ink);
  }

  &__input {
    width: 100%;
    height: 32px;
    padding: 0 8px;
    text-align: right;
    font-size: 13.5px;
    font-weight: 700;
    color: var(--ink);
    background: var(--paper);
    border: none;
    border-radius: var(--radius-sm);
    outline: none;
    box-shadow: inset 0 0 0 1px rgba(36, 27, 46, 0.08);

    &:focus {
      box-shadow: inset 0 0 0 1.5px var(--rose);
    }

    // Chrome/Safari spinners eat the available width in a 58px cell.
    &::-webkit-outer-spin-button,
    &::-webkit-inner-spin-button {
      appearance: none;
      margin: 0;
    }
    appearance: textfield;
  }

  &__check-col {
    display: grid;
    place-items: center;
    color: var(--violet-45);
  }

  &__check {
    width: 28px;
    height: 28px;
    justify-self: center;
    border-radius: 9px;
    background: rgba(36, 27, 46, 0.07);
    color: var(--paper-raised);
    display: grid;
    place-items: center;
    transition: background 0.15s ease;

    &--on {
      background: var(--rose);
    }

    &:disabled {
      opacity: 0.6;
      cursor: default;
    }
  }

  &__add {
    margin-top: 12px;
    height: 40px;
    border-radius: var(--radius-pill);
    background: rgba(36, 27, 46, 0.05);
    color: var(--rose);
    font-weight: 700;
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }

  &__menu {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  &__menu-label {
    font-family: var(--font-eyebrow);
    text-transform: uppercase;
    letter-spacing: 1px;
    font-size: 10px;
    font-weight: 700;
    color: var(--violet-45);
  }

  &__menu-area {
    width: 100%;
    padding: 12px 14px;
    background: var(--paper);
    border-radius: var(--radius-md);
    box-shadow: inset 0 0 0 1.5px rgba(36, 27, 46, 0.1);
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--ink);
    border: none;
    outline: none;
    resize: none;
  }
}
</style>
