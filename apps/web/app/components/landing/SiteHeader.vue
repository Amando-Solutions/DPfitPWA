<script setup lang="ts">
import { NAV_LINKS, REGISTER_ANCHOR } from '~/data/landing'

/**
 * The sticky bar: logo, the five section links, and the one ask.
 *
 * Frosted paper rather than solid, so the page shows through as it scrolls
 * underneath. Below `md` the links fold away — the phone has the sticky
 * booking bar at the bottom of the screen, and a header that wraps onto three
 * lines would eat a third of the viewport.
 */
</script>

<template>
  <header
    class="sticky top-0 z-30 border-b border-[rgba(29,22,40,0.06)] bg-[rgba(247,244,252,0.82)] backdrop-blur-[14px]"
  >
    <div class="mx-auto flex max-w-300 items-center justify-between gap-6 px-6 py-3 md:py-4.5">
      <a href="#top" class="text-lp-ink">
        <BrandLogo :size="40" label="DP Fitness" />
      </a>

      <nav aria-label="Sections" class="hidden flex-wrap gap-6.5 text-[14px] md:flex">
        <a
          v-for="link in NAV_LINKS"
          :key="link.href"
          :href="link.href"
          class="lp-ul text-lp-ink transition-colors hover:text-lp-accent"
        >
          {{ link.label }}
        </a>
      </nav>

      <CtaButton :href="REGISTER_ANCHOR" compact>book a slot ↗</CtaButton>
    </div>
  </header>
</template>
