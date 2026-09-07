<script setup lang="ts">
import { DialogOverlay as RekaDialogOverlay, type DialogOverlayProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { cn } from '~/lib/utils'

const props = defineProps<DialogOverlayProps & { class?: HTMLAttributes['class'] }>()
</script>

<template>
  <!--
    `bg-scrim` and the 2px blur are the DP treatment, not shadcn's black/80.
    The scrim token already carries its own alpha and flips with the theme, so
    it must not be given an opacity utility on top.
  -->
  <RekaDialogOverlay
    :as-child="asChild"
    :force-mount="forceMount"
    :class="cn('fixed inset-0 z-200 bg-scrim backdrop-blur-[2px]', props.class)"
  >
    <slot />
  </RekaDialogOverlay>
</template>
