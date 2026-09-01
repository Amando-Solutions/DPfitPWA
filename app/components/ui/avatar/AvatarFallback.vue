<script setup lang="ts">
import { AvatarFallback as RekaAvatarFallback, type AvatarFallbackProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { cn } from '~/lib/utils'

const props = defineProps<AvatarFallbackProps & { class?: HTMLAttributes['class'] }>()
</script>

<template>
  <!-- Initials on the brand rose, as every fallback in the app already drew. -->
  <RekaAvatarFallback
    :delay-ms="delayMs"
    :as="as"
    :as-child="asChild"
    :class="
      cn(
        'grid size-full place-items-center bg-rose-fill font-display font-black text-on-rose',
        props.class,
      )
    "
  >
    <slot />
  </RekaAvatarFallback>
</template>
