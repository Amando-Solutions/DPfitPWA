<script setup lang="ts">
import {
  DialogRoot as RekaDialogRoot,
  useForwardPropsEmits,
  type DialogRootEmits,
  type DialogRootProps,
} from 'reka-ui'

const props = defineProps<DialogRootProps>()
const emits = defineEmits<DialogRootEmits>()

const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
  <RekaDialogRoot v-bind="forwarded">
    <slot />
  </RekaDialogRoot>
</template>
