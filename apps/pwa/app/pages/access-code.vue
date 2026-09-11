<script setup lang="ts">
// 04 · Access Code (idle) + 05 · Access Code Error
definePageMeta({ layout: 'default' })

import { accessCodes } from '~/data/program'
import { DataSourceError } from '~/lib/datasource'
import { FIRST_SETUP_STEP } from '~/middleware/auth.global'

const route = useRoute()
const router = useRouter()
const store = useAppStore()

/**
 * Where "contact support" goes. The address is the one on the purchase
 * receipt, which differs per deploy, so it comes from
 * NUXT_PUBLIC_SUPPORT_EMAIL rather than being written into the page. A member
 * who cannot find their code has no other way through this screen, so the link
 * has to open a composer — it used to point back at this route, which answered
 * nothing.
 */
const supportEmail = useRuntimeConfig().public.supportEmail as string
const supportHref = `mailto:${supportEmail}?subject=${encodeURIComponent('DP Fitness — access code help')}`

/**
 * Getting in takes two separate things, and this screen is both of them.
 *
 *   1. Proving the inbox is yours — Google, or a sign-in link. No password.
 *   2. Proving you paid — the access code, which binds you to a cohort.
 *
 * They are genuinely separate: somebody can hold a valid Firebase session and
 * still not be a member of anything, which is exactly the state between step
 * one and step two. So the screen shows whichever half is still outstanding
 * rather than assuming a member arrives with both.
 *
 * Step one has two doors and they are not equally good. Google settles inside
 * one gesture and hands over a name and a picture on the way through, so it
 * leads; the link is the fallback for anyone whose purchase email is not a
 * Google account. Both end in the same place, and nothing after this screen
 * asks which was used.
 *
 * On device there is no inbox to prove anything against, so the link collapses
 * into submitting the address and the `sent` phase never appears. The screen
 * reads `store.instantSignIn` to know that in advance — a button offering to
 * email a link that will not be emailed is worse than no button.
 *
 * `blocked` is the fourth answer and the one that was missing. A session with
 * an unreadable member document is not a session with no membership, and it
 * used to render as the code prompt: a member of eight weeks asked for a code
 * they redeemed on day one, told it had already been used when they found it,
 * and shown no sign-in control to escape with, because they were signed in the
 * whole time. It asks them to try the read again instead.
 */
const phase = computed<'email' | 'sent' | 'code' | 'blocked'>(() => {
  if (store.gate.value === 'unknown') return 'blocked'
  if (store.authUser.value) return 'code'
  return linkSent.value ? 'sent' : 'email'
})

const email = ref('')
const code = ref('')
const error = ref('')
const linkSent = ref(false)

/**
 * Which action is in flight, so the labels can say what is happening.
 *
 * One ref rather than a flag per button: only one of these can be running at a
 * time, and the others have to be disabled while it is.
 */
const busy = ref<'' | 'link' | 'google' | 'code' | 'retry' | 'switch'>('')

/**
 * Opening the link on a *different* device from the one that asked for it.
 *
 * Firebase parks the pending address in local storage when the link is
 * requested, so the same browser can finish silently. Another device has no
 * such record and the address has to be confirmed, which is the one genuinely
 * awkward corner of email-link auth and the reason this flag exists.
 */
const confirmingEmail = ref(false)

const message = (cause: unknown) =>
  cause instanceof DataSourceError ? cause.message : 'Something went wrong. Try again.'

/**
 * Where a freshly signed-in member actually belongs.
 *
 * Signing in on this screen does not navigate, so route middleware never gets
 * a say — and a returning member who signs in here has a member document
 * already and must not be asked for an access code they redeemed weeks ago and
 * no longer have. Re-running the gate by hand is what stops this screen
 * holding on to somebody it is already finished with.
 */
const settle = async () => {
  if (store.atTheDoor.value) return
  await router.replace(store.gate.value === 'needs-setup' ? FIRST_SETUP_STEP : '/home')
}

/**
 * Finish sign-in if this page was opened from a link.
 *
 * Runs on mount rather than in middleware: the link lands on this route
 * carrying its credentials in the query string, and they have to be consumed
 * before anything else can decide where the member belongs.
 *
 * A Google sign-in that had to leave the page is already finished by the time
 * anything here runs — the store consumes it during hydration, before route
 * middleware — so all that is left of it is whatever went wrong, which is
 * collected first.
 */
onMounted(async () => {
  if (store.startupError.value) {
    error.value = store.startupError.value
    store.startupError.value = ''
  }

  const url = window.location.href
  if (!(await store.isSignInLink(url))) return

  busy.value = 'link'
  try {
    await store.completeSignInLink(url)
    // The credentials are single-use and should not survive in history.
    await router.replace({ path: route.path })
    await settle()
  } catch (cause) {
    if (cause instanceof DataSourceError && cause.code === 'needs-email') {
      confirmingEmail.value = true
      error.value = ''
    } else {
      error.value = message(cause)
    }
  } finally {
    busy.value = ''
  }
})

