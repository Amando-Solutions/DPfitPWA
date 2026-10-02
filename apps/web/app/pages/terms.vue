<script setup lang="ts">
import { TERMS_SECTIONS, TERMS_VERSION } from '~/data/terms'

/**
 * The terms the booking form asks somebody to agree to. The form opens this in
 * a new tab, so reading it never costs anybody the answers they had typed.
 */
const { contactEmail } = useRuntimeConfig().public

// Pinned to UTC: the version is a calendar date, and read in a zone west of
// Greenwich midnight would print as the day before.
const updated = new Date(`${TERMS_VERSION}T00:00:00Z`).toLocaleDateString('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

useHead({ title: 'Terms and conditions · DP Fitness' })
</script>

<template>
  <main class="min-h-dvh bg-lp-paper px-6 py-10 font-landing text-lp-ink antialiased sm:py-16">
    <article class="mx-auto flex max-w-180 flex-col gap-10">
      <a href="/" class="self-start text-lp-ink">
        <BrandLogo :size="48" label="DP Fitness" />
      </a>

      <header class="flex flex-col gap-3 md:gap-4">
        <span class="lp-eyebrow">the fine print</span>
        <h1 class="lp-h2">terms and <span class="serif-accent">conditions</span></h1>
        <p class="m-0 text-[14px] text-lp-soft">Last updated {{ updated }}</p>
      </header>

      <section
        v-for="(section, i) in TERMS_SECTIONS"
        :key="section.title"
        class="flex flex-col gap-3 border-t border-lp-rule pt-6"
      >
        <h2 class="m-0 text-[18px] font-semibold">
          <span class="mr-2 text-lp-accent tabular-nums">{{ String(i + 1).padStart(2, '0') }}</span>{{ section.title }}
        </h2>
        <p v-for="paragraph in section.paragraphs" :key="paragraph" class="m-0 text-[15.5px] leading-[1.7] text-lp-soft">
          {{ paragraph }}
        </p>
      </section>

      <section class="flex flex-col gap-3 border-t border-lp-rule pt-6">
        <h2 class="m-0 text-[18px] font-semibold">Questions</h2>
        <p class="m-0 text-[15.5px] leading-[1.7] text-lp-soft">
          <template v-if="contactEmail">
            Email <a :href="`mailto:${contactEmail}`" class="font-semibold text-lp-ink underline underline-offset-3">{{ contactEmail }}</a>
            and we'll get back to you.
          </template>
          <template v-else>Get in touch with us before you book and we'll get back to you.</template>
        </p>
      </section>

      <div class="flex flex-col items-start gap-10 border-t border-lp-rule pt-8">
        <CtaButton href="/">back to the challenge ↗</CtaButton>
        <PoweredBy class="text-lp-soft" />
      </div>
    </article>
  </main>
</template>
