<script setup lang="ts">
import { HERO_STATS, REGISTER_ANCHOR } from '~/data/landing'
</script>

<template>
  <section class="relative overflow-hidden bg-night pt-33 pb-10 lg:pt-39">
    <!--
      Two glows, painted rather than gradiented onto the panel itself: a rose
      one bleeding down from above the fold and an orange one behind the
      photograph. `aria-hidden` because they carry no meaning, and
      `pointer-events-none` so they never swallow a click on the buttons.
    -->
    <div aria-hidden="true" class="pointer-events-none absolute inset-0">
      <div
        class="absolute -top-70 left-1/2 h-190 w-300 -translate-x-1/2"
        style="
          background: radial-gradient(
            50% 50% at 50% 50%,
            rgba(200, 30, 92, 0.34) 0%,
            rgba(200, 30, 92, 0.05) 45%,
            rgba(200, 30, 92, 0) 70%
          );
        "
      />
      <div
        class="absolute top-35 -right-40 size-155"
        style="
          background: radial-gradient(
            50% 50% at 50% 50%,
            rgba(232, 163, 61, 0.18) 0%,
            rgba(232, 163, 61, 0) 66%
          );
        "
      />
    </div>

    <PageContainer class="relative">
      <div
        class="grid items-center gap-12 lg:grid-cols-2 lg:gap-15.75 xl:gap-15.75"
      >
        <div>
          <p
            class="inline-flex items-center gap-2.5 rounded-pill border border-white/18 bg-white/5 px-4.25 py-2.25"
          >
            <span
              aria-hidden="true"
              class="block size-1.25 rounded-xs bg-rose-fill opacity-45"
            />
            <span
              class="font-data text-[10.5px] tracking-[0.17em] text-white/78 uppercase"
            >
              6-week challenge · starts 12 August
            </span>
          </p>

          <!--
            The breaks are authored, not left to the measure. The design sets
            this headline as five short lines, and the rose-to-orange wash only
            reads as a wash if "Do both" and "at once." are the two lines it
            travels across — let the browser choose, and the gradient's midpoint
            lands mid-word.
          -->
          <h1 class="title-hero mt-6.5 text-white">
            Lose the fat.<br >
            Keep the muscle.<br >
            <span class="text-recomp">Do both<br >at once.</span>
          </h1>

          <p
            class="mt-6.5 max-w-131.25 font-body text-[18.5px] leading-[1.65] text-white/70"
          >
            A science-backed 6-week body recomposition challenge. Structured
            training, clear nutrition guidance and real weekly accountability.
            Built for women done choosing between shrinking and building.
          </p>

          <div class="mt-9 flex flex-wrap items-center gap-3.5">
            <CtaButton :href="REGISTER_ANCHOR">Join the Challenge →</CtaButton>
            <CtaButton href="#package" variant="outline">
              See what's included
            </CtaButton>
          </div>
        </div>

        <!--
          The photograph, with the orange hairline frame offset behind it. The
          frame is a sibling rather than a border so it can sit 16px down and to
          the right of the image the way the design draws it; it is decorative,
          hence `aria-hidden` and its absence from the tab order.
        -->
        <div class="relative mx-auto w-full max-w-131 lg:mx-0">
          <div
            aria-hidden="true"
            class="absolute inset-0 translate-x-4 translate-y-4 rounded-card border border-[rgba(232,163,61,0.35)]"
          />
          <img
            src="/landing/hero-woman-training.jpg"
            alt="A woman lifting a loaded barbell across her shoulders in a gym"
            width="1049"
            height="1200"
            fetchpriority="high"
            class="relative aspect-524/600 w-full rounded-[20px] object-cover shadow-[0_40px_90px_rgba(0,0,0,0.55)]"
          >
        </div>
      </div>

      <!--
        The three headline numbers. One hairline above the row and one between
        each cell, drawn as gaps in a tinted grid so the rules meet exactly at
        the corners instead of being three separate borders that don't line up.
      -->
      <dl
        class="mt-16 grid gap-px border-t border-white/12 bg-white/12 pt-px sm:grid-cols-3 lg:mt-17.5"
      >
        <!-- `flex-col-reverse` prints the value above its caption while leaving
             the term before its definition in the markup, where a screen reader
             wants them. -->
        <div
          v-for="stat in HERO_STATS"
          :key="stat.caption"
          class="flex flex-col-reverse bg-night px-0 pt-6.5 pb-8.5 sm:px-6 sm:first:pl-0"
        >
          <dt class="meta mt-2 text-white/75">{{ stat.caption }}</dt>
          <dd
            class="font-display text-[34px] font-black tracking-tight text-white"
          >
            {{ stat.value }}
          </dd>
        </div>
      </dl>
    </PageContainer>
  </section>
</template>
