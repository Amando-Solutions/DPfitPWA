<script setup lang="ts">
// Main app layout: navigation plus a scrolling content column.
// Mobile: content stacks above the floating tab bar.
// Desktop: side rail on the left, content capped at --content-max beside it.
</script>

<template>
  <div class="layout-app [position:relative] [height:100%] [display:flex] [flex-direction:column] [background:var(--paper)] lg:[flex-direction:row]">
    <AppNav />

    <main class="layout-app__main scroll-y [flex:1] [min-height:0] lg:[min-width:0] lg:[padding:32px_40px_0]">
      <div class="layout-app__content [width:100%] lg:[max-width:var(--content-max)] lg:[margin:0_auto]">
        <slot />
      </div>
      <!-- spacer so content clears the floating tab bar on mobile -->
      <div class="layout-app__tab-spacer [height:96px] lg:[height:40px]" />
    </main>

    <!-- Mounted once for the whole app: the install surfaces on Home and More
         both open this same sheet through `useInstallApp`. -->
    <InstallAppSheet />
  </div>
</template>
