<script setup lang="ts">
/**
 * The one measure every section on the page is set to: 1200px wide with 44px
 * gutters, exactly as the Figma frame draws it. The gutters shrink on the way
 * down to the 390px artboard, where 44px would leave the copy in a column too
 * narrow to read.
 */
</script>

<template>
  <div class="mx-auto w-full max-w-[1200px] px-6 sm:px-8 lg:px-11">
    <slot />
  </div>
</template>
