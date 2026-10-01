<script setup lang="ts">
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
//
// As tall as `html`, `body` and `#__nuxt`, which is the layout viewport: the one
// height the soft keyboard never changes. Not the visual viewport, which is the
// part above the keyboard. Sizing to that shrank the whole app while the member
// typed, lifting the tab bar onto the keyboard, and iOS reports the keyboard
// closing on `visualViewport` alone, so it could miss the way back down and
// leave the bar hanging there. The keyboard covers the tab bar instead, as it
// does in a native app, and iOS slides the page up to keep the field in view.
// See `plugins/keyboard.client.ts` for sliding it back.
</script>

<template>
  <div class="app-shell h-full w-full flex justify-center overflow-clip [background:var(--paper)] lg:[background:var(--app-backdrop)]">
    <div class="app-shell__surface relative w-full h-full flex flex-col overflow-hidden [background:var(--paper)] lg:max-w-(--app-max-width)">
      <slot />
    </div>
  </div>
</template>
