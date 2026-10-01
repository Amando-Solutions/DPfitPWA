<script setup lang="ts">
import { numberWord } from '~/data/landing'

const { weeks } = useCohortLabels()
</script>

<template>
  <!-- Centred through and through on a phone: a centred line over a
       full-width, left-set paragraph read as two different alignments. -->
  <section class="lp-reveal flex flex-col items-center px-6 pt-20 pb-10 md:pt-30">
    <h2
      class="m-0 max-w-250 text-center text-[clamp(34px,4.8vw,68px)] leading-[1.08] font-medium tracking-[-0.035em] text-balance"
    >
      stronger legs. leaner body.
      <span class="serif-accent">results that last.</span>
    </h2>
    <p class="mt-6 max-w-130 text-center text-[16px] leading-[1.7] text-pretty text-lp-soft sm:mt-11 sm:text-left sm:leading-[1.75]">
      Body recomposition is not about eating less and doing endless cardio. It
      is about training with intent, eating enough to build muscle and letting
      the fat loss follow. For {{ numberWord(weeks ?? 6) }} weeks you get the
      program, the structure and the accountability to do exactly that.
    </p>
  </section>
</template>
