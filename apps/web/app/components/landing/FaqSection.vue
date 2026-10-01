<script setup lang="ts">
import { faqs } from '~/data/landing'

/**
 * Built on `<details>`: keyboard-operable, announced as expandable, findable
 * with find-in-page, and open-able with JavaScript off. The "+" turning into a
 * "×" is `details[open] .lp-plus` in `main.css`.
 *
 * Each entry has an id, so the "refund policy" links elsewhere can land on the
 * refund answer — and open it, which a bare anchor would not.
 */
const { contactEmail } = useRuntimeConfig().public
const { startsPlain } = useCohortLabels()
const entries = computed(() => faqs({ startsOn: startsPlain.value, contactEmail }))

function openFromHash() {
  const id = decodeURIComponent(window.location.hash.slice(1))
  const target = id ? document.getElementById(id) : null
  if (target instanceof HTMLDetailsElement) target.open = true
}

onMounted(() => {
  openFromHash()
  window.addEventListener('hashchange', openFromHash)
})
onBeforeUnmount(() => window.removeEventListener('hashchange', openFromHash))
</script>

<template>
  <section id="faq" class="mx-auto max-w-300 px-6 pt-20 pb-10 md:pt-34">
    <div class="grid grid-cols-1 items-start gap-x-24 gap-y-8 md:gap-y-10 lg:grid-cols-2">
      <div class="lp-reveal flex flex-col gap-4 md:gap-5">
        <h2 class="lp-h2">frequently asked <span class="serif-accent">questions</span></h2>
        <p v-if="contactEmail" class="m-0 text-[15px] leading-[1.65] text-lp-soft">
          Still unsure? Email
          <a :href="`mailto:${contactEmail}`" class="lp-ul font-semibold wrap-anywhere text-lp-ink">{{ contactEmail }}</a>
        </p>
      </div>

      <!-- The "+" sits in a box one question-line tall, so it centres on the
           first line however many the question wraps to. -->
      <div class="lp-reveal flex flex-col border-t border-lp-rule">
        <details
          v-for="faq in entries"
          :id="faq.id"
          :key="faq.id"
          class="border-b border-lp-rule py-5 md:py-5.5"
        >
          <summary
            class="flex cursor-pointer list-none items-start justify-between gap-4 [&::-webkit-details-marker]:hidden"
          >
            <h3 class="m-0 text-[16px] leading-[1.4] font-medium text-pretty sm:text-[17px]">{{ faq.question }}</h3>
            <span class="lp-plus flex h-5.5 shrink-0 items-center text-[22px] leading-none sm:h-6" aria-hidden="true">+</span>
          </summary>
          <p class="mt-3 mb-0 text-[15px] leading-[1.7] text-lp-soft sm:pr-8 md:mt-3.5">
            {{ faq.answer }}
          </p>
        </details>
      </div>
    </div>
  </section>
</template>
