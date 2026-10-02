<script setup lang="ts">
/**
 * The terms the booking form asks somebody to agree to, as a page of their
 * own: the footer links here, and so does the form for a click that asks for a
 * new tab. A plain click on the form opens the same `TermsContent` in
 * `TermsModal` instead.
 */
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
      </header>

      <TermsContent />

      <div class="flex flex-col items-start gap-10 border-t border-lp-rule pt-8">
        <CtaButton href="/">back to the challenge ↗</CtaButton>
        <PoweredBy class="text-lp-soft" />
      </div>
    </article>
  </main>
</template>