const sendLink = async () => {
  if (busy.value) return
  busy.value = 'link'
  error.value = ''
  try {
    // A user back means it signed in outright: `phase` is already `code`, and
    // there is nothing to wait for. Otherwise a link is on its way.
    linkSent.value = !(await store.sendSignInLink(email.value))
    if (!linkSent.value) await settle()
  } catch (cause) {
    error.value = message(cause)
  } finally {
    busy.value = ''
  }
}

/**
 * The Google door.
 *
 * `null` back means the data source could not use a popup and handed the whole
 * page over to a redirect instead. This document is on its way out; the flow
 * resumes on the load that comes back, so there is deliberately nothing to do
 * here — including turning the spinner off, which would only flash.
 *
 * Cancelling is swallowed. Somebody who closed the Google window meant to
 * close it and does not need the screen to tell them it closed.
 */
const signInWithGoogle = async () => {
  if (busy.value) return
  busy.value = 'google'
  error.value = ''
  try {
    const user = await store.signInWithGoogle()
    if (!user) return
    await settle()
  } catch (cause) {
    if (!(cause instanceof DataSourceError && cause.code === 'popup-cancelled')) {
      error.value = message(cause)
    }
  } finally {
    busy.value = ''
  }
}

/** The other-device path: they retype the address, then the link completes. */
const confirmEmail = async () => {
  if (busy.value) return
  busy.value = 'link'
  error.value = ''
  try {
    await store.completeSignInLink(window.location.href, email.value)
    confirmingEmail.value = false
    await router.replace({ path: route.path })
    await settle()
  } catch (cause) {
    error.value = message(cause)
  } finally {
    busy.value = ''
  }
}

const redeem = async () => {
  if (busy.value) return
  busy.value = 'code'
  error.value = ''
  try {
    await store.redeemAccessCode(code.value)
    // Through the gate rather than straight at the setup step. Redemption
    // reloads the account, and that read can fail on the way back — in which
    // case pushing at a route the member is no longer cleared for only has
    // middleware bounce them here again. `settle` also replaces rather than
    // pushes, so Back does not return to a code field that is now spent.
    await settle()
  } catch (cause) {
    error.value = message(cause)
  } finally {
    busy.value = ''
  }
}

/**
 * Try the account read again.
 *
 * The only action offered in `blocked`, and the only one that can help: the
 * session is fine, the document is not — an ad blocker on
 * `firestore.googleapis.com`, a dead train tunnel, a rule that refused. All of
 * those are fixed elsewhere and then retried, which is a button rather than
 * "close the app and open it again", the workaround this state used to need.
 *
 * `hydrate` catches everything it can hit, so the failure comes back through
 * `startupError` instead of a rejection.
 */
const retry = async () => {
  if (busy.value) return
  busy.value = 'retry'
  error.value = ''
  try {
    await store.hydrate(true)
    if (store.startupError.value) {
      error.value = store.startupError.value
      store.startupError.value = ''
    }
    await settle()
  } finally {
    busy.value = ''
  }
}

/**
 * Leave the session and go back to the sign-in half.
 *
 * The escape hatch, and the reason this screen was a trap without it. Every
 * state below `ready` that involves being signed in — the code prompt, an
 * unreadable account — used to render with no control that ends the session,
 * on the one screen a member in that state is allowed to reach. Signing in as
 * somebody else was impossible, because there was nothing on the page offering
 * to sign in: they already were. That matters most when the session is the
 * problem, which is the ordinary case here — a code issued to one address and
 * a browser signed in with another goes round for ever otherwise.
 */
const useAnotherAccount = async () => {
  if (busy.value) return
  busy.value = 'switch'
  error.value = ''
  try {
    await store.signOut()
    code.value = ''
    email.value = ''
    linkSent.value = false
    confirmingEmail.value = false
  } catch (cause) {
    error.value = message(cause)
  } finally {
    busy.value = ''
  }
}

const submit = () => {
  if (confirmingEmail.value) return confirmEmail()
  if (phase.value === 'blocked') return retry()
  return phase.value === 'code' ? redeem() : sendLink()
}

/** What the one button is about to do, in the member's words. */
const submitLabel = computed(() => {
  if (busy.value === 'retry') return 'Trying again…'
  if (busy.value === 'link' || busy.value === 'code') return 'Checking…'
  if (phase.value === 'blocked') return 'Try again'
  if (phase.value === 'code' || store.instantSignIn) return 'Continue'
  return 'Email me a link'
})

