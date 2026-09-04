<script setup lang="ts">
import { TabsList as RekaTabsList, type TabsListProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { cn } from '~/lib/utils'

const props = defineProps<TabsListProps & { class?: HTMLAttributes['class'] }>()
</script>

<template>
  <!-- The DP segmented track: a pill-shaped well with the triggers inset. -->
  <RekaTabsList
    :as="as"
    :as-child="asChild"
    :loop="loop"
    :class="cn('flex gap-1 rounded-pill bg-fill-subtle p-1', props.class)"
  >
    <slot />
  </RekaTabsList>
</template>
