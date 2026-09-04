<script setup lang="ts">
/**
 * The landing page, section for section as the Figma composition orders them
 * (`DP Fitness · Landing Page`, node 448:2).
 *
 * The page owns nothing but that order. Each section is self-contained and its
 * copy lives in `~/data/landing`, so re-ordering the argument is a matter of
 * moving a line here.
 */
</script>

<template>
  <div>
    <SiteHeader />
    <main>
      <HeroSection />
      <ProblemSection />
      <ProofBand />
      <PackageSection />
      <PhasesSection />
      <FitSection />
      <GallerySection />
      <PriceSection />
      <RegisterSection />
      <FaqSection />
      <ClosingSection />
    </main>
    <SiteFooter />
  </div>
</template>
