import type { VariantProps } from "class-variance-authority"
import { cva } from "class-variance-authority"

export { default as Bubble } from "./Bubble.vue"
export { default as BubbleContent } from "./BubbleContent.vue"
export { default as BubbleGroup } from "./BubbleGroup.vue"
export { default as BubbleReactions } from "./BubbleReactions.vue"

export const bubbleVariants = cva(
  "gap-1 data-[align=end]:self-end max-w-[80%] data-[variant=ghost]:max-w-full group-data-[align=end]/message:self-end group/bubble relative flex w-fit min-w-0 flex-col",
  {
    variants: {
      variant: {
        default: "*:data-[slot=bubble-content]:bg-rose-fill *:data-[slot=bubble-content]:text-on-rose [&>[data-slot=bubble-content]:is(button,a):hover]:bg-rose-fill/90",
        secondary: "*:data-[slot=bubble-content]:bg-raised *:data-[slot=bubble-content]:text-ink [&>[data-slot=bubble-content]:is(button,a):hover]:bg-fill-muted",
        muted: "*:data-[slot=bubble-content]:bg-bubble-coach *:data-[slot=bubble-content]:text-ink [&>[data-slot=bubble-content]:is(button,a):hover]:bg-bubble-coach/90",
        tinted: "*:data-[slot=bubble-content]:bg-rose-soft *:data-[slot=bubble-content]:text-ink [&>[data-slot=bubble-content]:is(button,a):hover]:bg-rose-ring",
        outline: "*:data-[slot=bubble-content]:border-hairline *:data-[slot=bubble-content]:bg-raised *:data-[slot=bubble-content]:text-ink [&>[data-slot=bubble-content]:is(button,a):hover]:bg-fill-subtle",
        ghost: "*:data-[slot=bubble-content]:rounded-none *:data-[slot=bubble-content]:bg-transparent *:data-[slot=bubble-content]:p-0 *:data-[slot=bubble-content]:text-ink [&>[data-slot=bubble-content]:is(button,a):hover]:bg-fill-subtle border-none",
        destructive: "*:data-[slot=bubble-content]:bg-rose-soft *:data-[slot=bubble-content]:text-rose [&>[data-slot=bubble-content]:is(button,a):hover]:bg-rose-ring",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)
export type BubbleVariants = VariantProps<typeof bubbleVariants>

export const bubbleReactionsVariants = cva(
  "rounded-full ring-3 ring-raised bg-fill-muted shrink-0 gap-1 px-1.5 py-0.5 has-[button]:p-0 text-sm absolute z-10 flex w-fit items-center justify-center",
  {
    variants: {
      side: {
        top: "top-0 -translate-y-3/4",
        bottom: "bottom-0 translate-y-3/4",
      },
      align: {
        start: "left-3",
        end: "right-3",
      },
    },
    defaultVariants: {
      side: "bottom",
      align: "end",
    },
  },
)
export type BubbleReactionsVariants = VariantProps<typeof bubbleReactionsVariants>
