<script setup lang="ts">
import { DialogOverlay as RekaDialogOverlay, type DialogOverlayProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { cn } from '~/lib/utils'

const props = defineProps<DialogOverlayProps & { class?: HTMLAttributes['class'] }>()
</script>

<template>
  <!--
    `bg-scrim` rather than shadcn's black/80: the token already carries its own
    alpha and is redefined for dark mode, so it must not be given an extra
    opacity utility on top.
  -->
  <RekaDialogOverlay
    data-sheet-overlay
    :as-child="asChild"
    :force-mount="forceMount"
    :class="
      cn(
        'fixed inset-0 z-200 bg-scrim backdrop-blur-[2px] [animation:sheet-scrim-in_250ms_ease-out] data-[state=closed]:[animation:sheet-scrim-out_250ms_ease-in] motion-reduce:[animation-duration:1ms]',
        props.class,
      )
    "
  >
    <slot />
  </RekaDialogOverlay>
</template>
