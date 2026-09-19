<script setup lang="ts">
// Sign in — for an account that already exists. Accounts are made on /access-code.
definePageMeta({ layout: 'default' })

import { DataSourceError } from '~/lib/datasource'
import { FIRST_SETUP_STEP } from '~/middleware/auth.global'

const router = useRouter()
const store = useAppStore()
const install = useInstallApp()

/**
 * The way back in, and only back in.
 *
 * Two doors, both to an account an access code already made: the email and
 * password chosen then, or Google. Google cannot make an account here — one it
 * has never seen is refused and sent to the code — so the only thing this
 * screen can end in is somebody who already paid.
 *
 * `reset` and `sent` are the forgotten password, and also the first password
 * for anybody whose account was made with the sign-in link this flow replaced:
 * those accounts have an address and no password, and a reset is how they get
 * one. The reset finishes on the provider's own page, in whichever browser
 * opens the email, and nothing needs to come back to the app afterwards but the
 * member — which is why it works from the iOS home-screen app where the sign-in
 * link did not.
 */
const mode = ref<'sign-in' | 'reset' | 'sent'>('sign-in')

const email = ref('')
const password = ref('')

/** Which action is in flight. One at a time, and the rest are disabled while it runs. */
const busy = ref<'' | 'password' | 'google' | 'reset'>('')

type Field = 'email' | 'password' | 'form'

const failure = ref<{ on: Field; message: string; code: DataSourceError['code'] } | null>(null)

const errorOn = (field: Field) => (failure.value?.on === field ? failure.value.message : '')

const fail = (cause: unknown, fallback: Field = 'form') => {
  if (!(cause instanceof DataSourceError)) {
    failure.value = { on: fallback, message: 'Something went wrong. Try again.', code: 'unknown' }
    return
  }
  const on: Field =
    cause.code === 'invalid-email'
      ? 'email'
      : cause.code === 'invalid-credentials'
        ? 'password'
        : fallback
  failure.value = { on, message: cause.message, code: cause.code }
}

/**
 * Whatever the store had to say before this screen could ask.
 *
 * A device signed out by a sign-in elsewhere is sent here with the reason, and
 * so is a Google redirect that came back refused — both finish on a load this
 * screen did not start, so all that is left of them is the sentence. Watched
 * rather than read once on mount, because the first of those arrives while the
 * app is open.
 */
watch(
  () => store.startupError.value,
  (next) => {
    if (!next) return
    failure.value = { on: 'form', message: next, code: 'unknown' }
    store.startupError.value = ''
  },
  { immediate: true },
)

/**
 * Where a freshly signed-in member actually belongs.
 *
 * Signing in on this screen does not navigate, so route middleware never gets a
 * say. Most members go to Home. An account with no membership — a sign-up cut
 * off before its code was redeemed — goes to the code, and one whose membership
 * could not be read goes there too, to retry.
 *
 * Resolves `true` when it navigated, so the caller can leave the screen frozen
 * on the way out rather than unfreezing it for a frame.
 */
const settle = async (): Promise<boolean> => {
  if (store.gate.value === 'needs-auth') return false
  if (store.atTheDoor.value) await router.replace('/access-code')
  else await router.replace(store.gate.value === 'needs-setup' ? FIRST_SETUP_STEP : '/home')
  return true
}

const signIn = async () => {
  if (busy.value) return
  busy.value = 'password'
  failure.value = null
  try {
    await store.signInWithPassword(email.value, password.value)
    if (await settle()) return
  } catch (cause) {
    fail(cause)
  }
  busy.value = ''
}

/**
 * The Google door.
 *
 * `null` back means the data source could not use a popup and handed the whole
 * page over to a redirect instead. This document is on its way out; the flow
 * resumes on the load that comes back, so there is deliberately nothing to do
 * here — including turning the spinner off, which would only flash.
 *
 * Cancelling is swallowed. Somebody who closed the Google window meant to close
 * it and does not need the screen to tell them it closed.
 */
const signInWithGoogle = async () => {
  if (busy.value) return
  busy.value = 'google'
  failure.value = null
  try {
    const user = await store.signInWithGoogle()
    if (!user) return
    if (await settle()) return
  } catch (cause) {
    if (!(cause instanceof DataSourceError && cause.code === 'popup-cancelled')) fail(cause)
  }
  busy.value = ''
}

const sendReset = async () => {
  if (busy.value) return
  busy.value = 'reset'
  failure.value = null
  try {
    await store.sendPasswordReset(email.value)
    mode.value = 'sent'
  } catch (cause) {
    fail(cause, 'email')
  } finally {
    busy.value = ''
  }
}

/** Between signing in and resetting. The address carries across; the password never does. */
const showMode = (next: 'sign-in' | 'reset') => {
  mode.value = next
  password.value = ''
  failure.value = null
}

const submit = () => {
  if (mode.value === 'reset') return sendReset()
  if (mode.value === 'sent') return showMode('sign-in')
  return signIn()
}

/** What the one button is about to do, in the member's words. */
const submitLabel = computed(() => {
  if (busy.value === 'password') return 'Signing in…'
  if (busy.value === 'reset') return 'Sending…'
  if (mode.value === 'reset') return 'Email me a reset link'
  if (mode.value === 'sent') return 'Back to sign in'
  return 'Sign in'
})

