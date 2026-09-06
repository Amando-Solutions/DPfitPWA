<script setup lang="ts">
/**
 * Where Paystack sends the buyer back to.
 *
 * Its whole job is to confirm the payment and then get out of the way. The
 * access code is not here and never was — it goes to the inbox — so there is
 * nothing on this page worth reading twice, which is why it takes itself back
 * to the site rather than sitting there waiting to be dismissed.
 *
 * Not prerendered: it exists only for a reference in a query string. See the
 * `routeRules` entry in `nuxt.config.ts`.
 */
const route = useRoute()

type Phase = 'checking' | 'done' | 'unpaid' | 'error'
const phase = ref<Phase>('checking')

/** How long the confirmation sits before it takes them back. */
const RETURN_AFTER_SECONDS = 8
const secondsLeft = ref(RETURN_AFTER_SECONDS)

let ticker: ReturnType<typeof setInterval> | null = null
const stopTicker = () => {
  if (ticker) clearInterval(ticker)
  ticker = null
}
onBeforeUnmount(stopTicker)

const goHome = () => {
  stopTicker()
  // A full navigation rather than a router push: this page is the end of a
  // journey that began on another origin, and leaving it in the history stack
  // means Back lands on a spent Paystack reference.
  window.location.replace('/')
}

const startCountdown = () => {
  ticker = setInterval(() => {
    secondsLeft.value -= 1
    if (secondsLeft.value <= 0) goHome()
  }, 1000)
}

onMounted(async () => {
  const reference = String(route.query.reference ?? route.query.trxref ?? '')
  if (!reference) {
    phase.value = 'error'
    return
  }

  try {
    const result = await $fetch<{ ok: true; paid: boolean; emailed: boolean }>(
      '/api/payment/verify',
      { method: 'POST', body: { reference } },
    )
    phase.value = result.paid ? 'done' : 'unpaid'
  } catch {
    phase.value = 'error'
  }

  // Only the settled outcome leaves on its own. Somebody whose payment did not
  // go through, or whose confirmation failed, needs the page to stay put long
  // enough to read it and decide what to do.
  if (phase.value === 'done') startCountdown()
})

useHead({ title: 'Registration · DP Fitness' })
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-page px-6 py-16">
    <div class="w-full max-w-[440px] text-center">
      <p class="font-display text-[19px] font-black tracking-[-0.02em] text-ink">
        DP<span class="text-[var(--rose-fill)]">.</span>FITNESS
      </p>

      <!-- `role="status"` and `aria-live` so each phase is announced as it
           replaces the last, rather than changing silently under a screen
           reader that has already read the page. -->
      <div role="status" aria-live="polite" class="mt-10">
        <template v-if="phase === 'checking'">
          <p class="font-body text-[16px] text-soft">Confirming your payment…</p>
        </template>

        <template v-else-if="phase === 'done'">
          <h1 class="title-section text-ink">Your slot is reserved.</h1>
          <p class="mt-4 font-body text-[17px] leading-[1.7] text-soft">
            Check your email for your access code.
          </p>
        </template>

        <template v-else-if="phase === 'unpaid'">
          <h1 class="title-section text-ink">Payment wasn't completed.</h1>
          <p class="mt-4 font-body text-[17px] leading-[1.7] text-soft">
            Nothing has been charged. You can start again from the registration
            form.
          </p>
        </template>

        <template v-else>
          <h1 class="title-section text-ink">We couldn't confirm that.</h1>
          <p class="mt-4 font-body text-[17px] leading-[1.7] text-soft">
            If you were charged, your access code is still on its way — give it
            a few minutes, then get in touch.
          </p>
        </template>
      </div>

      <!-- The way out. Always a real link, so the page is never a dead end for
           somebody with the countdown paused or JavaScript disabled; the timer
           is a convenience on top of it, not the only exit. -->
      <div class="mt-9">
        <CtaButton href="/" variant="ink">Back to the site</CtaButton>
        <p
          v-if="phase === 'done'"
          class="mt-3.5 font-data text-[11px] tracking-[0.12em] text-ink-mute uppercase"
        >
          Returning in {{ secondsLeft }}s
        </p>
      </div>
    </div>
  </main>
</template>
