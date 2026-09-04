<script setup lang="ts">
import { LEGAL_DISCLAIMER } from '~/data/landing'
</script>

<template>
  <footer class="bg-[var(--text)] pb-10">
    <PageContainer>
      <div
        class="flex flex-col gap-4 border-t border-rule-inverse pt-7 sm:flex-row sm:items-center sm:justify-between"
      >
        <BrandMark size="17px" />
        <p class="meta text-white/80">
          The Recomp Challenge · 6-week group program
        </p>
      </div>
      <p class="mt-5 max-w-[509px] font-body text-[13px] leading-[1.65] text-white/80">
        {{ LEGAL_DISCLAIMER }}
      </p>
    </PageContainer>
  </footer>
</template>
