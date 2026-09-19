<script setup lang="ts">
/**
 * Where Selar sends the buyer back to.
 *
 * It confirms nothing itself. Under Paystack this page held the reference and
 * could ask whether it had been paid, so it either knew or it did not; Selar
 * redirects to a fixed URL with nothing on it, and the sale notification
 * arrives on a separate connection at its own pace. So the page waits: it polls
 * our own database until a code exists, and it is careful never to tell anyone
 * they have not paid — it cannot know that, and saying it to somebody who has
 * just been charged would be the worst thing on this screen.
 *
 * The registration is identified by the cookie `POST /api/register` set, which
 * is also why this page does nothing at all if somebody simply navigates to it.
 *
 * Not prerendered: it exists only for the moment after a payment. See the
 * `routeRules` entry in `nuxt.config.ts`.
 */
type Phase = 'checking' | 'done' | 'waiting' | 'unknown'
const phase = ref<Phase>('checking')
const emailed = ref(true)

/**
 * How long to wait before saying so.
 *
 * A notification usually beats the redirect or lands a second or two behind it,
 * so most people never see past the first poll. A minute is long enough to
 * cover a slow one and short enough that nobody is left watching a spinner
 * wondering whether the tab has hung.
 */
const POLL_EVERY_MS = 2500
const GIVE_UP_AFTER_MS = 60_000

/** How long the confirmation sits before it takes them back. */
const RETURN_AFTER_SECONDS = 8
const secondsLeft = ref(RETURN_AFTER_SECONDS)

let ticker: ReturnType<typeof setInterval> | null = null
let stopped = false

const stopTicker = () => {
  if (ticker) clearInterval(ticker)
  ticker = null
}
onBeforeUnmount(() => {
  stopped = true
  stopTicker()
})

const goHome = () => {
  stopTicker()
  // A full navigation rather than a router push: this page is the end of a
  // journey that began on another origin, and leaving it in the history stack
  // means Back lands on a spent checkout.
  window.location.replace('/')
}

const startCountdown = () => {
  ticker = setInterval(() => {
    secondsLeft.value -= 1
    if (secondsLeft.value <= 0) goHome()
  }, 1000)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

onMounted(async () => {
  const until = Date.now() + GIVE_UP_AFTER_MS

  while (!stopped) {
    try {
      const result = await $fetch<{
        ok: true
        state: 'paid' | 'pending' | 'unknown'
        emailed: boolean
      }>('/api/payment/status')

      if (result.state === 'paid') {
        emailed.value = result.emailed
        phase.value = 'done'
        startCountdown()
        return
      }

      // Nothing to wait for: no cookie, or a reference this deployment never
      // wrote. Polling will not turn that into a registration.
      if (result.state === 'unknown') {
        phase.value = 'unknown'
        return
      }
    } catch {
      // A failed poll is not an answer. Keep trying until the clock runs out —
      // the alternative is telling somebody who has paid that something went
      // wrong because one request out of twenty-four did.
    }

    if (Date.now() >= until) {
      phase.value = 'waiting'
      return
    }
    await sleep(POLL_EVERY_MS)
  }
})

useHead({ title: 'Registration · DP Fitness' })
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-page px-6 py-16">
    <div class="w-full max-w-110 text-center">
      <BrandLogo :size="52" class="mx-auto text-ink" label="DP Fitness" />

      <!-- `role="status"` and `aria-live` so each phase is announced as it
           replaces the last, rather than changing silently under a screen
           reader that has already read the page. -->
      <div role="status" aria-live="polite" class="mt-10">
        <template v-if="phase === 'checking'">
          <p class="font-body text-[16px] text-soft">Confirming your payment…</p>
        </template>

        <template v-else-if="phase === 'done'">
          <h1 class="title-section text-ink">Your slot is reserved.</h1>
          <p v-if="emailed" class="mt-4 font-body text-[17px] leading-[1.7] text-soft">
            Check your email for your access code.
          </p>
          <!-- Paid, code minted, email refused. Saying "check your inbox" here
               would send somebody to look for a message that is not coming. -->
          <p v-else class="mt-4 font-body text-[17px] leading-[1.7] text-soft">
            Your access code is issued, but we couldn't email it just yet. Get in
            touch and we'll send it straight over.
          </p>
        </template>

        <!-- Deliberately not "payment failed". The wait running out means the
             sale notification has not reached us, which is not the same as no
             payment — and this page is read by people who have just been
             charged. -->
        <template v-else-if="phase === 'waiting'">
          <h1 class="title-section text-ink">Still confirming.</h1>
          <p class="mt-4 font-body text-[17px] leading-[1.7] text-soft">
            If your payment went through, your access code is on its way by email
            — it can take a few minutes. Nothing more to do here; get in touch if
            it hasn't arrived.
          </p>
        </template>

        <template v-else>
          <h1 class="title-section text-ink">Nothing to confirm here.</h1>
          <p class="mt-4 font-body text-[17px] leading-[1.7] text-soft">
            We can't match this to a registration. If you were charged, your
            access code is still on its way — give it a few minutes, then get in
            touch.
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

      <!-- The credit sits below the way out rather than above it, because this
           page has exactly one thing it wants the reader to do next and
           nothing should come between them and it. `inline-flex` inside the
           centred column, so it centres without a wrapper. -->
      <PoweredBy class="mt-12 text-ink-mute" />
    </div>
  </main>
</template>
