<script setup lang="ts">
import { PACKAGE_ITEMS } from '~/data/landing'
</script>

<template>
  <section
    id="package"
    class="border-y border-[var(--rule-faint)] bg-page-deep py-20 lg:py-[121px]"
  >
    <PageContainer>
      <div class="max-w-[620px]">
        <p class="eyebrow-section text-[var(--rose-fill)]">What's included</p>
        <h2 class="title-section mt-[18px] text-ink">
          Everything you need, nothing you have to figure out.
        </h2>
        <p class="mt-4 font-body text-[17px] leading-[1.7] text-soft">
          One program. Every guide built in. Delivered in two waves so you're
          never overwhelmed on day one.
        </p>
      </div>

      <!--
        A numbered table rather than a card grid, because the point of this
        section is that the package is *one* thing with seven parts. Three
        columns on desktop — index and name, description, release chip — that
        fold into a stack on the way down; the chip moves under the name rather
        than under the description, so a scanning reader still sees "name, when"
        as one unit.
      -->
      <ol class="mt-14 border-t border-[var(--rule)] lg:mt-[60px]">
        <li
          v-for="(item, i) in PACKAGE_ITEMS"
          :key="item.title"
          class="grid gap-x-6 gap-y-3 border-b border-[var(--rule)] py-7 last:border-b-0 lg:grid-cols-[377px_1fr_auto] lg:items-start lg:gap-x-10"
        >
          <div class="flex items-baseline gap-[14px]">
            <span class="font-data text-[11.5px] text-[var(--rose-fill)]">
              {{ String(i + 1).padStart(2, '0') }}
            </span>
            <h3
              class="font-body text-[17.5px] font-semibold tracking-[-0.01em] text-ink"
            >
              {{ item.title }}
            </h3>
          </div>

          <p class="order-2 font-body text-[15px] leading-[1.6] text-soft">
            {{ item.description }}
          </p>

          <!--
            The one guide held back until Week 3 is the interesting fact in this
            table, so it gets the rose chip and every "Day 1" gets the quiet one.
          -->
          <span
            class="meta order-1 w-fit rounded-pill px-[11px] py-1.5 lg:order-3"
            :class="
              item.staged
                ? 'bg-[var(--rose-fill)] text-white'
                : 'bg-[var(--chip-quiet)] text-[var(--chip-quiet-ink)]'
            "
          >
            {{ item.release }}
          </span>
        </li>
      </ol>
    </PageContainer>
  </section>
</template>
