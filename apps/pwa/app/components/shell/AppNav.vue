<script setup lang="ts">
// Primary navigation for the app screens. Renders the desktop side rail and the
// mobile tab bar as siblings, each hiding itself at the other's breakpoint, so
// a screen only ever has to drop <AppNav /> into its flex row/column.
</script>

<template>
  <SideNav />
  <TabBar />
</template>
