<script setup lang="ts">
// The taps that add the app, for a browser that will not do it in one.
//
// Shared by the install sheet and the sign-in screen, so the two can never
// describe the same Share sheet differently. No outer margin: each caller
// spaces it for the column it sits in.
import type { InstallMethod } from '~/composables/useInstallApp'

const props = defineProps<{ method: InstallMethod | null }>()

const IOS_STEPS = [
  { icon: 'share', text: 'Tap the Share button in Safari’s toolbar.' },
  { icon: 'plus', text: 'Scroll the sheet and pick “Add to Home Screen”.' },
  { icon: 'check', text: 'Tap “Add”. DP Fitness lands on your home screen.' },
]

const MENU_STEPS = [
  { icon: 'more', text: 'Open your browser’s menu.' },
  { icon: 'download', text: 'Pick “Install app”, or “Add to Home screen”.' },
  { icon: 'check', text: 'Confirm, and it installs like any other app.' },
]

const steps = computed(() => (props.method === 'ios' ? IOS_STEPS : MENU_STEPS))
</script>

<template>
  <div class="install-steps flex flex-col gap-4">
    <ol class="install-steps__list [list-style:none] m-0 p-0 flex flex-col gap-3">
      <li v-for="(step, i) in steps" :key="i" class="install-steps__step flex items-center gap-3">
        <span class="install-steps__icon w-8 h-8 rounded-pill [background:var(--primary-soft)] text-primary grid place-items-center shrink-0">
          <AppIcon :name="step.icon" :size="16" />
        </span>
        <span class="install-steps__text flex-1 min-w-0 text-[13.5px] leading-[1.45] text-(--ink)">{{ step.text }}</span>
      </li>
    </ol>

    <p v-if="method === 'ios'" class="install-steps__note m-0 p-[10px_12px] rounded-md [background:var(--fill-subtle)] text-[12px] leading-[1.45] text-(--violet-45)">
      No Share button? You are in another app&rsquo;s built-in browser. Open DP
      Fitness in Safari first.
    </p>
  </div>
</template>