const heading = computed(() => {
  if (mode.value === 'reset') return 'Reset your password'
  if (mode.value === 'sent') return 'Check your inbox'
  return 'Sign in'
})

/** The one fact each mode needs that no control on it can say. */
const standfirst = computed(() => {
  if (mode.value === 'reset') {
    return 'We’ll email you a link to choose a new one. Never set a password? This sets your first.'
  }
  if (mode.value === 'sent') {
    // The link opens in Safari from the iOS home-screen app, and the member
    // should not wait for the app to notice something: it will not.
    return install.onIosHomeScreen.value
      ? 'The link opens in Safari. Choose your new password there, then come back to the app.'
      : 'Choose your new password from the link, then sign in with it here.'
  }
  return 'Welcome back. Use the email and password you signed up with.'
})

/** Google is a way to sign in, so it is offered only while signing in. */
const showGoogle = computed(() => store.googleSignIn && mode.value === 'sign-in')

// Clear the error as soon as the member edits either field.
watch([email, password], () => {
  if (failure.value) failure.value = null
})
</script>

<template>
  <div class="access flex-1 min-h-0 flex flex-col p-[40px_24px_24px] relative overflow-hidden lg:p-[44px_44px_36px]">
    <div class="access__glow absolute w-65 h-65 -top-20 -right-20 rounded-[50%] bg-[radial-gradient(circle,var(--primary-ring),transparent_70%)] filter-[blur(8px)] pointer-events-none" />

    <div class="access__intro relative mt-auto mb-6 flex flex-col gap-2 lg:mt-0 lg:mb-7">
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

    <!-- A real form, so Enter submits. The one button that means it is
         `type="submit"` and has no `@click` of its own, so a click and an Enter
         cannot both fire it. -->
    <form novalidate @submit.prevent="submit">
      <AppCard
        variant="raised"
        class="access__card flex flex-col gap-4 shadow-raised"
        :aria-busy="busy !== '' || undefined"
      >
        <!-- Frozen while a request is open, so what is on screen is what was
             sent. -->
        <div
          class="flex flex-col gap-4 transition-opacity duration-150"
          :class="busy !== '' && 'opacity-60'"
          :inert="busy !== ''"
        >
          <template v-if="mode !== 'sent'">
            <TextField
              v-model="email"
              label="Email address"
              type="email"
              inputmode="email"
              autocomplete="email"
              placeholder="you@example.com"
              :error="errorOn('email')"
            />
            <TextField
              v-if="mode === 'sign-in'"
              v-model="password"
              label="Password"
              type="password"
              autocomplete="current-password"
              placeholder="Your password"
              :error="errorOn('password')"
            />
          </template>
          <p v-else class="access__sent m-0 text-[14px] leading-normal text-(--violet-45)">
            If there’s an account for <strong>{{ email }}</strong>, a link to set a
            new password is on its way. It can take a minute — check spam too.
          </p>

          <!-- Under the password, where somebody who cannot remember it is
               already looking. -->
          <button
            v-if="mode === 'sign-in'"
            type="button"
            class="access__forgot -mt-1 self-end pt-1 pb-1 text-[13px] font-bold text-primary"
            @click="showMode('reset')"
          >
            Forgot password?
          </button>
        </div>

        <!-- Outside the frozen block, so it is read out when it arrives. -->
        <p
          v-if="errorOn('form')"
          role="alert"
          class="access__error m-0 text-xs font-semibold text-primary"
        >
          {{ errorOn('form') }}
        </p>

        <!-- A Google account with no account behind it: the fix is the code,
             so the way there is offered, not only named. -->
        <NuxtLink
          v-if="failure?.code === 'no-account'"
          to="/access-code"
          class="access__to-code -mt-1 self-start text-[13px] font-bold text-primary"
        >
          Enter your access code
        </NuxtLink>

        <AppButton type="submit" :disabled="busy !== ''">
          {{ submitLabel }}
        </AppButton>

        <AppButton
          v-if="mode === 'reset'"
          variant="ghost"
          :disabled="busy !== ''"
          @click="showMode('sign-in')"
        >
          Back to sign in
        </AppButton>

        <template v-if="showGoogle">
          <div class="access__or flex items-center gap-3" aria-hidden="true">
            <span class="h-px flex-1 bg-hairline" />
            <span class="text-[12px] font-semibold text-muted">or</span>
            <span class="h-px flex-1 bg-hairline" />
          </div>

          <AppButton
            variant="secondary"
            :disabled="busy !== ''"
            @click="signInWithGoogle"
          >
            <!-- Buttons carry no icons, but this one is Google's mark rather
                 than decoration: it is how people recognise the door. -->
            <span class="inline-flex items-center gap-2">
              <AppIcon name="google" :size="18" />
              {{ busy === 'google' ? 'Opening Google…' : 'Continue with Google' }}
            </span>
          </AppButton>
        </template>
      </AppCard>
    </form>

    <div class="access__foot mt-auto flex flex-col gap-2.5 pt-5 text-center">
      <p class="access__hint m-0 text-[13px] text-muted">
        New here?
        <NuxtLink to="/access-code" class="access__link text-primary font-bold">
          Enter your access code
        </NuxtLink>
      </p>

      <!-- `self-center`: an `inline-flex` child of a flex column is blockified,
           and would otherwise stretch full width and set itself hard left. -->
      <PoweredBy :size="12" class="access__credit mt-1 self-center text-(--violet-45)" />
    </div>
  </div>
</template>
