<script setup lang="ts">
import {
  DialogContent as RekaDialogContent,
  useForwardPropsEmits,
  type DialogContentEmits,
  type DialogContentProps,
} from 'reka-ui'
import { computed, type HTMLAttributes } from 'vue'
import { cn } from '~/lib/utils'

const props = defineProps<
  DialogContentProps & {
    class?: HTMLAttributes['class']
    /** Classes for the scrim, for dialogs that need a different one. */
    overlayClass?: HTMLAttributes['class']
  }
>()
const emits = defineEmits<DialogContentEmits>()

// See SheetContent: the root here is the portal, so attributes are bound onto
// the content element explicitly rather than left to Vue's fallthrough.
defineOptions({ inheritAttrs: false })

// `class` and `overlayClass` are presentation, not part of the Reka contract,
// so they are stripped before the rest is forwarded to the primitive.
const delegated = computed(() => {
  const { class: _class, overlayClass: _overlayClass, ...rest } = props
  return rest
})

const forwarded = useForwardPropsEmits(delegated, emits)
</script>

<template>
  <DialogPortal>
    <DialogOverlay :class="overlayClass" />
    <RekaDialogContent
      data-dialog-content
      aria-modal="true"
      v-bind="{ ...forwarded, ...$attrs }"
      :class="
        cn(
          'fixed left-1/2 top-1/2 z-200 grid w-full max-w-130 -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg bg-overlay p-6 shadow-dialog [animation:dialog-content-in_200ms_cubic-bezier(0.22,1,0.36,1)] data-[state=closed]:[animation:dialog-content-out_160ms_ease-in] motion-reduce:[animation-duration:1ms]',
          props.class,
        )
      "
    >
      <slot />
    </RekaDialogContent>
  </DialogPortal>
</template>