/**
 * The address the outstanding step is being asked of.
 *
 * Printed on both signed-in steps, because the commonest way to be stuck on
 * either is to be signed in as the wrong person and have no way to see it. A
 * code issued to one address, typed into a browser holding a session for
 * another, fails with "issued to a different email address" and no way to find
 * out which — the screen never said whose session it was.
 */
const signedInAs = computed(() => store.authUser.value?.email ?? '')

/**
 * The step, named.
 *
 * There used to be a fixed marketing headline here — "Let's get your glow
 * back." over an eyebrow announcing the cohort — and between them they were
 * the largest thing on the screen. Neither told a member what to do, and both
 * were addressed to somebody deciding whether to buy, which is not who is
 * looking at this page: everybody here has already paid and is trying to get
 * in. The heading is now the question the screen is actually asking, so the
 * page says where you are in a flow that has four possible places to be.
 */
const heading = computed(() => {
  if (confirmingEmail.value) return 'Confirm your email'
  if (phase.value === 'blocked') return 'Couldn’t load your account'
  if (phase.value === 'sent') return 'Check your inbox'
  if (phase.value === 'code') return 'Enter your access code'
  return 'Sign in'
})

/**
 * The one line under it, carrying only what no control on the screen says.
 *
 * Paired with `heading` rather than written into the template so the two can
 * never drift into repeating each other — the heading says *what step*, this
 * says the single fact that step needs and the buttons cannot state.
 */
const standfirst = computed(() => {
  if (confirmingEmail.value) {
    return 'This link was opened on a different device from the one that asked for it.'
  }
  if (phase.value === 'blocked') {
    // Deliberately does not say "you are not a member": nothing here knows
    // that. The read failed, and the two look identical from this side.
    return 'You’re signed in, but we couldn’t reach your account just now.'
  }
  if (phase.value === 'sent') return 'The link signs you in — no password to remember.'
  if (phase.value === 'code') return 'It was sent to you once your payment was confirmed.'
  return 'Use the email you paid with.'
})

/** Google has nothing to offer once the session exists, or mid-link-confirm. */
const showGoogle = computed(
  () => store.googleSignIn && phase.value === 'email' && !confirmingEmail.value,
)

/** The signed-in steps, which are the ones that need a way back out. */
const showSwitchAccount = computed(
  () => (phase.value === 'code' || phase.value === 'blocked') && !confirmingEmail.value,
)

// Clear the error as soon as the member edits either field.
watch([code, email], () => {
  if (error.value) error.value = ''
})
</script>

