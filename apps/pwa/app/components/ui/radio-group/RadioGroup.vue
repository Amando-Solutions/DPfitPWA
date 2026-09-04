<script setup lang="ts">
import {
  RadioGroupRoot as RekaRadioGroupRoot,
  useForwardPropsEmits,
  type RadioGroupRootEmits,
  type RadioGroupRootProps,
} from 'reka-ui'
import { computed, type HTMLAttributes } from 'vue'
import { cn } from '~/lib/utils'

const props = defineProps<RadioGroupRootProps & { class?: HTMLAttributes['class'] }>()
const emits = defineEmits<RadioGroupRootEmits>()

const delegated = computed(() => {
  const { class: _class, ...rest } = props
  return rest
})

const forwarded = useForwardPropsEmits(delegated, emits)
</script>

<template>
  <!--
    Reka gives the group roving tabindex and arrow-key navigation: one tab stop
    for the whole set, arrows move between options and select as they go. The
    hand-rolled versions this replaces put every option in the tab order and
    responded to nothing but a click.
  -->
  <RekaRadioGroupRoot v-bind="forwarded" :class="cn('grid gap-2', props.class)">
    <slot />
  </RekaRadioGroupRoot>
</template>
