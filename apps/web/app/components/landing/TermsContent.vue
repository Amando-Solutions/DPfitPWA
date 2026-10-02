<script setup lang="ts">
import {
  TERMS_CLAUSE,
  TERMS_SECTIONS,
  TERMS_SUMMARY,
  TERMS_SUMMARY_NOTE,
} from '~/data/terms'

/**
 * The terms themselves, below whatever title the caller gives them: the
 * `/terms` page, and the modal the booking form opens. One component so the
 * two cannot drift into saying different things.
 */
const props = withDefaults(
  defineProps<{
    /** The level of the top headings here; their cards sit one below. */
    level?: 2 | 3
  }>(),
  { level: 2 },
)

const heading = computed(() => `h${props.level}`)
const subheading = computed(() => `h${props.level + 1}`)

const { contactEmail } = useRuntimeConfig().public
</script>

<template>
  <div class="flex flex-col gap-10">
    <section class="flex flex-col gap-4">
      <component :is="heading" class="m-0 text-[18px] font-semibold">The short version</component>
      <p class="m-0 text-[14px] leading-[1.6] text-lp-soft italic">{{ TERMS_SUMMARY_NOTE }}</p>
      <ul class="m-0 flex list-disc flex-col gap-2.5 pl-5 text-[15.5px] leading-[1.7] text-lp-soft marker:text-lp-accent">
        <li v-for="point in TERMS_SUMMARY" :key="point.title">
          <b class="font-semibold text-lp-ink">{{ point.title }}</b> {{ point.text }}
        </li>
      </ul>
    </section>

    <!-- What the box on the booking form commits somebody to, carded so it
         reads apart from the summary above. -->
    <section
      :id="TERMS_CLAUSE.id"
      class="flex scroll-mt-4 flex-col gap-3 rounded-[20px] border border-lp-edge bg-lp-lilac-50 p-5 sm:p-6"
    >
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <component :is="subheading" class="m-0 text-[16.5px] leading-snug font-semibold">{{ TERMS_CLAUSE.title }}</component>
        <span class="lp-chip bg-white px-2.5 py-1 text-lp-accent">required</span>
      </div>
      <p class="m-0 text-[15px] leading-[1.7] text-lp-soft">{{ TERMS_CLAUSE.lead }}</p>
      <ul class="m-0 flex list-disc flex-col gap-1.5 pl-5 text-[15px] leading-[1.7] text-lp-ink marker:text-lp-accent">
        <li v-for="point in TERMS_CLAUSE.points" :key="point">{{ point }}</li>
      </ul>
    </section>

    <section
      v-for="(section, i) in TERMS_SECTIONS"
      :key="section.title"
      class="flex flex-col gap-3 border-t border-lp-rule pt-6"
    >
      <component :is="heading" class="m-0 text-[18px] font-semibold">
        <span class="mr-2 text-lp-accent tabular-nums">{{ String(i + 1).padStart(2, '0') }}</span>{{ section.title }}
      </component>
      <p v-for="paragraph in section.paragraphs" :key="paragraph" class="m-0 text-[15.5px] leading-[1.7] text-lp-soft">
        {{ paragraph }}
      </p>
    </section>

    <section class="flex flex-col gap-3 border-t border-lp-rule pt-6">
      <component :is="heading" class="m-0 text-[18px] font-semibold">Questions</component>
      <p class="m-0 text-[15.5px] leading-[1.7] text-lp-soft">
        <template v-if="contactEmail">
          Email <a :href="`mailto:${contactEmail}`" class="font-semibold text-lp-ink underline underline-offset-3">{{ contactEmail }}</a>
          and we'll get back to you.
        </template>
        <template v-else>Get in touch with us before you book and we'll get back to you.</template>
      </p>
    </section>
  </div>
</template>
