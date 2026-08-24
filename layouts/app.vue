<script setup lang="ts">
// Main app layout: navigation plus a scrolling content column.
// Mobile: content stacks above the floating tab bar.
// Desktop: side rail on the left, content capped at --content-max beside it.
</script>

<template>
  <div class="layout-app">
    <AppNav />

    <main class="layout-app__main scroll-y">
      <div class="layout-app__content">
        <slot />
      </div>
      <!-- spacer so content clears the floating tab bar on mobile -->
      <div class="layout-app__tab-spacer" />
    </main>

    <!-- Mounted once for the whole app: the install surfaces on Home and More
         both open this same sheet through `useInstallApp`. -->
    <InstallAppSheet />
  </div>
</template>

<style scoped lang="scss">
.layout-app {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--paper);

  &__main {
    flex: 1;
    min-height: 0;
  }

  &__content {
    width: 100%;
  }

  &__tab-spacer {
    height: 96px;
  }
}

@media (min-width: 1024px) {
  .layout-app {
    flex-direction: row;

    &__main {
      min-width: 0;
      padding: 32px 40px 0;
    }

    &__content {
      max-width: var(--content-max);
      margin: 0 auto;
    }

    &__tab-spacer {
      height: 40px;
    }
  }
}
</style>
