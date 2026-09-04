<script setup lang="ts">
// The outer app surface.
//
// This deliberately does NOT look like a phone: no bezel, no notch, no faux
// status bar. It is one responsive product surface:
//   · mobile  → full-bleed, edge to edge
//   · desktop → centered, capped at --app-max-width, viewport tall with
//               internal scrolling so no screen turns into a very long page.
</script>

<template>
  <div class="app-shell [height:100dvh] [width:100%] [display:flex] [justify-content:center] [background:var(--paper)] lg:[background:var(--app-backdrop)]">
    <div class="app-shell__surface [position:relative] [width:100%] [height:100%] [display:flex] [flex-direction:column] [overflow:hidden] [background:var(--paper)] lg:[max-width:var(--app-max-width)]">
      <slot />
    </div>
  </div>
</template>
