<script setup lang="ts">
import { FIT_FOR_YOU, NOT_FOR_YOU } from '~/data/landing'
</script>

<template>
  <section class="lp-reveal mx-auto max-w-[1200px] px-6 pt-[120px] pb-10">
    <h2 class="lp-h2 mb-12">is this <span class="serif-accent">for you?</span></h2>
    <div class="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-6">
      <div class="flex flex-col rounded-3xl border border-lp-edge bg-white p-8">
        <h3 class="m-0 mb-2 text-[15px] font-semibold text-lp-accent">This is for you if</h3>
        <ul class="m-0 list-none p-0">
          <li
            v-for="line in FIT_FOR_YOU"
            :key="line"
            class="border-b border-lp-edge py-[18px] text-[16px] leading-[1.5] last:border-b-0 last:pb-0"
          >
            {{ line }}
          </li>
        </ul>
      </div>
      <div class="flex flex-col rounded-3xl bg-lp-lilac-50 p-8">
        <h3 class="m-0 mb-2 text-[15px] font-semibold text-lp-soft">This is not for you if</h3>
        <ul class="m-0 list-none p-0">
          <li
            v-for="line in NOT_FOR_YOU"
            :key="line"
            class="border-b border-lp-rule-lilac py-[18px] text-[16px] leading-[1.5] text-lp-soft-deep last:border-b-0 last:pb-0"
          >
            {{ line }}
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
