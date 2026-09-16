<script setup lang="ts">
import { TabsTrigger as RekaTabsTrigger, useForwardProps, type TabsTriggerProps } from 'reka-ui'
import { computed, type HTMLAttributes } from 'vue'
import { cn } from '~/lib/utils'

const props = defineProps<TabsTriggerProps & { class?: HTMLAttributes['class'] }>()

const delegated = computed(() => {
  const { class: _class, ...rest } = props
  return rest
})

const forwarded = useForwardProps(delegated)
</script>

<template>
  <!--
    Identical to the pills the old SegmentedTabs drew. The selected state is
    driven by `data-state` rather than a bound class, so `btn-raised` and the
    inverse fill come from the same place Reka sets the ARIA from.
  -->
  <RekaTabsTrigger
    v-bind="forwarded"
    :class="
      cn(
        'h-9.5 flex-1 rounded-pill text-[13px]',
        'text-muted transition-colors duration-150 hover:text-ink',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring',
        'data-[state=active]:btn-raised data-[state=active]:bg-inverse data-[state=active]:font-semibold data-[state=active]:text-on-inverse data-[state=active]:[--btn-face:var(--surface-inverse)]',
        props.class,
      )
    "
  >
    <slot />
  </RekaTabsTrigger>
</template>
