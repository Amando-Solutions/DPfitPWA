<script setup lang="ts">
import { NAV_LINKS, REGISTER_ANCHOR } from '~/data/landing'

/**
 * The sticky bar. Transparent while it sits over the hero, which is what the
 * Figma variant is named for, then it has to earn its own background: past the
 * hero the page turns to warm paper, and white type on transparent over paper
 * is unreadable. So it fades in the night surface once the page has moved.
 *
 * The threshold is deliberately small (a few pixels of scroll rather than the
 * full hero height): the bar only needs to commit before the light sections
 * arrive, and reacting immediately reads as intentional where reacting at
 * 900px reads as a bug.
 */
const scrolled = ref(false)
const menuOpen = ref(false)

function onScroll() {
  scrolled.value = window.scrollY > 24
}

onMounted(() => {
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })
})

onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))

// A tap on a nav link has to close the sheet as well as jump, since the target
// is on the same page and no navigation event will do it for us.
function closeMenu() {
  menuOpen.value = false
}
</script>

<template>
  <header
    class="fixed inset-x-0 top-0 z-50 transition-colors duration-300"
    :class="
      scrolled || menuOpen
        ? 'bg-night/92 backdrop-blur-md border-b border-white/10'
        : 'bg-transparent'
    "
  >
    <PageContainer>
      <div class="flex h-[72px] items-center justify-between">
        <a
          :href="REGISTER_ANCHOR"
          class="flex items-baseline gap-3"
          @click="closeMenu"
        >
          <BrandMark />
          <span class="meta hidden text-white/72 sm:inline">Recomp Challenge</span>
        </a>

        <nav class="hidden items-center gap-[26px] lg:flex">
          <a
            v-for="link in NAV_LINKS"
            :key="link.href"
            :href="link.href"
            class="font-body text-[13.5px] font-medium text-white/85 transition-colors hover:text-white"
          >
            {{ link.label }}
          </a>
          <CtaButton :href="REGISTER_ANCHOR" compact>Join the Challenge</CtaButton>
        </nav>

        <div class="flex items-center gap-3 lg:hidden">
          <CtaButton :href="REGISTER_ANCHOR" compact class="hidden sm:inline-flex">
            Join
          </CtaButton>
          <button
            type="button"
            class="flex size-10 flex-col items-center justify-center gap-[5px] rounded-pill border border-white/25 text-white"
            :aria-expanded="menuOpen"
            aria-controls="site-menu"
            :aria-label="menuOpen ? 'Close menu' : 'Open menu'"
            @click="menuOpen = !menuOpen"
          >
            <span
              class="block h-px w-4 bg-current transition-transform duration-200"
              :class="menuOpen && 'translate-y-[3px] rotate-45'"
            />
            <span
              class="block h-px w-4 bg-current transition-transform duration-200"
              :class="menuOpen && '-translate-y-[3px] -rotate-45'"
            />
          </button>
        </div>
      </div>

      <!-- The small-screen sheet. `v-show` rather than `v-if` so the links stay
           in the document for a crawler reading the page without JavaScript. -->
      <nav
        v-show="menuOpen"
        id="site-menu"
        class="flex flex-col gap-1 border-t border-white/10 py-4 lg:hidden"
      >
        <a
          v-for="link in NAV_LINKS"
          :key="link.href"
          :href="link.href"
          class="font-body rounded-field px-2 py-3 text-[15px] font-medium text-white/85 transition-colors hover:bg-white/5 hover:text-white"
          @click="closeMenu"
        >
          {{ link.label }}
        </a>
        <CtaButton
          :href="REGISTER_ANCHOR"
          class="mt-2 w-full sm:hidden"
          @click="closeMenu"
        >
          Join the Challenge
        </CtaButton>
      </nav>
    </PageContainer>
  </header>
</template>
