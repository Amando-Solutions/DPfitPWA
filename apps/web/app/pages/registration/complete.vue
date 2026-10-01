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
type Phase = 'checking' | 'done' | 'reserved' | 'waiting' | 'unknown'
const phase = ref<Phase>('checking')
const emailed = ref(true)
/** When a pre-order's codes go out, in the cohort's zone. */
const codesOn = ref<string | null>(null)

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
        state: 'paid' | 'reserved' | 'pending' | 'unknown'
        emailed: boolean
        codesOn?: string | null
      }>('/api/payment/status')

      if (result.state === 'paid' || result.state === 'reserved') {
        emailed.value = result.emailed
        codesOn.value = result.codesOn ?? null
        phase.value = result.state === 'paid' ? 'done' : 'reserved'
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
  <main class="flex min-h-dvh items-center justify-center bg-lp-paper px-4 py-10 sm:px-6 sm:py-16 font-landing text-lp-ink antialiased">
    <div class="w-full max-w-115 rounded-[28px] border border-lp-edge bg-white p-[clamp(24px,5vw,44px)] text-center shadow-[0_30px_60px_-40px_rgba(29,22,40,0.25)]">
      <a href="/" class="inline-block text-lp-ink">
        <BrandLogo :size="48" label="DP Fitness" />
      </a>

      <!-- `role="status"` and `aria-live` so each phase is announced as it
           replaces the last, rather than changing silently under a screen
           reader that has already read the page. -->
      <div role="status" aria-live="polite" class="mt-8 sm:mt-9">
        <template v-if="phase === 'checking'">
          <p class="m-0 text-[16px] text-lp-soft">Confirming your payment…</p>
        </template>

        <template v-else-if="phase === 'done'">
          <span class="lp-eyebrow">you're in</span>
          <h1 class="mt-3 mb-0 text-[34px] leading-[1.05] font-medium tracking-[-0.03em] text-balance sm:text-[40px]">
            your slot is <span class="serif-accent">reserved.</span>
          </h1>
          <p v-if="emailed" class="mt-4 mb-0 text-[16px] leading-[1.7] text-lp-soft">
            Check your email for your access code.
          </p>
          <!-- Paid, code minted, email refused. Saying "check your inbox" here
               would send somebody to look for a message that is not coming. -->
          <p v-else class="mt-4 mb-0 text-[16px] leading-[1.7] text-lp-soft">
            Your access code is issued, but we couldn't email it just yet. Get in
            touch and we'll send it straight over.
          </p>
        </template>

        <!-- A pre-order sale. The code exists but is held until the window
             closes, so the inbox has a confirmation in it, not a code. -->
        <template v-else-if="phase === 'reserved'">
          <span class="lp-eyebrow">you're in</span>
          <h1 class="mt-3 mb-0 text-[34px] leading-[1.05] font-medium tracking-[-0.03em] text-balance sm:text-[40px]">
            your slot is <span class="serif-accent">reserved.</span>
          </h1>
          <p class="mt-4 mb-0 text-[16px] leading-[1.7] text-lp-soft">
            <template v-if="emailed">We've emailed you a confirmation. </template>
            Your access code follows by email when enrolment closes<template v-if="codesOn">
              on {{ codesOn }}</template>.
          </p>
        </template>

        <!-- Deliberately not "payment failed". The wait running out means the
             sale notification has not reached us, which is not the same as no
             payment — and this page is read by people who have just been
             charged. -->
        <template v-else-if="phase === 'waiting'">
          <h1 class="m-0 text-[34px] leading-[1.05] font-medium tracking-[-0.03em] text-balance sm:text-[40px]">
            still <span class="serif-accent">confirming.</span>
          </h1>
          <p class="mt-4 mb-0 text-[16px] leading-[1.7] text-lp-soft">
            If your payment went through, your access code is on its way by email
            — it can take a few minutes. Nothing more to do here; get in touch if
            it hasn't arrived.
          </p>
        </template>

        <template v-else>
          <h1 class="m-0 text-[34px] leading-[1.05] font-medium tracking-[-0.03em] text-balance sm:text-[40px]">
            nothing to <span class="serif-accent">confirm here.</span>
          </h1>
          <p class="mt-4 mb-0 text-[16px] leading-[1.7] text-lp-soft">
            We can't match this to a registration. If you were charged, your
            access code is still on its way — give it a few minutes, then get in
            touch.
          </p>
        </template>
      </div>

      <!-- The way out. Always a real link, so the page is never a dead end for
           somebody with the countdown paused or JavaScript disabled; the timer
           is a convenience on top of it, not the only exit. -->
      <div class="mt-8 flex flex-col items-center sm:mt-9">
        <CtaButton href="/">back to the site ↗</CtaButton>
        <p
          v-if="phase === 'done' || phase === 'reserved'"
          class="mt-3.5 mb-0 text-[12px] text-lp-soft"
        >
          Returning in {{ secondsLeft }}s
        </p>
      </div>

      <PoweredBy class="mt-10 text-lp-soft" />
    </div>
  </main>
</template>
