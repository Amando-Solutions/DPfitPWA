<script setup lang="ts">
import { AvatarImage as RekaAvatarImage, type AvatarImageProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { cn } from '~/lib/utils'

const props = defineProps<AvatarImageProps & { class?: HTMLAttributes['class'] }>()
</script>

<template>
  <!--
    Reka tracks the image's real load state and only paints it once it has
    decoded, handing over to <AvatarFallback> if it errors. That is the gap in
    the markup this replaces: it branched on whether an avatar URL existed, so a
    URL that existed but failed to load left a broken-image icon on the page.
  -->
  <RekaAvatarImage
    :src="src"
    :referrer-policy="referrerPolicy"
    :cross-origin="crossOrigin"
    :as="as"
    :as-child="asChild"
    :class="cn('size-full object-cover', props.class)"
  />
</template>
