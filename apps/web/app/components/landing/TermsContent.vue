<script setup lang="ts">
import { TERMS_SECTIONS } from '~/data/terms'

/**
 * The terms themselves, below whatever title the caller gives them: the
 * `/terms` page, and the modal the booking form opens. One component so the
 * two cannot drift into saying different things.
 */
const props = withDefaults(
  defineProps<{
    /** The level of the section headings, one below the caller's title. */
    level?: 2 | 3
  }>(),
  { level: 2 },
)

const heading = computed(() => `h${props.level}`)
</script>

<template>
  <div class="flex flex-col gap-8">
    <section
      v-for="(section, i) in TERMS_SECTIONS"
      :key="section.title"
      class="flex flex-col gap-3 border-t border-lp-rule pt-6 first:border-t-0 first:pt-0"
    >
      <component :is="heading" class="m-0 text-[18px] font-semibold">
        <span class="mr-2 text-lp-accent tabular-nums">{{ i + 1 }}</span>{{ section.title }}
      </component>
      <template v-for="(block, j) in section.blocks" :key="j">
        <ul
          v-if="'items' in block"
          class="m-0 flex list-disc flex-col gap-1.5 pl-5 text-[15.5px] leading-[1.7] text-lp-soft marker:text-lp-accent"
        >
          <li v-for="item in block.items" :key="item.text">
            <b v-if="item.lead" class="font-semibold text-lp-ink">{{ item.lead }}</b> {{ item.text }}
          </li>
        </ul>
        <p
          v-else
          class="m-0 text-[15.5px] leading-[1.7]"
          :class="block.strong ? 'font-semibold text-lp-ink' : 'text-lp-soft'"
        >
          <b v-if="block.lead" class="font-semibold text-lp-ink">{{ block.lead }}</b> {{ block.text }}
        </p>
      </template>
    </section>
  </div>
</template>
