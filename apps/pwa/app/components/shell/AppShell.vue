<script setup lang="ts">
import { ref, onMounted } from 'vue'
// The outer app surface.
//
// This deliberately does NOT look like a phone: no bezel, no notch, no faux
// status bar. It is one responsive product surface:
//   · mobile  → full-bleed, edge to edge
//   · desktop → centered, capped at --app-max-width, viewport tall with
//               internal scrolling so no screen turns into a very long page.
//
// Clipped, because the iOS back swipe (`plugins/swipe-back.client.ts`) slides
// the surface off to the right, and without a clip that briefly makes the page
// wider than the screen.
const appShellRef = ref<HTMLElement | null>(null)
onMounted(() => {
  const updateHeight = () => {
    const vh = window.visualViewport?.height ?? window.innerHeight
    appShellRef.value?.style.setProperty('height', `${vh}px`)
  }
  window.addEventListener('resize', updateHeight)
  window.addEventListener('orientationchange', updateHeight)
  updateHeight()
})
</script>

<template>
  <div ref="appShellRef" class="app-shell w-full flex justify-center overflow-clip [background:var(--paper)] lg:[background:var(--app-backdrop)]">
    <div class="app-shell__surface relative w-full h-full flex flex-col overflow-hidden [background:var(--paper)] lg:max-w-(--app-max-width)">
      <slot />
    </div>
  </div>
</template>
