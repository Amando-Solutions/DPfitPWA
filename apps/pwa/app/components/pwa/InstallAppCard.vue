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
    <div v-if="install.showCard.value" class="install-dock [position:absolute] [top:0] [left:0] [right:0] [padding:calc(12px_+_env(safe-area-inset-top))_14px_18px] [background:linear-gradient(to_bottom,_var(--paper)_calc(100%_-_18px),_var(--surface-fade))] [z-index:50] [pointer-events:none] lg:[left:var(--sidenav-width)] lg:[padding:16px_40px_20px] lg:[background:linear-gradient(to_bottom,_var(--paper)_calc(100%_-_20px),_var(--surface-fade))] [&.install-enter-active]:[transition:opacity_0.2s_ease,_transform_0.24s_cubic-bezier(0.22,_1,_0.36,_1)] [&.install-leave-active]:[transition:opacity_0.2s_ease,_transform_0.24s_cubic-bezier(0.22,_1,_0.36,_1)] [&.install-enter-from]:[opacity:0] [&.install-enter-from]:[transform:translateY(-12px)] [&.install-leave-to]:[opacity:0] [&.install-leave-to]:[transform:translateY(-12px)]">
      <section class="install [pointer-events:auto] [display:flex] [align-items:center] [gap:10px] [padding:10px_10px_10px_12px] [border-radius:var(--radius-md)] [background:var(--paper-raised)] [box-shadow:var(--shadow-raised)] lg:[max-width:var(--content-max)] lg:[margin:0_auto]">
        <span class="install__icon [width:30px] [height:30px] [border-radius:var(--radius-pill)] [background:var(--rose-soft)] [color:var(--rose)] [display:grid] [place-items:center] [flex-shrink:0]">
          <AppIcon name="download" :size="15" />
        </span>
        <div class="install__text [flex:1_1_auto] [min-width:0]">
          <p class="install__title [margin:0] [font-family:var(--font-display)] [font-weight:900] [font-size:14px] [letter-spacing:-0.2px] [color:var(--ink)]">Install DP Fitness</p>
          <p class="install__body [display:none] [margin:2px_0_0] [font-size:12px] [line-height:1.35] [color:var(--violet-45)] [@media(min-width:_420px)]:[display:block]">Full screen, and it works offline.</p>
        </div>

        <button
          type="button"
          class="install__cta [flex-shrink:0] [height:36px] [padding:0_14px] [border-radius:var(--radius-pill)] [background:var(--rose-fill)] [color:var(--on-rose)] [font-size:13px] [font-weight:700] [white-space:nowrap] [transition:transform_0.1s_ease-out] active:[transform:scale(0.98)] [&:disabled]:[opacity:0.45] [&:disabled]:[pointer-events:none]"
          :disabled="busy"
          @click="run"
        >
          {{ install.ctaLabel.value }}
        </button>
        <button
          type="button"
          class="install__dismiss [flex-shrink:0] [width:28px] [height:28px] [display:grid] [place-items:center] [border-radius:var(--radius-pill)] [color:var(--violet-45)]"
          aria-label="Not now"
          @click="install.snooze()"
        >
          <AppIcon name="close" :size="15" :stroke="2.2" />
        </button>
      </section>
    </div>
  </Transition>
</template>
