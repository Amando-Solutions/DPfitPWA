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
  <div class="app-shell">
    <div class="app-shell__surface">
      <slot />
    </div>
  </div>
</template>

<style scoped lang="scss">
.app-shell {
  height: 100dvh;
  width: 100%;
  display: flex;
  justify-content: center;
  background: var(--paper);
}

.app-shell__surface {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--paper);
}

@media (min-width: 1024px) {
  .app-shell {
    background: var(--app-backdrop);
  }

  // The cap constrains the layout, never the paint: no border or shadow, so the
  // background runs unbroken from edge to edge.
  .app-shell__surface {
    max-width: var(--app-max-width);
  }
}
</style>
