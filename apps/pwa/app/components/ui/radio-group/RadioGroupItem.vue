<script lang="ts">
import { cva, type VariantProps } from 'class-variance-authority'

/* `dot` is the stock shadcn radio. `plain` strips the chrome so the caller can
   render the option however the design needs it — the segmented pills, the 1–5
   scale, the appearance switcher — while keeping the group's keyboard
   behaviour and its radio semantics. */
export const radioGroupItemVariants = cva(
  'disabled:cursor-not-allowed disabled:opacity-45',
  {
    variants: {
      variant: {
        dot: 'aspect-square size-4.5 shrink-0 rounded-full border-[1.5px] border-hairline-strong text-rose focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-ring data-[state=checked]:border-rose',
        plain: '',
      },
    },
    defaultVariants: { variant: 'dot' },
  },
)

export type RadioGroupItemVariants = VariantProps<typeof radioGroupItemVariants>
</script>

<script setup lang="ts">
import {
  RadioGroupIndicator as RekaRadioGroupIndicator,
  RadioGroupItem as RekaRadioGroupItem,
  useForwardProps,
  type RadioGroupItemProps,
} from 'reka-ui'
import { computed, type HTMLAttributes } from 'vue'
import { cn } from '~/lib/utils'

const props = withDefaults(
  defineProps<
    RadioGroupItemProps & {
      class?: HTMLAttributes['class']
      variant?: RadioGroupItemVariants['variant']
    }
  >(),
  { variant: 'dot' },
)

const delegated = computed(() => {
  const { class: _class, variant: _variant, ...rest } = props
  return rest
})

const forwarded = useForwardProps(delegated)
</script>

<template>
  <RekaRadioGroupItem
    v-bind="forwarded"
    :class="cn(radioGroupItemVariants({ variant }), props.class)"
  >
    <!-- A custom option renders its own content; the fallback is shadcn's dot. -->
    <slot>
      <RekaRadioGroupIndicator class="flex items-center justify-center">
        <span class="size-2.5 rounded-full bg-rose-fill" />
      </RekaRadioGroupIndicator>
    </slot>
  </RekaRadioGroupItem>
</template>
