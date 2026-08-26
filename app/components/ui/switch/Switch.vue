<script setup lang="ts">
import {
  SwitchRoot as RekaSwitchRoot,
  SwitchThumb as RekaSwitchThumb,
  useForwardPropsEmits,
  type SwitchRootEmits,
  type SwitchRootProps,
} from 'reka-ui'
import { computed, type HTMLAttributes } from 'vue'
import { cn } from '~/lib/utils'

const props = defineProps<SwitchRootProps & { class?: HTMLAttributes['class'] }>()
const emits = defineEmits<SwitchRootEmits>()

const delegated = computed(() => {
  const { class: _class, ...rest } = props
  return rest
})

const forwarded = useForwardPropsEmits(delegated, emits)
</script>

<template>
  <!--
    46 x 27 with a 21px knob and 3px of padding, matching the switch the
    preferences rows already drew. Reka contributes the parts a bare <button
    role="switch"> did not: a real `disabled` state, an optional hidden input so
    the control can live in a form, and `data-state` for styling.
  -->
  <RekaSwitchRoot
    v-bind="forwarded"
    :class="
      cn(
        'inline-flex h-[27px] w-[46px] shrink-0 items-center rounded-pill p-[3px] transition-colors duration-[180ms] ease-out',
        'bg-hairline-strong data-[state=checked]:bg-rose-fill',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-ring focus-visible:ring-offset-2 focus-visible:ring-offset-raised',
        'disabled:cursor-not-allowed disabled:opacity-45',
        props.class,
      )
    "
  >
    <RekaSwitchThumb
      class="pointer-events-none block size-[21px] rounded-full bg-raised shadow-[var(--shadow-knob)] transition-transform duration-[180ms] ease-out data-[state=checked]:translate-x-[19px]"
    />
  </RekaSwitchRoot>
</template>
