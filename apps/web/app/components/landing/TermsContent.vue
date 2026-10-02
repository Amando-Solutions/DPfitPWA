<script setup lang="ts">
import { TERMS_CLAUSE, TERMS_POINTS } from '~/data/terms'

/**
 * The terms themselves, below whatever title the caller gives them: the
 * `/terms` page, and the modal the booking form opens. One component so the
 * two cannot drift into saying different things.
 */
const props = withDefaults(
  defineProps<{
    /** The level of the clause card's heading, one below the caller's title. */
    level?: 2 | 3
  }>(),
  { level: 2 },
)

const heading = computed(() => `h${props.level}`)
</script>

<template>
  <div class="flex flex-col gap-10">
    <ul class="m-0 flex list-disc flex-col gap-2.5 pl-5 text-[15.5px] leading-[1.7] text-lp-soft marker:text-lp-accent">
      <li v-for="point in TERMS_POINTS" :key="point.title">
        <b class="font-semibold text-lp-ink">{{ point.title }}</b> {{ point.text }}
      </li>
    </ul>

    <!-- What the box on the booking form commits somebody to, carded so it
         reads apart from the points above. -->
    <section
      :id="TERMS_CLAUSE.id"
      class="flex scroll-mt-4 flex-col gap-3 rounded-[20px] border border-lp-edge bg-lp-lilac-50 p-5 sm:p-6"
    >
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <component :is="heading" class="m-0 text-[16.5px] leading-snug font-semibold">{{ TERMS_CLAUSE.title }}</component>
        <span class="lp-chip bg-white px-2.5 py-1 text-lp-accent">required</span>
      </div>
      <p class="m-0 text-[15px] leading-[1.7] text-lp-soft">{{ TERMS_CLAUSE.lead }}</p>
      <ul class="m-0 flex list-disc flex-col gap-1.5 pl-5 text-[15px] leading-[1.7] text-lp-ink marker:text-lp-accent">
        <li v-for="point in TERMS_CLAUSE.points" :key="point">{{ point }}</li>
      </ul>
    </section>
  </div>
</template>
