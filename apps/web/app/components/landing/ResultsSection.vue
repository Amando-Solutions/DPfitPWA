<script setup lang="ts">
import { RESULTS } from '~/data/landing'

/**
 * The before / after strip: a horizontal scroller that drifts to the end and
 * back on its own and can be swiped, scrolled or dragged by hand
 * (`useAutoScroll`). It pauses on hover, on the button (WCAG 2.2.2 wants a way
 * to stop motion that runs past five seconds), and not at all under reduced
 * motion, where it is a plain scrolling row.
 *
 * For now each card shows its two photos only. The stat, detail, quote, name
 * and before / after labels are commented out until the real ones are in;
 * the text is still PLACEHOLDER content in `RESULTS` in `~/data/landing`.
 */
const paused = ref(false)
const scroller = ref<HTMLElement | null>(null)
useAutoScroll(scroller, { paused, speed: 24 })
</script>

<template>
  <section id="results" class="pt-30 pb-10">
    <div
      class="lp-reveal mx-auto mb-10 flex max-w-300 flex-wrap items-end justify-between gap-6 px-6"
    >
      <div class="flex flex-col gap-3.5">
        <h2 class="lp-h2">real <span class="serif-accent">results</span></h2>
        <span class="max-w-105 text-[15px] text-lp-soft">
          Transformations from women who have trained with Coach Dayo.
        </span>
      </div>
      <button
        type="button"
        :aria-pressed="paused"
        class="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border border-lp-ink bg-transparent px-4.5 text-[14px] font-semibold text-lp-ink transition-[transform,background-color,color] duration-300 hover:-translate-y-0.5 hover:bg-lp-ink-hover hover:text-lp-paper"
        @click="paused = !paused"
      >
        {{ paused ? '▶ play' : '❚❚ pause' }}
      </button>
    </div>

    <div
      ref="scroller"
      role="region"
      aria-label="Client results"
      tabindex="0"
      class="lp-marquee-wrap pt-3 pb-6 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-lp-accent"
    >
      <div class="lp-marquee">
        <article
          v-for="r in RESULTS"
          :key="r.before"
          class="flex w-85 shrink-0 flex-col gap-3.5 rounded-3xl border border-lp-edge bg-white p-3.5"
        >
          <!-- Card text and labels hidden for now; only the photos show. -->
          <!--
          <div class="flex flex-col gap-1 px-1.5 pt-2">
            <span class="text-[30px] font-medium tracking-[-0.03em] text-lp-accent">{{ r.stat }}</span>
            <span class="text-[13px] text-lp-soft">{{ r.detail }}</span>
          </div>
          -->
          <div class="grid h-70 grid-cols-2 gap-1.5">
            <div class="relative overflow-hidden rounded-2xl bg-lp-lilac-100">
              <img
                :src="r.before"
                alt="Client's before photo"
                width="352"
                height="640"
                loading="lazy"
                decoding="async"
                class="absolute inset-0 size-full object-cover"
              >
              <!-- <span class="lp-chip absolute top-3 left-3 bg-white/85 px-2.5 py-1.25" aria-hidden="true">before</span> -->
            </div>
            <div class="relative overflow-hidden rounded-2xl bg-lp-lilac-250">
              <img
                :src="r.after"
                alt="Client's after photo"
                width="352"
                height="640"
                loading="lazy"
                decoding="async"
                class="absolute inset-0 size-full object-cover"
              >
              <!-- <span class="lp-chip absolute top-3 left-3 bg-lp-ink px-2.5 py-1.25 text-lp-paper" aria-hidden="true">after</span> -->
            </div>
          </div>
          <!-- <p class="mx-1.5 mt-0 mb-1.5 text-[15px] leading-[1.6]">{{ r.quote }}</p> -->
          <!-- <span class="mx-1.5 mb-1.5 text-[13px] font-semibold">{{ r.name }}</span> -->
        </article>
      </div>
    </div>
  </section>
</template>
