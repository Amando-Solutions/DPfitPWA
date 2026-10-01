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
  <section id="faq" class="mx-auto max-w-[1200px] px-6 pt-[136px] pb-10">
    <div class="grid grid-cols-1 items-start gap-x-24 gap-y-10 lg:grid-cols-2">
      <div class="lp-reveal flex flex-col gap-5">
        <h2 class="lp-h2">frequently asked <span class="serif-accent">questions</span></h2>
        <p v-if="contactEmail" class="m-0 text-[15px] leading-[1.65] text-lp-soft">
          Still unsure? Email
          <a :href="`mailto:${contactEmail}`" class="lp-ul font-semibold text-lp-ink">{{ contactEmail }}</a>
        </p>
      </div>

      <div class="lp-reveal flex flex-col border-t border-lp-rule">
        <details
          v-for="faq in entries"
          :id="faq.id"
          :key="faq.id"
          class="border-b border-lp-rule py-[22px]"
        >
          <summary
            class="flex cursor-pointer list-none justify-between gap-4 text-[17px] font-medium [&::-webkit-details-marker]:hidden"
          >
            <h3 class="m-0 text-[17px] font-medium">{{ faq.question }}</h3>
            <span class="lp-plus text-[22px] leading-none" aria-hidden="true">+</span>
          </summary>
          <p class="mt-3.5 mb-0 text-[15px] leading-[1.7] text-lp-soft">
            {{ faq.answer }}
          </p>
        </details>
      </div>
    </div>
  </section>
</template>
