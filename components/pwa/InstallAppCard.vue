<script setup lang="ts">
// The nudge on Home, floating over the top of the app rather than sitting in
// the page flow: as an overlay it costs the screen no vertical space, which is
// what keeps the greeting and today's session where they were.
//
// The dock is positioned against the layout, not the scroller it is rendered
// inside, so it stays put while the page moves under it — the same trick the
// tab bar uses at the other end.
//
// Opt-out rather than sticky: "Not now" puts it away for a fortnight, and the
// More hub keeps a permanent row for anyone who changes their mind before then.
const install = useInstallApp()

const busy = ref(false)

const run = async () => {
  busy.value = true
  try {
    await install.install()
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Transition name="install">
    <div v-if="install.showCard.value" class="install-dock">
      <section class="install">
        <span class="install__icon">
          <AppIcon name="download" :size="15" />
        </span>
        <div class="install__text">
          <p class="install__title">Install DP Fitness</p>
          <p class="install__body">Full screen, and it works offline.</p>
        </div>

        <button
          type="button"
          class="install__cta"
          :disabled="busy"
          @click="run"
        >
          {{ install.ctaLabel.value }}
        </button>
        <button
          type="button"
          class="install__dismiss"
          aria-label="Not now"
          @click="install.snooze()"
        >
          <AppIcon name="close" :size="15" :stroke="2.2" />
        </button>
      </section>
    </div>
  </Transition>
</template>

<style scoped lang="scss">
// Against `.layout-app`, which is the nearest positioned ancestor and sits
// outside the scrolling column, so the banner does not travel with the page.
// Absolute rather than fixed on purpose: fixed would break out of the capped,
// centred desktop surface and stretch across the whole viewport.
.install-dock {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: calc(12px + env(safe-area-inset-top)) 14px 18px;
  // Content passes *under* the banner, so it is faded out rather than sliced
  // in half by the card edge — the same scrim the tab bar draws at the foot.
  background: linear-gradient(
    to bottom,
    var(--paper) calc(100% - 18px),
    var(--surface-fade)
  );
  z-index: 50;
  // Only the banner itself takes taps; the gutter beside it stays inert so the
  // screen underneath is still reachable.
  pointer-events: none;
}

.install {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 10px 10px 12px;
  border-radius: var(--radius-md);
  background: var(--paper-raised);
  box-shadow: var(--shadow-raised);

  &__icon {
    width: 30px;
    height: 30px;
    border-radius: var(--radius-pill);
    background: var(--rose-soft);
    color: var(--rose);
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }

  &__text {
    flex: 1 1 auto;
    min-width: 0;
  }

  &__title {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 14px;
    letter-spacing: -0.2px;
    color: var(--ink);
  }

  // The second line is the first thing to go: below this the row only has room
  // for the offer and the button that takes it.
  &__body {
    display: none;
    margin: 2px 0 0;
    font-size: 12px;
    line-height: 1.35;
    color: var(--violet-45);
  }

  &__cta {
    flex-shrink: 0;
    height: 36px;
    padding: 0 14px;
    border-radius: var(--radius-pill);
    background: var(--rose-fill);
    color: var(--on-rose);
    font-size: 13px;
    font-weight: 700;
    white-space: nowrap;
    transition: transform 0.1s ease-out;

    &:active {
      transform: scale(0.98);
    }

    &:disabled {
      opacity: 0.45;
      pointer-events: none;
    }
  }

  &__dismiss {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-pill);
    color: var(--violet-45);
  }
}

@media (min-width: 420px) {
  .install__body {
    display: block;
  }
}

// Desktop: clear of the side rail, and lined up with the content column rather
// than with the window.
@media (min-width: 1024px) {
  .install-dock {
    left: var(--sidenav-width);
    padding: 16px 40px 20px;
    background: linear-gradient(
      to bottom,
      var(--paper) calc(100% - 20px),
      var(--surface-fade)
    );
  }

  .install {
    max-width: var(--content-max);
    margin: 0 auto;
  }
}

.install-enter-active,
.install-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.24s cubic-bezier(0.22, 1, 0.36, 1);
}

.install-enter-from,
.install-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}
</style>
