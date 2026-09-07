<script setup lang="ts">
import { REGISTER_ANCHOR } from '~/data/landing'
</script>

<template>
  <section class="relative isolate overflow-hidden py-20 lg:py-[120px]">
    <!--
      The photograph is the panel's background rather than its content, so it is
      an `aria-hidden` layer under the copy. The gradient over it is not a mood
      wash: the headline sits on the left half, and this is what guarantees the
      contrast under it whatever the image happens to be doing there.
    -->
    <div aria-hidden="true" class="absolute inset-0 -z-10">
      <img
        src="/landing/cta-gym.jpg"
        alt=""
        width="2000"
        height="1328"
        loading="lazy"
        class="size-full object-cover"
      >
      <div
        class="absolute inset-0 bg-gradient-to-r from-[rgba(15,10,20,0.95)] to-[rgba(15,10,20,0.66)]"
      />
    </div>

    <PageContainer>
      <div class="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2
            class="font-display max-w-[730px] text-[clamp(2.25rem,4.6vw,3.625rem)] leading-[1.02] font-black tracking-[-0.03em] text-white"
          >
            Lose the fat. Keep the muscle. Do both at once.
          </h2>
          <p class="mt-4 font-body text-[16px] leading-[1.65] text-white/66">
            Starts today. Six weeks, one cohort, one price.
          </p>
        </div>
        <CtaButton :href="REGISTER_ANCHOR" class="shrink-0 self-start lg:self-end">
          Join the Challenge →
        </CtaButton>
      </div>
    </PageContainer>
  </section>
</template>
