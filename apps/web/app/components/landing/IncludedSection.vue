<script setup lang="ts">
import { APP_NAME, APP_SCREENS, EQUIPMENT, includedItems } from '~/data/landing'

const { weeks } = useCohortLabels()
const items = computed(() => includedItems(weeks.value ?? 6))
</script>

<template>
  <section id="included" class="mx-auto max-w-300 px-6 pt-30 pb-10">
    <div class="lp-reveal mb-12 flex flex-wrap items-end justify-between gap-6">
      <h2 class="lp-h2 leading-[1.02]">
        everything included, <span class="serif-accent">in one app</span>
      </h2>
      <span class="rounded-full border border-lp-field-edge px-3.5 py-2 text-[13px] font-semibold lowercase">
        {{ EQUIPMENT }}
      </span>
    </div>

    <div class="grid grid-cols-1 items-start gap-x-16 gap-y-12 lg:grid-cols-2">
      <div
        class="lp-reveal flex flex-col items-center gap-7 rounded-4xl bg-lp-lilac-50 px-6 pt-10 pb-8"
      >
        <div class="flex flex-wrap justify-center gap-3.5 pt-4">
          <!--
            Each screenshot runs the full length of the screen, taller than the
            frame, so it is pinned to the top where the screen's header is.
          -->
          <div
            v-for="(screen, i) in APP_SCREENS"
            :key="screen.src"
            class="lp-lift h-85 w-40 shrink-0 rounded-4xl bg-lp-ink p-1.75"
            :class="i === 1 && '-mt-5'"
          >
            <img
              :src="screen.src"
              :alt="screen.alt"
              width="440"
              height="1068"
              loading="lazy"
              decoding="async"
              class="size-full rounded-[26px] object-cover object-top"
            >
          </div>
        </div>
        <p class="m-0 max-w-105 text-center text-[15px] leading-[1.65] text-lp-soft">
          The whole challenge runs in the {{ APP_NAME }}. No spreadsheets, no
          scattered links, just your phone and your gym.
        </p>
      </div>

      <ol class="lp-reveal m-0 flex list-none flex-col border-t border-lp-rule p-0">
        <li
          v-for="(item, i) in items"
          :key="item.title"
          class="grid grid-cols-[44px_minmax(0,1fr)] gap-3 border-b border-lp-rule py-4.5"
        >
          <span class="pt-0.5 text-[13px] font-semibold text-lp-accent">
            {{ String(i + 1).padStart(2, '0') }}
          </span>
          <div>
            <h3 class="m-0 mb-1 text-[17px] font-semibold">{{ item.title }}</h3>
            <p class="m-0 text-[14px] leading-[1.6] text-lp-soft">{{ item.description }}</p>
          </div>
        </li>
      </ol>
    </div>
  </section>
</template>
