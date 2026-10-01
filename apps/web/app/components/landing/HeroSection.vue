<script setup lang="ts">
import { APP_NAME, PROOF, PROOF_AVATARS, REGISTER_ANCHOR, TRAINING_DAYS } from '~/data/landing'

const { weeks, startsShort, closesShort, opensShort, state } = useCohortLabels()

const eyebrow = computed(() =>
  weeks.value ? `${weeks.value}-week coaching challenge for women` : 'coaching challenge for women')

/**
 * The four facts under the headline. The last one follows the pre-order: it
 * says when enrolment closes while it can, and when it opens before then.
 */
const stats = computed(() => [
  { label: 'duration', value: weeks.value ? `${weeks.value} ${weeks.value === 1 ? 'week' : 'weeks'}` : '—' },
  { label: 'starts', value: startsShort.value ?? 'to be announced' },
  { label: 'training', value: `${TRAINING_DAYS} days a week` },
  state.value === 'upcoming' && opensShort.value
    ? { label: 'enrolment opens', value: opensShort.value }
    : { label: state.value === 'closed' ? 'enrolment closed' : 'enrolment closes', value: closesShort.value ?? 'to be announced' },
])
</script>

<template>
  <section
    class="mx-auto flex max-w-300 flex-wrap items-end justify-between gap-10 px-6 pt-20 pb-18"
  >
    <div class="max-w-200 flex-[1_1_560px]">
      <p class="lp-hero-in lp-eyebrow mb-5.5">{{ eyebrow }}</p>
      <h1
        class="lp-hero-in d2 m-0 text-[clamp(46px,6.8vw,100px)] leading-[0.98] font-medium tracking-[-0.04em]"
      >
        body recomp
        <span class="serif-accent tracking-[-0.02em]">challenge</span>
      </h1>
      <p class="lp-hero-in d3 mt-7 max-w-120 text-[17px] leading-[1.6] text-lp-soft">
        Build muscle and lose fat at the same time. A structured gym program,
        weekly check-ins and a community of goal-driven women, all inside the
        {{ APP_NAME }}.
      </p>
    </div>

    <div class="lp-hero-in d3 flex flex-col gap-5 pb-2">
      <div class="flex flex-wrap gap-3">
        <CtaButton href="#results" variant="outline">see the results ↗</CtaButton>
        <CtaButton :href="REGISTER_ANCHOR">book a slot ↗</CtaButton>
      </div>
      <div class="flex items-center gap-3">
        <div class="flex" aria-hidden="true">
          <img
            v-for="(src, i) in PROOF_AVATARS"
            :key="src"
            :src="src"
            alt=""
            width="32"
            height="32"
            class="size-8 rounded-full border-2 border-lp-paper bg-lp-lilac-200 object-cover"
            :class="{ '-ml-2.5': i > 0 }"
          >
        </div>
        <span class="text-[14px] text-lp-soft">
          <b class="font-semibold text-lp-ink">{{ PROOF.strong }}</b> {{ PROOF.rest }}
        </span>
      </div>
    </div>
  </section>

  <section class="lp-reveal mx-auto max-w-300 px-6">
    <dl class="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] border-t border-lp-rule">
      <div v-for="stat in stats" :key="stat.label" class="flex flex-col gap-2 py-6 pr-6">
        <dt class="text-[13px] text-lp-soft">{{ stat.label }}</dt>
        <dd class="m-0 text-[26px] font-medium tracking-[-0.02em]">{{ stat.value }}</dd>
      </div>
    </dl>
  </section>
</template>
