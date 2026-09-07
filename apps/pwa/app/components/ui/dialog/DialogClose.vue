<script setup lang="ts">
import { DialogClose as RekaDialogClose, type DialogCloseProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { cn } from '~/lib/utils'

const props = defineProps<DialogCloseProps & { class?: HTMLAttributes['class'] }>()
</script>

<template>
  <RekaDialogClose :as="as" :as-child="asChild" :class="cn(props.class)">
    <slot />
  </RekaDialogClose>
</template>
