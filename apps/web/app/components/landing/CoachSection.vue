<script setup lang="ts">
import { COACH } from '~/data/landing'
</script>

<template>
  <section id="coach" class="mx-auto max-w-300 px-6 pt-20 pb-10 md:pt-30">
    <div class="grid grid-cols-1 items-center gap-x-20 gap-y-8 md:grid-cols-2 md:gap-y-12">
      <!--
        She sits right of centre with her feet near the right edge, so narrow
        panels crop toward her, and wide ones drop slightly to keep her shoes.
        Downsized from `meet-the-coach-original.jpg`. A portrait 4:5 on a phone,
        where the fixed desktop height came out nearly twice as tall as wide.
      -->
      <img
        src="/landing/meet-the-coach.jpg"
        :alt="`Coach ${COACH.first} ${COACH.last}`"
        width="1080"
        height="1440"
        loading="lazy"
        decoding="async"
        class="lp-reveal aspect-4/5 w-full rounded-3xl bg-lp-lilac-300 object-cover object-[72%_55%] md:aspect-auto md:h-145 md:rounded-[28px]"
      >

      <div class="lp-reveal flex flex-col gap-5 md:gap-6">
        <div class="flex flex-col gap-3 md:gap-4">
          <span class="lp-eyebrow">meet your coach</span>
          <h2 class="lp-h2-lg">{{ COACH.first }} <span class="serif-accent">{{ COACH.last }}</span></h2>
        </div>
        <p class="m-0 max-w-120 text-[16px] leading-[1.75] text-lp-soft">{{ COACH.bio }}</p>
        <!-- `justify-end` because the column is reversed: it packs the figure
             to the top of the cell, so the two figures share a line even when
             one caption wraps. -->
        <dl class="m-0 mt-2 grid max-w-120 grid-cols-2 gap-x-6 border-t border-lp-rule md:mt-4">
          <div v-for="stat in COACH.stats" :key="stat.caption" class="flex flex-col-reverse justify-end gap-2.5 pt-6">
            <dt class="text-[13px] leading-snug text-lp-soft">{{ stat.caption }}</dt>
            <dd class="m-0 text-[clamp(32px,3.6vw,46px)] leading-none font-medium tracking-[-0.03em] whitespace-nowrap">
              {{ stat.value }}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  </section>
</template>
