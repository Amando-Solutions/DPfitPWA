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
  <div class="install-steps [display:flex] [flex-direction:column] [gap:16px]">
    <ol class="install-steps__list [list-style:none] [margin:0] [padding:0] [display:flex] [flex-direction:column] [gap:12px]">
      <li v-for="(step, i) in steps" :key="i" class="install-steps__step [display:flex] [align-items:center] [gap:12px]">
        <span class="install-steps__icon [width:32px] [height:32px] [border-radius:var(--radius-pill)] [background:var(--primary-soft)] [color:var(--primary)] [display:grid] [place-items:center] [flex-shrink:0]">
          <AppIcon :name="step.icon" :size="16" />
        </span>
        <span class="install-steps__text [flex:1] [min-width:0] [font-size:13.5px] [line-height:1.45] [color:var(--ink)]">{{ step.text }}</span>
      </li>
    </ol>

    <p v-if="method === 'ios'" class="install-steps__note [margin:0] [padding:10px_12px] [border-radius:var(--radius-md)] [background:var(--fill-subtle)] [font-size:12px] [line-height:1.45] [color:var(--violet-45)]">
      No Share button? You are in another app&rsquo;s built-in browser. Open DP
      Fitness in Safari first.
    </p>
  </div>
</template>