<template>
  <div class="access flex-1 min-h-0 flex flex-col p-[40px_24px_24px] relative overflow-hidden lg:p-[44px_44px_36px]">
    <div class="access__glow absolute w-65 h-65 -top-20 -right-20 rounded-[50%] bg-[radial-gradient(circle,var(--rose-ring),transparent_70%)] filter-[blur(8px)] pointer-events-none" />

    <div class="access__intro relative mt-auto mb-6 flex flex-col gap-2 lg:mt-0 lg:mb-7">
      <!-- The brand's own lockup, at the one screen that earns it: this is the
           first thing a member ever sees. It reads as one block, not the two
           lines the type version would have cost, because the wordmark sits
           under the mark rather than beside it — so it still does not need a
           third line announcing which cohort they are in. -->
      <BrandLogo :size="56" class="text-ink" label="DP Fitness" />

      <h1
        class="access__title m-[10px_0_0] font-display font-black text-[27px] leading-[1.12] tracking-[-0.4px] text-ink lg:text-[30px]"
      >
        {{ heading }}
      </h1>
      <p class="access__sub m-0 text-(--violet-45) text-[14px] leading-[1.45] lg:text-[15px]">
        {{ standfirst }}
      </p>
    </div>

    <!--
      A real form, so Enter submits.

      Worth the element rather than a `@keyup.enter` on the field: implicit
      submission is a browser behaviour that needs a form and a submit button
      to exist, and it is also what makes a phone keyboard offer "Go" instead
      of a newline. The one button that means it is marked `type="submit"` and
      has no `@click` of its own — the form's handler is the single path in, so
      a click and an Enter cannot both fire it.
    -->
    <form novalidate @submit.prevent="submit">
      <AppCard
        variant="raised"
        class="access__card flex flex-col gap-4 shadow-raised"
        :aria-busy="busy !== '' || undefined"
      >
        <!-- First, because it is the shortest way through. One tap settles the
             address, and it arrives carrying a name and a picture the setup form
             would otherwise have to ask for. The field below is for anyone whose
             purchase email is not a Google account. -->
        <template v-if="showGoogle">
          <AppButton
            variant="secondary"
            :disabled="busy !== ''"
            @click="signInWithGoogle"
          >
            {{ busy === 'google' ? 'Opening Google…' : 'Continue with Google' }}
          </AppButton>

          <div class="access__or flex items-center gap-3" aria-hidden="true">
            <span class="h-px flex-1 bg-hairline" />
            <span class="text-[12px] font-semibold uppercase tracking-[1px] text-muted">or</span>
            <span class="h-px flex-1 bg-hairline" />
          </div>
        </template>

        <!--
          The field is frozen for as long as the request it started is open.

          Every button on this card already goes dead while `busy` is set; the
          box they read from did not, so an address or a code could still be
          retyped after the value had been taken and sent. Whichever answer
          came back then belonged to a string no longer on screen — and on the
          code step, a redemption is one-shot, so the member would be looking
          at a code that had just been spent on something they could no longer
          see.

          A wrapper rather than a `disabled` prop on TextField: only one arm of
          this chain renders, so it is still a single item in the card's column
          and the layout is unchanged.
        -->
        <div
          class="transition-opacity duration-150"
          :class="busy !== '' && 'opacity-60'"
          :inert="busy !== ''"
        >
          <TextField
            v-if="phase === 'code'"
            v-model="code"
            label="Access code"
            placeholder="ENTER YOUR CODE"
            mono
            :error="error"
          />
          <TextField
            v-else-if="phase === 'email' || confirmingEmail"
            v-model="email"
            label="Email address"
            type="email"
            inputmode="email"
            placeholder="you@example.com"
            :error="error"
          />
          <!-- `blocked` has nothing to type. The read failed, so the only fact
               worth printing is why, and the only useful control is the retry
               below. Carried here rather than on a field's `:error` because
               there is no field on this step. -->
          <p
            v-else-if="phase === 'blocked'"
            class="access__blocked m-0 text-[14px] leading-normal text-(--violet-45)"
          >
            {{ error || 'Check your connection, then try again. An ad blocker or privacy extension can block it too.' }}
          </p>
          <p
            v-else
            class="access__sent m-0 text-[14px] leading-normal text-(--violet-45)"
          >
            We’ve sent a link to <strong>{{ email }}</strong>. Open it on this
            device and you’ll come straight back here.
          </p>
        </div>

        <AppButton
          v-if="phase !== 'sent' || confirmingEmail"
          type="submit"
          :disabled="busy !== ''"
        >
          {{ submitLabel }}
        </AppButton>
        <AppButton v-else variant="ghost" :disabled="busy !== ''" @click="linkSent = false">
          Use a different email
        </AppButton>

        <!--
          The way out, on the two steps that have a session behind them.

          It names the address first. Both steps fail in the same silent way —
          a code issued to one inbox typed into a browser signed in as another
          — and the screen used to keep the one fact that explains it to
          itself, while offering nothing that could end the session either.
        -->
        <div
          v-if="showSwitchAccount"
          class="access__whoami flex flex-col items-center gap-1 pt-0.5 text-center"
        >
          <p v-if="signedInAs" class="m-0 text-[13px] leading-normal text-muted">
            Signed in as <strong class="text-ink font-semibold">{{ signedInAs }}</strong>
          </p>
          <button
            type="button"
            class="access__switch pt-1 pb-1 text-[13px] font-bold text-rose disabled:opacity-50"
            :disabled="busy !== ''"
            @click="useAnotherAccount"
          >
            {{ busy === 'switch' ? 'Signing out…' : 'Not you? Use a different account' }}
          </button>
        </div>
      </AppCard>
    </form>

    <!--
      `mt-auto` here is what balances the same on `access__intro`: between them
      the card sits in the middle of the screen instead of against the bottom
      edge.

      The two hints are conditional and usually absent — "Can't find your code?"
      was answering a question nobody had yet on the screen that asks for an
      email address, and the demo code shipped to real members on a real
      deploy. The credit under them is the one thing here that always prints,
      which is also why it is last: it is the floor of the screen, not a line
      the member is being asked to read.
    -->
    <div class="access__foot mt-auto flex flex-col gap-2.5 pt-5 text-center">
      <p v-if="phase === 'code'" class="access__hint muted m-0 text-[13px]">
        Can’t find your code? Check spam<template v-if="supportEmail"> or
        <a :href="supportHref" class="access__link text-rose font-bold">contact support</a></template>.
      </p>
      <p
        v-if="store.instantSignIn"
        class="access__dev m-0 font-data text-[11px] text-muted"
      >
        Demo code: <strong>{{ accessCodes[0] }}</strong>
      </p>

      <!-- The first screen a member ever opens, so the credit is set quieter
           here than anywhere else: this moment belongs to the brand above it. -->
      <!-- `self-center` rather than `items-center` on the column: an
           `inline-flex` child of a flex container is blockified, so without it
           the credit stretches the full width and sets itself hard left. Kept
           on the child so the two hints above go on filling the column. -->
      <PoweredBy :size="12" class="access__credit mt-1 self-center text-(--violet-45)" />
    </div>
  </div>
</template>
