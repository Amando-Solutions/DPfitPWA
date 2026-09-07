<script setup lang="ts">
import { GALLERY } from '~/data/landing'
</script>

<template>
  <section class="bg-page pb-20 lg:pb-[120px]">
    <PageContainer>
      <div
        class="flex items-baseline justify-between border-b border-[var(--rule)] pb-4"
      >
        <p class="meta text-[var(--rose-fill)]">Inside the challenge</p>
        <p class="font-data text-[11px] tracking-[0.1em] text-[#9a8fa2] uppercase">
          DP Fitness
        </p>
      </div>

      <!--
        Three portraits at one aspect ratio, so the row reads as a single strip
        rather than three photographs of different shapes. Below `sm` they stack
        and get shorter, because a 476px-tall image on a phone is a whole
        screenful of nothing but photograph.
      -->
      <ul class="mt-7 grid gap-5 sm:grid-cols-3">
        <li v-for="image in GALLERY" :key="image.src">
          <img
            :src="image.src"
            :alt="image.alt"
            :width="image.width"
            :height="image.height"
            loading="lazy"
            class="h-[280px] w-full rounded-[16px] object-cover sm:h-[340px] lg:h-[476px]"
          >
        </li>
      </ul>
    </PageContainer>
  </section>
</template>
