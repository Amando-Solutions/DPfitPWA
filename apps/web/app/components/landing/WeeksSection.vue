<script setup lang="ts">
import { DEFAULT_WEEK_FOCUSES, numberWord } from '~/data/landing'

/**
 * One card per week of the program.
 *
 * The weeks come from the cohort's published program in Firestore (title and
 * subtitle); the design's six focuses stand in only when it has none. The
 * cards walk down the lilac ramp to plum, so whatever the program's length the
 * first is the palest and the last is the darkest.
 */
const { challenge, weeks } = useCohortLabels()

const RAMP = [
  { bg: 'bg-lp-lilac-50', chip: 'bg-white/80', light: false },
  { bg: 'bg-lp-lilac-150', chip: 'bg-white/80', light: false },
  { bg: 'bg-lp-lilac-200', chip: 'bg-white/80', light: false },
  { bg: 'bg-lp-lilac-300', chip: 'bg-white/85', light: false },
  { bg: 'bg-lp-lilac-500', chip: 'bg-white text-lp-ink', light: true },
  { bg: 'bg-lp-ink', chip: 'bg-lp-paper text-lp-ink', light: true },
] as const

const cards = computed(() => {
  const fromProgram = (challenge.value?.weeks ?? []).filter((w) => w.title || w.subtitle)
  const list = fromProgram.length
    ? fromProgram.map((w) => ({ number: w.number, title: w.title || `week ${w.number}`, description: w.subtitle }))
    : DEFAULT_WEEK_FOCUSES.map((w, i) => ({ number: i + 1, ...w }))
  const last = Math.max(1, list.length - 1)
  return list.map((week, i) => ({
    ...week,
    label: `week ${numberWord(week.number)}`,
    tone: RAMP[Math.round((i * (RAMP.length - 1)) / last)]!,
  }))
})

const count = computed(() => numberWord(cards.value.length || weeks.value || 6))
</script>

<template>
  <section id="weeks" class="mx-auto max-w-[1200px] px-6 pt-[120px] pb-10">
    <div class="lp-reveal mb-14 flex flex-wrap items-end justify-between gap-6">
      <h2 class="lp-h2">{{ count }} weeks, <span class="serif-accent">{{ count }} focuses</span></h2>
      <span class="max-w-[340px] text-[15px] text-lp-soft">
        Every week has one clear focus, so you build skill, strength and habits
        step by step.
      </span>
    </div>

    <ol class="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-x-6 gap-y-14 p-0">
      <li v-for="week in cards" :key="week.number" class="lp-lift lp-reveal flex flex-col gap-5">
        <div
          class="flex h-[270px] flex-col justify-between overflow-hidden rounded-3xl p-[22px]"
          :class="week.tone.bg"
        >
          <span class="lp-chip self-start px-3 py-[7px] tracking-[0.1em]" :class="week.tone.chip">
            {{ week.label }}
          </span>
          <span
            class="lp-wknum self-end text-[160px] leading-[0.78] font-semibold tracking-[-0.07em]"
            :class="week.tone.light && 'is-light'"
            :style="{ WebkitTextStroke: `1.5px ${week.tone.light ? 'var(--lp-paper)' : 'var(--lp-ink)'}` }"
            aria-hidden="true"
          >{{ String(week.number).padStart(2, '0') }}</span>
        </div>
        <div class="flex flex-col gap-2.5">
          <h3 class="serif-accent m-0 text-[38px] leading-none">{{ week.title }}</h3>
          <p v-if="week.description" class="m-0 text-[15px] leading-[1.65] text-lp-soft">
            {{ week.description }}
          </p>
        </div>
      </li>
    </ol>
  </section>
</template>
