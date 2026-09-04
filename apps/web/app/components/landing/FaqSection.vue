<script setup lang="ts">
import { FAQS } from '~/data/landing'

/**
 * Built on `<details>` rather than on buttons and `v-show`.
 *
 * The design draws every row collapsed, and a browser already knows how to open
 * a `<details>`: it is keyboard-operable, it is announced as expandable, its
 * hidden text is still findable with the browser's own find-in-page, and it
 * renders open-able with JavaScript off. The only thing left to write is the
 * rotation of the "+", and `open:` handles that with no state at all.
 */
</script>

<template>
  <section
    id="faq"
    class="border-t border-[var(--rule-faint)] bg-page-deep py-20 lg:py-[120px]"
  >
    <PageContainer>
      <div class="grid gap-10 lg:grid-cols-2 lg:gap-[70px]">
        <div>
          <p class="eyebrow-section text-[var(--rose-fill)]">Questions</p>
          <h2 class="title-section mt-[18px] text-ink">Before you join.</h2>
        </div>

        <div class="border-t border-[var(--rule)]">
          <details
            v-for="faq in FAQS"
            :key="faq.question"
            class="group border-b border-[var(--rule)] last:border-b-0"
          >
            <summary
              class="flex cursor-pointer list-none items-center justify-between gap-6 px-0.5 py-6 [&::-webkit-details-marker]:hidden"
            >
              <h3
                class="font-body text-[16.5px] font-semibold tracking-[-0.01em] text-ink"
              >
                {{ faq.question }}
              </h3>
              <span
                aria-hidden="true"
                class="font-data shrink-0 text-[18px] leading-none text-[var(--rose-fill)] transition-transform duration-200 group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p
              class="max-w-[520px] px-0.5 pb-6 font-body text-[15px] leading-[1.65] text-soft"
            >
              {{ faq.answer }}
            </p>
          </details>
        </div>
      </div>
    </PageContainer>
  </section>
</template>
