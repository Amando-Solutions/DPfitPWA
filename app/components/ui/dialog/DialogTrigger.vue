<script setup lang="ts">
import { DialogTrigger as RekaDialogTrigger, type DialogTriggerProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { cn } from '~/lib/utils'

const props = defineProps<DialogTriggerProps & { class?: HTMLAttributes['class'] }>()
</script>

<template>
  <RekaDialogTrigger :as="as" :as-child="asChild" :class="cn(props.class)">
    <slot />
  </RekaDialogTrigger>
</template>
