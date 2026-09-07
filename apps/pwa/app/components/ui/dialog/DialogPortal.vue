<script setup lang="ts">
import { DialogPortal as RekaDialogPortal, type DialogPortalProps } from 'reka-ui'

const props = defineProps<DialogPortalProps>()
</script>

<template>
  <RekaDialogPortal v-bind="props">
    <slot />
  </RekaDialogPortal>
</template>
