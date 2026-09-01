<script lang="ts">
import { cva, type VariantProps } from 'class-variance-authority'

/* The four sizes the app actually draws: 30px in a chat row, 32px on a
   leaderboard row, 36px in the side nav, 52px on the profile card. */
export const avatarVariants = cva(
  'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full align-middle',
  {
    variants: {
      size: {
        xs: 'size-7.5 text-[11px]',
        sm: 'size-8 text-[11px]',
        md: 'size-9 text-[13px]',
        lg: 'size-13 text-[18px]',
      },
    },
    defaultVariants: { size: 'md' },
  },
)

export type AvatarVariants = VariantProps<typeof avatarVariants>
</script>

<script setup lang="ts">
import { AvatarRoot as RekaAvatarRoot, type AvatarRootProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { cn } from '~/lib/utils'

const props = withDefaults(
  defineProps<
    AvatarRootProps & { class?: HTMLAttributes['class']; size?: AvatarVariants['size'] }
  >(),
  { size: 'md' },
)
</script>

<template>
  <RekaAvatarRoot :as="as" :as-child="asChild" :class="cn(avatarVariants({ size }), props.class)">
    <slot />
  </RekaAvatarRoot>
</template>
