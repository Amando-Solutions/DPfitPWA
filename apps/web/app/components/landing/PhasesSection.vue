<script setup lang="ts">
import { PHASES, WEEKLY_ITEMS } from '~/data/landing'
</script>

<template>
  <section id="weeks" class="bg-[var(--text)] py-20 lg:py-[120px]">
    <PageContainer>
      <div class="max-w-[620px]">
        <p class="eyebrow-section text-[var(--orange)]">How the 6 weeks unfold</p>
        <h2 class="title-section mt-[18px] text-white">
          A real progression, not the same workout on repeat.
        </h2>
      </div>

      <ol class="mt-14 grid gap-6 md:grid-cols-3 lg:mt-[68px] lg:gap-[42px]">
        <!--
          The middle card is the turn of the challenge — it is the week the
          overload guide unlocks — so it is the one drawn in rose while its
          neighbours stay as tinted glass.
        -->
        <li
          v-for="phase in PHASES"
          :key="phase.title"
          class="rounded-[20px] border p-8 lg:p-[37px]"
          :class="
            phase.featured
              ? 'border-[rgba(200,30,92,0.4)] bg-[rgba(200,30,92,0.14)]'
              : 'border-white/12 bg-white/5'
          "
        >
          <p class="eyebrow-section text-[11px] text-[var(--orange)]">
            {{ phase.weeks }}
          </p>
          <h3 class="title-card mt-3 text-white">{{ phase.title }}</h3>
          <p class="mt-2.5 font-body text-[15px] leading-[1.65] text-white/70">
            {{ phase.description }}
          </p>
        </li>
      </ol>

      <div
        class="mt-16 grid gap-10 border-t border-rule-inverse pt-14 lg:mt-[84px] lg:grid-cols-2 lg:gap-[56px] lg:pt-[57px]"
      >
        <div>
          <h3 class="font-display max-w-[335px] text-[32px] leading-[1.1] font-black tracking-[-0.02em] text-white">
            What you get every single week.
          </h3>
          <p class="mt-3.5 font-body text-[15.5px] text-white/66">
            You're never doing this alone.
          </p>
        </div>

        <ol class="grid gap-8 sm:grid-cols-2">
          <li v-for="(item, i) in WEEKLY_ITEMS" :key="item.title">
            <p class="font-data text-[11px] text-[var(--rose-fill)]">
              {{ String(i + 1).padStart(2, '0') }}
            </p>
            <h4 class="mt-2 font-body text-[16px] font-semibold text-white">
              {{ item.title }}
            </h4>
            <p class="mt-1.5 font-body text-[14.5px] leading-[1.6] text-white/66">
              {{ item.description }}
            </p>
          </li>
        </ol>
      </div>
    </PageContainer>
  </section>
</template>
