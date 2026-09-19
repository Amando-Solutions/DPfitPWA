<script setup lang="ts">
import {
  FOOTER_BLURB,
  LEGAL_DISCLAIMER,
  footerColumns,
} from '~/data/landing'

/**
 * The band the page ends on.
 *
 * `--text` — the near-black violet — rather than `--night`, so it reads as the
 * floor under the closing panel instead of a second dark panel repeating it.
 * The hairline at the top is what separates the two, since both are dark.
 *
 * Deliberately no call-to-action here: the section immediately above this one
 * is a full-bleed "Join the Challenge", and a second button 80px below it would
 * only make the first look ignorable. The footer restates the ask as a plain
 * link in its column and lets the panel above do the selling.
 */
// Straight through: every value the footer needs that is not copy is
// deployment configuration, and `footerColumns` decides what that adds up to.
const { appUrl, contactEmail, instagramHandle } = useRuntimeConfig().public
const columns = footerColumns({ appUrl, contactEmail, instagramHandle })

/**
 * The page is prerendered, so the server renders the year of the *build*. Vue
 * corrects the text on the client, which is what makes this right on a site
 * that has not been redeployed since December rather than merely right at
 * build time.
 */
const year = new Date().getFullYear()

/**
 * The member app is a separate deployment and the socials are somebody else's
 * site, so both leave this page — `noopener` because a link that opens a tab
 * should not hand that tab a handle back to this one. Everything else here is
 * an anchor on this page or a `mailto:`, and neither wants a new tab.
 */
function linkAttrs(href: string) {
  return /^https?:/.test(href)
    ? { target: '_blank', rel: 'noopener noreferrer' }
    : {}
}
</script>

<template>
  <footer class="bg-ink">
    <PageContainer>
      <div
        class="grid gap-x-16 gap-y-12 border-t border-rule-inverse pt-14 pb-12 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]"
      >
        <div class="max-w-95">
          <!-- The footer band is `--text`, a near-black violet, so this is the
               white lockup for the same reason the header is. -->
          <BrandLogo mono :size="38" class="text-white" label="DP Fitness" />
          <p class="mt-5 font-body text-[14.5px] leading-[1.7] text-white/70">
            {{ FOOTER_BLURB }}
          </p>
        </div>

        <!--
          `break-words` on the links because the contact address comes from the
          environment and can be any length: at 1024px an unbreakable 26-character
          address overflowed its track by 50px and put a horizontal scrollbar on
          the whole page.

          Three tracks above phone width, and the columns pack into them from
          the left. The count is not fixed — the contact column is absent until
          an address is configured — so a track-based grid is what puts the
          space that leaves *after* the last column rather than between the
          brand and the first one, which is where `justify-between` on a flex
          row put it. Two tracks on a phone, where a third would not fit.
        -->
        <nav aria-label="Footer" class="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3">
          <div v-for="column in columns" :key="column.title">
            <!-- 55%, not the 45% this label wants to be: at 10.5px it is the
                 smallest type in the footer, and 45% white on this band
                 measures 4.41:1 — under AA by a hair. 55% is 5.84:1. -->
            <h2 class="meta text-white/55">{{ column.title }}</h2>
            <ul class="mt-4 flex flex-col gap-2.5">
              <li v-for="link in column.links" :key="link.href">
                <a
                  :href="link.href"
                  v-bind="linkAttrs(link.href)"
                  class="font-body text-[14.5px] wrap-break-word text-white/78 transition-colors hover:text-white"
                >
                  {{ link.label }}
                </a>
              </li>
            </ul>
          </div>
        </nav>
      </div>

      <div class="border-t border-rule-inverse py-9">
        <p class="max-w-155 font-body text-[12.5px] leading-[1.7] text-white/55">
          {{ LEGAL_DISCLAIMER }}
        </p>
        <div
          class="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <p class="meta text-white/55">
            © {{ year }} DP Fitness · The Recomp Challenge
          </p>

          <!-- The build credit, in the middle of the three: it is the one item
               here that is neither DP Fitness's copyright nor a control, and
               putting it between them is what keeps it from reading as either.
               `inverse` because this band is near-black in a theme pinned
               light, so the terracotta has to be asked for rather than
               inferred. -->
          <PoweredBy inverse class="text-white/45" />

          <!-- A real anchor to the top of the document rather than a scroll
               handler, so it works with JavaScript off and inherits the smooth
               scrolling `main.css` already sets on `html`. -->
          <a
            href="#top"
            class="meta text-white/55 transition-colors hover:text-white"
          >
            Back to top ↑
          </a>
        </div>
      </div>
    </PageContainer>
  </footer>
</template>
