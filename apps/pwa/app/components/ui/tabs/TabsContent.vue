<script setup lang="ts">
import { TabsContent as RekaTabsContent, useForwardProps, type TabsContentProps } from 'reka-ui'
import { computed, type HTMLAttributes } from 'vue'
import { cn } from '~/lib/utils'

const props = defineProps<TabsContentProps & { class?: HTMLAttributes['class'] }>()

const delegated = computed(() => {
  const { class: _class, ...rest } = props
  return rest
})

const forwarded = useForwardProps(delegated)
</script>

<template>
  <!-- Reka labels this `role="tabpanel"` and points `aria-labelledby` at its
       trigger, which is what makes the panel reachable after the tab. -->
  <RekaTabsContent
    v-bind="forwarded"
    :class="cn('focus-visible:outline-none', props.class)"
  >
    <slot />
  </RekaTabsContent>
</template>
