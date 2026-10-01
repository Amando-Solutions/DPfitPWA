<script setup lang="ts">
import { COACH } from '~/data/landing'
</script>

<template>
  <section id="coach" class="mx-auto max-w-300 px-6 pt-30 pb-10">
    <div class="grid grid-cols-1 items-center gap-x-20 gap-y-12 md:grid-cols-2">
      <!--
        She sits right of centre with her feet near the right edge, so narrow
        panels crop toward her, and wide ones drop slightly to keep her shoes.
        Downsized from `meet-the-coach-original.jpg`.
      -->
      <img
        src="/landing/meet-the-coach.jpg"
        :alt="`Coach ${COACH.first} ${COACH.last}`"
        width="1080"
        height="1440"
        loading="lazy"
        decoding="async"
        class="lp-reveal h-145 w-full rounded-[28px] bg-lp-lilac-300 object-cover object-[72%_55%]"
      >

      <div class="lp-reveal flex flex-col gap-6">
        <span class="lp-eyebrow">meet your coach</span>
        <h2 class="lp-h2-lg">{{ COACH.first }} <span class="serif-accent">{{ COACH.last }}</span></h2>
        <p class="m-0 max-w-120 text-[16px] leading-[1.75] text-lp-soft">{{ COACH.bio }}</p>
        <dl class="m-0 mt-4 grid max-w-120 grid-cols-2 border-t border-lp-rule">
          <div v-for="stat in COACH.stats" :key="stat.caption" class="flex flex-col-reverse gap-1.5 pt-6">
            <dt class="text-[13px] text-lp-soft">{{ stat.caption }}</dt>
            <dd class="m-0 text-[46px] font-medium tracking-[-0.03em]">{{ stat.value }}</dd>
          </div>
        </dl>
      </div>
    </div>
  </section>
</template>
