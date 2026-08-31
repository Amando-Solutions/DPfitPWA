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
 */
const phase = computed<'email' | 'sent' | 'code'>(() => {
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
const busy = ref<'' | 'link' | 'google' | 'code'>('')

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
  if (store.gate.value === 'needs-code') return
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
    await router.push(FIRST_SETUP_STEP)
  } catch (cause) {
    error.value = message(cause)
  } finally {
    busy.value = ''
  }
}

const submit = () => {
  if (confirmingEmail.value) return confirmEmail()
  return phase.value === 'code' ? redeem() : sendLink()
}

/** What the one button is about to do, in the member's words. */
const submitLabel = computed(() => {
  if (busy.value === 'link' || busy.value === 'code') return 'Checking…'
  if (phase.value === 'code' || store.instantSignIn) return 'Continue'
  return 'Email me a link'
})

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
  if (phase.value === 'sent') return 'The link signs you in — no password to remember.'
  if (phase.value === 'code') return 'It was sent to you once your payment was confirmed.'
  return 'Use the email you paid with.'
})

/** Google has nothing to offer once the session exists, or mid-link-confirm. */
const showGoogle = computed(
  () => store.googleSignIn && phase.value === 'email' && !confirmingEmail.value,
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
      <!-- Laid out on one line rather than stacked. The identity is worth a
           mark on the first screen a member ever sees; it is not worth two
           lines and a third announcing which cohort they are in. -->
      <BrandWordmark size="md" />

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
      <AppCard variant="raised" class="access__card flex flex-col gap-4 shadow-raised">
        <!-- First, because it is the shortest way through. One tap settles the
             address, and it arrives carrying a name and a picture the setup form
             would otherwise have to ask for. The field below is for anyone whose
             purchase email is not a Google account. -->
        <template v-if="showGoogle">
          <AppButton
            variant="secondary"
            icon="google"
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
        <p
          v-else
          class="access__sent m-0 text-[14px] leading-normal text-(--violet-45)"
        >
          We’ve sent a link to <strong>{{ email }}</strong>. Open it on this
          device and you’ll come straight back here.
        </p>

        <AppButton
          v-if="phase !== 'sent' || confirmingEmail"
          type="submit"
          icon-right="arrowRight"
          :disabled="busy !== ''"
        >
          {{ submitLabel }}
        </AppButton>
        <AppButton v-else variant="ghost" :disabled="busy !== ''" @click="linkSent = false">
          Use a different email
        </AppButton>
      </AppCard>
    </form>

    <!--
      Always rendered, usually empty. `mt-auto` here is what balances the same
      on `access__intro`: between them the card sits in the middle of the
      screen instead of against the bottom edge, and an empty div holds that
      shape without printing anything.

      Both lines below used to print on every step. "Can't find your code?" was
      answering a question nobody had yet on the screen that asks for an email
      address, and the demo code shipped to real members on a real deploy —
      each one a line of text the member had to read past to find out it was
      not for them.
    -->
    <div class="access__foot mt-auto flex flex-col gap-2.5 pt-5 text-center">
      <p v-if="phase === 'code'" class="access__hint muted m-0 text-[13px]">
        Can’t find your code? Check spam or
        <NuxtLink to="/access-code" class="access__link text-rose font-bold">contact support</NuxtLink>.
      </p>
      <p
        v-if="store.instantSignIn"
        class="access__dev m-0 font-data text-[11px] text-muted"
      >
        Demo code: <strong>{{ accessCodes[0] }}</strong>
      </p>
    </div>
  </div>
</template>
