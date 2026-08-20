<script setup lang="ts">
// 18 · Fuel · Daily Targets — computed from the member's own numbers.
definePageMeta({ layout: 'app' })

import { targetsBreakdown } from '~/lib/domain/nutrition'

const store = useAppStore()
const targets = computed(() => store.targets.value)
const breakdown = computed(() => targetsBreakdown(targets.value))
const allergies = computed(() => store.profile.value?.allergies?.trim() ?? '')
</script>

<template>
  <div class="fuel">
    <ScreenIntro
      eyebrow="Your targets"
      title="Daily fuel"
      subtitle="Calculated from your profile. No logging, no counting — just hit these."
      class="fuel__header"
    />

    <!-- Calories + macros -->
    <div class="macros">
      <div class="macros__cal">
        <span class="macros__cal-label">Daily calories</span>
        <span class="macros__cal-value">{{ targets.kcalTarget }}</span>
        <span class="macros__cal-meta data">kcal · {{ targets.approach.toLowerCase() }}</span>
      </div>

      <div class="macro macro--protein">
        <span class="macro__value">{{ targets.proteinG }}g</span>
        <span class="macro__label data">Protein</span>
      </div>

      <div class="macro macro--fat">
        <span class="macro__value">{{ targets.fatG }}g</span>
        <span class="macro__label data">Fat</span>
      </div>

      <div class="macro macro--carbs">
        <span class="macro__value">{{ targets.carbsG }}g</span>
        <span class="macro__label data">Carbs</span>
      </div>
    </div>

    <!-- Your numbers -->
    <section class="numbers">
      <h2 class="numbers__title data">✂ your numbers</h2>
      <div class="numbers__rows">
        <div v-for="row in breakdown" :key="row.label" class="numbers__row">
          <span class="data">{{ row.label }}</span>
          <span class="numbers__value data">{{ row.value }}</span>
        </div>
        <div class="numbers__row numbers__row--total">
          <span class="numbers__total-label">Daily target</span>
          <span class="numbers__total-value data">{{ targets.kcalTarget }} kcal</span>
        </div>
      </div>
    </section>

    <!-- Plate structure -->
    <section class="note note--plate">
      <h2 class="note__title">Suggested plate structure</h2>
      <p class="note__body">{{ targets.plateStructure }}</p>
    </section>

    <!-- Allergies -->
    <section class="note note--allergy">
      <h2 class="note__title">Allergy &amp; restriction note</h2>
      <p class="note__body">
        {{
          allergies
            ? `You told us: ${allergies}. Swaps that avoid it show up here.`
            : 'No restrictions are on file. Tell us in Profile & Settings and swaps show up here.'
        }}
      </p>
    </section>
  </div>
</template>

<style scoped lang="scss">
.fuel {
  padding: var(--screen-pad-top) 20px 0;
}

// --- Calories + macros grid -------------------------------------------------
.macros {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 11px;
  margin-top: 28px;

  &__cal {
    grid-column: span 2;
    display: flex;
    flex-direction: column;
    padding: 20px;
    border-radius: var(--radius-card);
    background: var(--ink);
    filter: drop-shadow(0 14px 16px rgba(36, 27, 46, 0.22));
  }

  &__cal-label {
    font-family: var(--font-eyebrow);
    text-transform: uppercase;
    letter-spacing: 0.95px;
    font-size: 9.5px;
    font-weight: 700;
    color: rgba(243, 234, 228, 0.55);
  }

  &__cal-value {
    margin-top: 6px;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 44px;
    line-height: 1;
    letter-spacing: -1.32px;
    color: var(--paper-raised);
  }

  &__cal-meta {
    margin-top: 6px;
    font-size: 11px;
    color: rgba(243, 234, 228, 0.5);
  }
}

.macro {
  display: flex;
  flex-direction: column;
  padding: 17px;
  border-radius: var(--radius-card);
  border: 1px solid transparent;

  &__value {
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 24px;
    line-height: 1.2;
    letter-spacing: -0.6px;
  }

  &__label {
    margin-top: 4px;
    text-transform: uppercase;
    letter-spacing: 0.76px;
    font-size: 9.5px;
    color: var(--violet-28);
  }

  &--protein {
    background: rgba(200, 30, 92, 0.1);
    border-color: rgba(200, 30, 92, 0.24);

    .macro__value {
      color: var(--rose);
    }
  }

  &--fat {
    background: var(--orange-16);
    border-color: rgba(232, 163, 61, 0.32);

    .macro__value {
      color: #b07520;
    }
  }

  // Carbs spans the row and sets its value and label on one baseline.
  &--carbs {
    grid-column: span 2;
    flex-direction: row;
    align-items: baseline;
    gap: 8px;
    background: rgba(86, 100, 58, 0.14);
    border-color: rgba(86, 100, 58, 0.28);

    .macro__value {
      color: #56643a;
    }

    .macro__label {
      margin-top: 0;
    }
  }
}

// --- Your numbers -----------------------------------------------------------
.numbers {
  margin-top: 11px;
  padding: 18px;
  border-radius: var(--radius-card);
  border: 1px dashed rgba(36, 27, 46, 0.22);

  &__title {
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 1.2px;
    font-size: 10px;
    font-weight: 700;
    color: var(--violet-28);
  }

  &__rows {
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding-top: 12px;
  }

  &__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: 12px;
    color: var(--violet-28);

    &--total {
      margin-top: 1px;
      padding-top: 10px;
      border-top: 1px dashed rgba(36, 27, 46, 0.2);
    }
  }

  &__value {
    color: var(--ink);
  }

  &__total-label {
    font-family: var(--font-eyebrow);
    font-weight: 700;
    font-size: 12px;
    color: var(--ink);
  }

  &__total-value {
    font-weight: 700;
    color: var(--rose);
  }
}

// --- Prose cards ------------------------------------------------------------
.note {
  margin-top: 12px;
  padding: 18px;
  border-radius: var(--radius-card);
  background: var(--paper-raised);
  border: 1px solid rgba(36, 27, 46, 0.09);
  filter: drop-shadow(0 4px 7px rgba(36, 27, 46, 0.04));

  &__title {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 16px;
    letter-spacing: -0.24px;
    color: var(--ink);
  }

  &__body {
    margin: 7px 0 0;
    font-size: 13.5px;
    line-height: 1.55;
    color: var(--violet-28);
  }
}

// Desktop: targets on the left, the explainer column on the right.
@media (min-width: 1024px) {
  .fuel {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    grid-template-areas:
      'header  header'
      'macros  numbers'
      'macros  plate'
      'macros  allergy';
    align-content: start;
    align-items: start;
    column-gap: 24px;
    row-gap: 14px;
    padding: 0 0 8px;

    &__header {
      grid-area: header;
    }
  }

  .macros {
    grid-area: macros;
    margin-top: 10px;
  }

  .macros__cal-value {
    font-size: 56px;
  }

  .numbers {
    grid-area: numbers;
    margin-top: 10px;
  }

  .note {
    margin-top: 0;

    &--plate {
      grid-area: plate;
    }

    &--allergy {
      grid-area: allergy;
    }
  }
}
</style>
