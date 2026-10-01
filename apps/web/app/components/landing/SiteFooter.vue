<script setup lang="ts">
import { FOOTER_BLURB, LEGAL_DISCLAIMER, REGISTER_ANCHOR, followLinks, footerColumns } from '~/data/landing'

/**
 * The plum panel the page ends on: the closing ask, the link columns, the
 * disclaimer and the credits. Rounded at the top so it reads as a sheet
 * pulled up over the page rather than a band across it.
 */
const { contactEmail, instagramHandle, tiktokHandle } = useRuntimeConfig().public
const columns = footerColumns(contactEmail)
const follow = followLinks({ instagramHandle, tiktokHandle })

// Rendered on each request, and corrected on the client besides.
const year = new Date().getFullYear()

const linkAttrs = (href: string) =>
  /^https?:/.test(href) ? { target: '_blank', rel: 'noopener noreferrer' } : {}
</script>

<template>
  <footer class="mt-34 rounded-t-[36px] bg-lp-ink pb-22 text-lp-paper md:pb-0">
    <div class="mx-auto flex max-w-300 flex-col gap-18 px-6 pt-22 pb-8">
      <div class="flex flex-wrap items-end justify-between gap-8">
        <h2
          class="m-0 max-w-180 text-[clamp(40px,5.4vw,80px)] leading-none font-medium tracking-[-0.04em]"
        >
          ready when <span class="serif-accent">you are.</span>
        </h2>
        <div class="flex flex-wrap gap-3">
          <CtaButton :href="REGISTER_ANCHOR" variant="paper">book a slot ↗</CtaButton>
          <CtaButton href="#top" variant="outline-light">back to top ↑</CtaButton>
        </div>
      </div>

      <div
        class="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-10 border-t border-[rgba(247,244,252,0.14)] pt-12"
      >
        <div class="flex flex-col gap-3.5">
          <BrandLogo :size="56" mono label="DP Fitness" />
          <span class="max-w-60 text-[14px] leading-[1.6] text-lp-on-ink-soft">{{ FOOTER_BLURB }}</span>
        </div>
        <nav
          v-for="column in columns"
          :key="column.title"
          :aria-label="column.title"
          class="flex flex-col gap-3 text-[14px]"
        >
          <span class="text-[12px] tracking-[0.08em] text-lp-on-ink-soft uppercase">{{ column.title }}</span>
          <a
            v-for="link in column.links"
            :key="link.href"
            :href="link.href"
            v-bind="linkAttrs(link.href)"
            class="lp-ul self-start break-all text-lp-paper transition-colors hover:text-lp-on-ink-hover"
          >
            {{ link.label }}
          </a>
        </nav>
        <!-- Dropped entirely until a handle is configured, rather than
             shipping icons that go nowhere. -->
        <nav v-if="follow.length" aria-label="follow" class="flex flex-col gap-3 text-[14px]">
          <span class="text-[12px] tracking-[0.08em] text-lp-on-ink-soft uppercase">follow</span>
          <div class="flex gap-2.5">
            <a
              v-for="link in follow"
              :key="link.href"
              :href="link.href"
              :aria-label="link.label"
              :title="link.label"
              target="_blank"
              rel="noopener noreferrer"
              class="grid size-11 place-items-center rounded-full border border-[rgba(247,244,252,0.35)] text-lp-paper transition-[transform,background-color] duration-[400ms,300ms] ease-[cubic-bezier(0.2,0.7,0.2,1)] hover:-translate-y-0.5 hover:bg-lp-ink-hover focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-lp-accent"
            >
              <SocialIcon :network="link.network" />
            </a>
          </div>
        </nav>
      </div>

      <p class="m-0 max-w-160 text-[13px] leading-[1.7] text-lp-on-ink-soft">{{ LEGAL_DISCLAIMER }}</p>

      <div
        class="flex flex-wrap items-center justify-between gap-4 border-t border-[rgba(247,244,252,0.14)] pt-6 text-[13px] text-lp-on-ink-soft"
      >
        <span>© {{ year }} DP Fitness. All rights reserved.</span>
        <PoweredBy class="text-lp-on-ink-soft" />
      </div>
    </div>
  </footer>
</template>
