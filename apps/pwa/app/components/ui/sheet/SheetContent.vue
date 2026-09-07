<script lang="ts">
import { cva, type VariantProps } from 'class-variance-authority'

/* `adaptive` is the DP pattern and the one every screen in this app uses: a
   bottom sheet while the viewport is narrow, a centred dialog once there is
   desktop room. It is a single component rather than two because the sheet has
   to keep its focus trap and its open state across the breakpoint. The four
   plain sides are stock shadcn, kept for anything that needs a true side panel.

   1024px is the app-wide desktop breakpoint (`lg`); see `--app-max-width` and
   friends in `assets/styles/main.css`. */
export const sheetVariants = cva(
  'fixed z-200 bg-overlay [animation:sheet-in_280ms_cubic-bezier(0.22,1,0.36,1)] data-[state=closed]:[animation:sheet-out_280ms_cubic-bezier(0.22,1,0.36,1)] motion-reduce:[animation-duration:1ms]',
  {
  variants: {
    side: {
      top: 'inset-x-0 top-0 rounded-b-[28px] px-5 pt-[calc(12px+env(safe-area-inset-top))] pb-6 shadow-sheet [animation-name:sheet-in-top] data-[state=closed]:[animation-name:sheet-out-top]',
      bottom:
        'inset-x-0 bottom-0 mx-auto w-full max-w-130 rounded-t-[28px] px-5 pt-3 pb-[calc(24px+env(safe-area-inset-bottom))] shadow-sheet',
      left:
        'inset-y-0 left-0 h-full w-3/4 max-w-100 px-5 py-6 shadow-sheet sm:max-w-sm [animation-name:sheet-in-left] data-[state=closed]:[animation-name:sheet-out-left]',
      right:
        'inset-y-0 right-0 h-full w-3/4 max-w-100 px-5 py-6 shadow-sheet sm:max-w-sm [animation-name:sheet-in-right] data-[state=closed]:[animation-name:sheet-out-right]',
      adaptive: [
        'inset-x-0 bottom-0 mx-auto w-full max-w-130 rounded-t-[28px] px-5 pt-3 pb-[calc(24px+env(safe-area-inset-bottom))] shadow-sheet',
        'lg:inset-x-auto lg:inset-y-auto lg:left-1/2 lg:top-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2',
        'lg:rounded-lg lg:px-6.5 lg:pt-5.5 lg:pb-6.5 lg:shadow-dialog',
        'lg:[animation-name:dialog-in] lg:data-[state=closed]:[animation-name:dialog-out]',
      ],
    },
  },
  defaultVariants: { side: 'adaptive' },
  },
)

export type SheetVariants = VariantProps<typeof sheetVariants>
</script>

<script setup lang="ts">
import {
  DialogContent as RekaDialogContent,
  DialogPortal as RekaDialogPortal,
  useForwardPropsEmits,
  type DialogContentEmits,
  type DialogContentProps,
} from 'reka-ui'
import { computed, type HTMLAttributes } from 'vue'
import { cn } from '~/lib/utils'

const props = withDefaults(
  defineProps<
    DialogContentProps & { class?: HTMLAttributes['class']; side?: SheetVariants['side'] }
  >(),
  { side: 'adaptive' },
)
const emits = defineEmits<DialogContentEmits>()

// The template's root is the portal, so Vue's automatic fallthrough would land
// attributes there rather than on the panel. Attributes are bound explicitly on
// the content element below instead, which is what lets a caller set (or clear)
// things like `aria-describedby` and `aria-label` on the dialog itself.
defineOptions({ inheritAttrs: false })

// `class` and `side` are presentation, not part of the Reka contract, so they
// are stripped before the rest is forwarded to the primitive.
const delegated = computed(() => {
  const { class: _class, side: _side, ...rest } = props
  return rest
})

const forwarded = useForwardPropsEmits(delegated, emits)
</script>

<template>
  <RekaDialogPortal>
    <SheetOverlay />
    <RekaDialogContent
      data-sheet-content
      :data-side="side"
      aria-modal="true"
      v-bind="{ ...forwarded, ...$attrs }"
      :class="cn(sheetVariants({ side }), props.class)"
    >
      <slot />
    </RekaDialogContent>
  </RekaDialogPortal>
</template>
