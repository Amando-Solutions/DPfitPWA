<script setup lang="ts">
import { RECOMP_CELLS } from '~/data/landing'

const TONES = {
  neutral: 'bg-white text-soft',
  accent: 'bg-white text-[var(--rose-fill)]',
  ink: 'bg-[var(--text)] text-white',
} as const
</script>

<template>
  <section class="bg-page py-20 lg:py-[126px]">
    <PageContainer>
      <div class="grid gap-10 lg:grid-cols-2 lg:gap-[70px]">
        <div>
          <p class="eyebrow-section text-[var(--rose-fill)]">
            The problem with most programs
          </p>
          <h2 class="title-section mt-5 text-ink">
            They make you pick a lane. Your body doesn't work that way.
          </h2>
        </div>
        <p class="font-body text-[17px] leading-[1.72] text-soft lg:self-end">
          Fat-loss-only programs starve your progress in the gym. Bulk-only
          programs pile on fat you didn't want. Recomp is the smarter middle
          path. Whether you're brand new or you've been at this a while, the
          right training stimulus and the right fuel get your body doing both at
          once.
        </p>
      </div>

      <!--
        Fat down, muscle up, recomp. The operators are badges pinned to the
        seams between cells rather than cells of their own, which is why the
        grid is three columns wide and the "+" and "=" are positioned children.
        Below `sm` the cells stack and the badges are dropped: a "+" floating on
        a vertical seam reads as a stray glyph, and the labels alone carry the
        same meaning.
      -->
      <div class="relative mt-14 lg:mt-[68px]">
        <div
          class="grid gap-px overflow-hidden rounded-[20px] border border-[var(--rule-soft)] bg-[var(--rule-soft)] shadow-[0_24px_60px_rgba(36,27,46,0.07)] sm:grid-cols-3"
        >
          <div
            v-for="cell in RECOMP_CELLS"
            :key="cell.symbol"
            class="flex flex-col items-center justify-center p-[34px]"
            :class="TONES[cell.tone]"
          >
            <p
              class="font-display font-black"
              :class="
                cell.label
                  ? 'text-[46px] leading-[46px]'
                  : 'text-[30px] tracking-[-0.025em]'
              "
            >
              {{ cell.symbol }}
            </p>
            <p v-if="cell.label" class="meta mt-4 text-ink">{{ cell.label }}</p>
          </div>
        </div>

        <div
          aria-hidden="true"
          class="pointer-events-none absolute inset-0 hidden sm:block"
        >
          <span
            v-for="(cell, i) in RECOMP_CELLS"
            v-show="cell.joiner"
            :key="cell.symbol"
            class="font-display absolute top-1/2 flex size-[46px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-pill border-[1.5px] border-[var(--text)] bg-surface text-[24px] font-black text-ink"
            :style="{ left: `${(i / RECOMP_CELLS.length) * 100}%` }"
          >
            {{ cell.joiner }}
          </span>
        </div>
      </div>
    </PageContainer>
  </section>
</template>
