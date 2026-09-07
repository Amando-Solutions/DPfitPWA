<script setup lang="ts">
import { DialogTitle as RekaDialogTitle, type DialogTitleProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { cn } from '~/lib/utils'

const props = defineProps<DialogTitleProps & { class?: HTMLAttributes['class'] }>()
</script>

<template>
  <!--
    Chivo Black at 18px is the sheet-title style the design already used. Reka
    wires this element's id into the content's `aria-labelledby`, which is the
    part the hand-rolled sheet was missing.
  -->
  <RekaDialogTitle
    :as="as"
    :as-child="asChild"
    :class="cn('font-display text-[18px] font-black text-ink', props.class)"
  >
    <slot />
  </RekaDialogTitle>
</template>
