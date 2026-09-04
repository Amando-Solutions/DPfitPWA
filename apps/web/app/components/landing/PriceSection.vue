<script setup lang="ts">
import { PRICE, PRICE_INCLUDES, REGISTER_ANCHOR } from '~/data/landing'
</script>

<template>
  <section
    id="price"
    class="border-y border-[var(--rule-faint)] bg-page-deep py-20 lg:py-[121px]"
  >
    <PageContainer>
      <div class="grid gap-12 lg:grid-cols-2 lg:gap-[70px]">
        <div>
          <p class="eyebrow-section text-[var(--rose-fill)]">
            Six weeks, group challenge
          </p>
          <p class="title-price mt-5 text-ink">{{ PRICE }}</p>
          <p
            class="mt-3.5 font-data text-[11.5px] tracking-[0.12em] text-ink-mute uppercase"
          >
            One-time payment
          </p>
          <CtaButton :href="REGISTER_ANCHOR" variant="ink" class="mt-7">
            Join the Challenge →
          </CtaButton>
        </div>

        <!--
          The same seven-part package as the section above, restated as a plain
          list. No tick marks: every line is included, so a column of ticks would
          only be decoration, and the rules already do the work of separating
          one promise from the next.
        -->
        <ul class="border-t border-[var(--rule)]">
          <li
            v-for="line in PRICE_INCLUDES"
            :key="line"
            class="border-b border-[var(--rule)] py-4 font-body text-[15.5px] text-ink last:border-b-0"
          >
            {{ line }}
          </li>
        </ul>
      </div>
    </PageContainer>
  </section>
</template>
