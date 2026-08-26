<script setup lang="ts">
import {
  TabsRoot as RekaTabsRoot,
  useForwardPropsEmits,
  type TabsRootEmits,
  type TabsRootProps,
} from 'reka-ui'
import { computed, type HTMLAttributes } from 'vue'
import { cn } from '~/lib/utils'

const props = defineProps<TabsRootProps & { class?: HTMLAttributes['class'] }>()
const emits = defineEmits<TabsRootEmits>()

const delegated = computed(() => {
  const { class: _class, ...rest } = props
  return rest
})

const forwarded = useForwardPropsEmits(delegated, emits)
</script>

<template>
  <RekaTabsRoot v-bind="forwarded" :class="cn('flex flex-col', props.class)">
    <slot />
  </RekaTabsRoot>
</template>
