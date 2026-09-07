<script setup lang="ts">
import { DialogDescription as RekaDialogDescription, type DialogDescriptionProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { cn } from '~/lib/utils'

const props = defineProps<DialogDescriptionProps & { class?: HTMLAttributes['class'] }>()
</script>

<template>
  <RekaDialogDescription
    :as="as"
    :as-child="asChild"
    :class="cn('text-[13px] leading-relaxed text-muted', props.class)"
  >
    <slot />
  </RekaDialogDescription>
</template>
