<script setup lang="ts">
// Full-bleed layout for flows without navigation (onboarding, auth, setup).
// On desktop the flow is centred in a narrow column so the copy and inputs keep
// a comfortable measure instead of stretching across the whole surface.
</script>

<template>
  <div class="layout-default [position:relative] [height:100%] w-full [display:flex] [flex-direction:column] [overflow:hidden] [background:var(--paper)]">
    <div class="layout-default__body scroll-y max-w-screen [flex:1] [display:flex] [flex-direction:column] [min-height:0] lg:[align-items:center] lg:[padding:40px_24px]">
      <div class="layout-default__flow w-full [flex:1] [display:flex] [flex-direction:column] [width:100%] lg:[flex:0_1_auto] lg:[margin:auto] lg:[max-width:var(--flow-max)] lg:[background:var(--paper-raised)] lg:[border-radius:var(--radius-lg)] lg:[box-shadow:var(--shadow-raised)] lg:[overflow:hidden]">
        <slot />
      </div>
    </div>
  </div>
</template>
