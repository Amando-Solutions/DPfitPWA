<script setup lang="ts">
import { FIT_FOR_YOU, NOT_FOR_YOU } from '~/data/landing'
</script>

<template>
  <section class="bg-page py-20 lg:py-[120px]">
    <PageContainer>
      <div class="max-w-[620px]">
        <p class="eyebrow-section text-[var(--rose-fill)]">Is this for you</p>
        <h2 class="title-section mt-[18px] text-ink">
          Be honest with yourself before you join.
        </h2>
      </div>

      <!--
        The two columns are deliberately not symmetrical in weight: the green
        one is tinted and the rose one is plain white, so the page reads as
        "here is who this is for, and here is the honest exception" rather than
        as a pros-and-cons table.

        `items-start` keeps each card at its own height. Stretching the shorter
        column to match would leave a block of empty tint under the last row,
        which reads as a missing item.
      -->
      <div class="mt-14 grid items-start gap-8 lg:mt-[56px] lg:grid-cols-2">
        <div
          class="rounded-[20px] border border-[rgba(86,100,58,0.28)] bg-[rgba(86,100,58,0.06)] p-8 lg:p-[41px]"
        >
          <h3 class="font-body text-[16px] font-semibold text-[var(--macro-carbs)]">
            This challenge is for you if:
          </h3>
          <ul class="mt-1.5">
            <li
              v-for="line in FIT_FOR_YOU"
              :key="line"
              class="flex gap-3 border-b border-[var(--rule-soft)] py-3.5 last:border-b-0"
            >
              <span
                aria-hidden="true"
                class="font-body text-[15px] leading-[1.55] font-semibold text-[var(--macro-carbs)]"
              >
                ✓
              </span>
              <span class="font-body text-[15px] leading-[1.55] text-soft">
                {{ line }}
              </span>
            </li>
          </ul>
        </div>

        <div
          class="rounded-[20px] border border-[rgba(36,27,46,0.12)] bg-white p-8 lg:p-[41px]"
        >
          <h3 class="font-body text-[16px] font-semibold text-[var(--rose-fill)]">
            This isn't the right fit if:
          </h3>
          <ul class="mt-1.5">
            <li
              v-for="line in NOT_FOR_YOU"
              :key="line"
              class="flex gap-3 border-b border-[var(--rule-soft)] py-3.5 last:border-b-0"
            >
              <span
                aria-hidden="true"
                class="font-body text-[15px] leading-[1.55] font-semibold text-[var(--rose-fill)]"
              >
                ✕
              </span>
              <span class="font-body text-[15px] leading-[1.55] text-soft">
                {{ line }}
              </span>
            </li>
          </ul>
        </div>
      </div>
    </PageContainer>
  </section>
</template>
