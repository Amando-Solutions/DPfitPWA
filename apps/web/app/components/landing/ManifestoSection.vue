<script setup lang="ts">
import { numberWord } from '~/data/landing'

const { weeks } = useCohortLabels()
</script>

<template>
  <section class="lp-reveal flex flex-col items-center px-6 pt-[120px] pb-10">
    <h2
      class="m-0 max-w-[1000px] text-center text-[clamp(34px,4.8vw,68px)] leading-[1.08] font-medium tracking-[-0.035em]"
    >
      stronger legs. leaner body.
      <span class="serif-accent">results that last.</span>
    </h2>
    <p class="mt-11 max-w-[520px] text-[16px] leading-[1.75] text-lp-soft">
      Body recomposition is not about eating less and doing endless cardio. It
      is about training with intent, eating enough to build muscle and letting
      the fat loss follow. For {{ numberWord(weeks ?? 6) }} weeks you get the
      program, the structure and the accountability to do exactly that.
    </p>
  </section>
</template>
