<script setup lang="ts">
/**
 * The terms in a scrollable modal over the booking form, so reading them never
 * costs anybody the answers they had typed. The same `TermsContent` as the
 * `/terms` page, which stays for the footer link and for a click that asks for
 * a new tab.
 *
 * A native `<dialog>` opened with `showModal()`: the page behind goes inert,
 * focus moves in and comes back, and Escape closes it, none of it code here.
 */
const dialog = ref<HTMLDialogElement>()
const scroller = ref<HTMLElement>()

/** Rendered on first open, so nobody downloads terms they never open. */
const rendered = ref(false)

/** Opens at the top, wherever the last visit was scrolled to. */
async function open() {
  rendered.value = true
  await nextTick()
  dialog.value?.showModal()
  if (scroller.value) scroller.value.scrollTop = 0
}

const close = () => dialog.value?.close()

// The panel fills the dialog edge to edge, so a click that lands on the
// dialog itself landed on the backdrop around it.
function onClick(event: MouseEvent) {
  if (event.target === dialog.value) close()
}

defineExpose({ open })
</script>

<template>
  <dialog
    ref="dialog"
    aria-labelledby="terms-modal-title"
    class="lp-terms-modal m-auto max-h-none w-[min(760px,calc(100vw-32px))] max-w-none overflow-hidden rounded-[28px] border-0 bg-white p-0 font-landing text-lp-ink shadow-[0_30px_60px_-30px_rgba(29,22,40,0.45)] backdrop:bg-lp-ink/55"
    @click="onClick"
  >
    <div class="flex max-h-[calc(100dvh-32px)] flex-col sm:max-h-[min(88dvh,920px)]">
      <header class="flex items-start justify-between gap-4 border-b border-lp-rule px-5 py-5 sm:px-8 sm:py-6">
        <div class="flex flex-col gap-2">
          <span class="lp-eyebrow">the fine print</span>
          <h2 id="terms-modal-title" class="m-0 text-[clamp(28px,3.4vw,38px)] leading-[1.05] font-medium tracking-[-0.03em]">
            terms and <span class="serif-accent">conditions</span>
          </h2>
        </div>
        <button
          type="button"
          aria-label="Close the terms"
          class="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full border border-lp-edge text-lp-ink transition-colors duration-300 hover:bg-lp-lilac-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lp-accent"
          @click="close"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      <div ref="scroller" class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-8 sm:py-8">
        <TermsContent v-if="rendered" :level="3" />
      </div>

      <footer class="flex justify-end border-t border-lp-rule px-5 py-4 sm:px-8">
        <CtaButton type="button" class="w-full sm:w-auto" @click="close">done</CtaButton>
      </footer>
    </div>
  </dialog>
</template>

<style>
/* `showModal()` makes the page inert but leaves it scrollable, and a wheel
   that runs off the end of the terms would carry on down the page behind. */
html:has(.lp-terms-modal[open]) {
  overflow: hidden;
}
</style>
