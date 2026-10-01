<script setup lang="ts">
import { FIT_FOR_YOU, NOT_FOR_YOU } from '~/data/landing'
</script>

<template>
  <section class="lp-reveal mx-auto max-w-300 px-6 pt-20 pb-10 md:pt-30">
    <h2 class="lp-h2 mb-8 md:mb-12">is this <span class="serif-accent">for you?</span></h2>
    <!-- Each panel's heading is set a step above its lines, not below them, so
         it reads as the title of the list rather than one more item in it. -->
    <div class="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-4 sm:gap-6">
      <div class="flex flex-col rounded-3xl border border-lp-edge bg-white p-6 sm:p-8">
        <h3 class="m-0 mb-1 text-[18px] font-semibold text-lp-accent">This is for you if</h3>
        <ul class="m-0 list-none p-0">
          <li
            v-for="line in FIT_FOR_YOU"
            :key="line"
            class="border-b border-lp-edge py-4 text-[15px] leading-normal last:border-b-0 last:pb-0 sm:py-4.5 sm:text-[16px]"
          >
            {{ line }}
          </li>
        </ul>
      </div>
      <div class="flex flex-col rounded-3xl bg-lp-lilac-50 p-6 sm:p-8">
        <h3 class="m-0 mb-1 text-[18px] font-semibold text-lp-soft-deep">This is not for you if</h3>
        <ul class="m-0 list-none p-0">
          <li
            v-for="line in NOT_FOR_YOU"
            :key="line"
            class="border-b border-lp-rule-lilac py-4 text-[15px] leading-normal text-lp-soft-deep last:border-b-0 last:pb-0 sm:py-4.5 sm:text-[16px]"
          >
            {{ line }}
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
