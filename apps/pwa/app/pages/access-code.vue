<script setup lang="ts">
// 04 · Access Code (idle) + 05 · Access Code Error, then Create Account
definePageMeta({ layout: 'default' })

import { DataSourceError, MIN_PASSWORD_LENGTH } from '~/lib/datasource'
import { storage } from '~/lib/storage'
import { FIRST_SETUP_STEP } from '~/middleware/auth.global'

const router = useRouter()
const store = useAppStore()
const install = useInstallApp()

/**
 * Where "contact support" goes. The address is the one on the purchase
 * receipt, which differs per deploy, so it comes from
 * NUXT_PUBLIC_SUPPORT_EMAIL rather than being written into the page. A member
 * who cannot find their code has no other way through this screen, so the link
 * has to open a composer — it used to point back at this route, which answered
 * nothing.
 */
const config = useRuntimeConfig().public
const supportEmail = config.supportEmail as string
const supportHref = `mailto:${supportEmail}?subject=${encodeURIComponent('DP Fitness — access code help')}`

/**
 * Where somebody with no code at all is sent.
 *
 * Every other way out of this screen assumes a purchase has already happened:
 * the code was emailed, or it is lost, or the wrong account is signed in. The
 * one case the screen could not answer was the person who has not bought yet —
 * and there is nothing in the app that sells, so the only honest answer is the
 * site that does. `#register` rather than the bare origin, because the landing
 * page is long and the form is most of the way down it; a member who has to
 * scroll for it is being asked to find the thing they came for.
 *
 * Skipped when the origin already carries a hash, so a deploy that points this
 * at some other part of the site keeps the target it chose.
 */
const webAppUrl = (config.webAppUrl as string) || ''
const buyHref = webAppUrl.includes('#') ? webAppUrl : `${webAppUrl.replace(/\/+$/, '')}#register`

/**
 * The only way an account gets made.
 *
 * The code comes first, before there is anybody to sign in: it is what was
 * paid for, so it is checked — real, unused, in date — before the member is
 * asked for anything else. Then an email and a password make the account, and
 * the email has to be the one the code was sent to. The code is redeemed on the
 * new account in the same tap, and setup follows.
 *
 * Nothing in that leaves the app, which is the point of the order. The email
 * link this replaced proved the address by sending the member away to their
 * inbox, and on iOS the link came back to Safari rather than the home-screen app
 * that asked. The code already came through that inbox, so holding it and
 * naming the address it went to is the proof now.
 *
 * Two steps are for somebody signed in already, which a sign-up can leave
 * behind:
 *
 *   - `redeem`: an account with no membership. The sign-up made the account and
 *     was cut off before the code was spent, or the account predates this flow.
 *     The code is redeemed for the session there is.
 *   - `blocked`: an account whose membership could not be read. Not the same as
 *     not having one, and never answered with the code prompt — a member of
 *     eight weeks would be asked for a code they redeemed on day one. It retries
 *     the read instead.
 */
const step = ref<'code' | 'account'>('code')

/**
 * Which action is in flight, so the labels can say what is happening.
 *
 * One ref rather than a flag per button: only one of these can be running at a
 * time, and the others have to be disabled while it is.
 */
const busy = ref<'' | 'code' | 'account' | 'redeem' | 'retry' | 'switch'>('')

const phase = computed<'code' | 'account' | 'redeem' | 'blocked'>(() => {
  // Held for the whole of a sign-up. It signs in halfway through, and without
  // this the form the member is watching would turn into the redeem step before
  // it had finished.
  if (busy.value === 'account') return 'account'
  if (store.gate.value === 'unknown') return 'blocked'
  if (store.authUser.value) return 'redeem'
  return step.value
})

const code = ref('')
/** The code as stored, once `checkAccessCode` has passed it. What sign-up spends. */
const checkedCode = ref('')
const email = ref('')
const password = ref('')
const confirm = ref('')

type Field = 'code' | 'email' | 'password' | 'confirm' | 'form'

/**
 * What went wrong, and which field it belongs under.
 *
 * The account step has three fields and a failure means one of them — the
 * wrong email, a password the provider refused, two passwords that differ — so
 * the message goes where the fix is. `form` is for what no field can fix: the
 * connection, a provider left switched off.
 */
const failure = ref<{ on: Field; message: string; code: DataSourceError['code'] } | null>(null)

const errorOn = (field: Field) => (failure.value?.on === field ? failure.value.message : '')

const fail = (on: Field, cause: unknown) => {
  failure.value =
    cause instanceof DataSourceError
      ? { on, message: cause.message, code: cause.code }
      : { on, message: 'Something went wrong. Try again.', code: 'unknown' }
}

/** Failures that are about the code rather than anything typed on the account step. */
const CODE_FAILURES: DataSourceError['code'][] = ['invalid-code', 'code-claimed', 'code-expired']

const accountFieldFor = (cause: unknown): Field => {
  if (!(cause instanceof DataSourceError)) return 'form'
  switch (cause.code) {
    case 'invalid-email':
    case 'code-wrong-email':
    case 'account-exists':
      return 'email'
    case 'weak-password':
    case 'invalid-credentials':
      return 'password'
    default:
      return 'form'
  }
}

/**
 * Install first, on iOS in the browser.
 *
 * Installing there means signing in a second time: the home-screen app keeps
 * its own storage, and nothing signed in to in Safari comes along. Asked for
 * before the account is made, the app is the only place it ever has to be
 * signed in. The browser is still allowed — somebody who would rather not
 * install says so once, and this browser remembers until it signs out.
 */
const SIGN_IN_HERE_KEY = 'sign-in-here'
const signInHere = ref(storage.read<boolean>(SIGN_IN_HERE_KEY, false))

const installFirst = computed(
  () => install.method.value === 'ios' && phase.value === 'code' && !signInHere.value,
)

const chooseSignInHere = () => {
  signInHere.value = true
  storage.write(SIGN_IN_HERE_KEY, true)
}

/**
 * Install alongside, everywhere else that can.
 *
 * An offer beside the code rather than a step before it: outside iOS the
 * installed app shares the browser's storage, so an account signed in here is
 * already signed in there and the order costs nothing. iOS is left out because
 * it has `installFirst`, and a member who chose to carry on there has already
 * answered.
 */
const offerInstall = computed(
  () =>
    (install.method.value === 'prompt' || install.method.value === 'manual') &&
    phase.value === 'code',
)

const installing = ref(false)

const runInstall = async () => {
  if (installing.value) return
  installing.value = true
  try {
    await install.install()
  } finally {
    installing.value = false
  }
}

/**
 * Where the member belongs once this screen has done its part.
 *
 * Re-running the gate by hand rather than trusting the step just taken: a
 * sign-up reloads the account, and that read can fail on the way back — in
 * which case pushing at a route the member is no longer cleared for only has
 * middleware bounce them here again. Replaces rather than pushes, so Back does
 * not return to a code that is now spent.
 *
 * Resolves `true` when it navigated, so the caller can leave the screen frozen
 * on the way out rather than unfreezing it for a frame.
 */
const settle = async (): Promise<boolean> => {
  if (store.atTheDoor.value) return false
  await router.replace(store.gate.value === 'needs-setup' ? FIRST_SETUP_STEP : '/home')
  return true
}

/**
 * Whatever the store had to say before this screen could ask.
 *
 * On this screen that is the account read failing — the `blocked` step, whose
 * only useful sentence is why. Watched rather than read once on mount, because
 * a retry from here produces a fresh one.
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

/** Step one: is the code good for an account? A read, so nothing to freeze on the way out. */
const checkCode = async () => {
  if (busy.value) return
  busy.value = 'code'
  failure.value = null
  try {
    checkedCode.value = await store.checkAccessCode(code.value)
    step.value = 'account'
  } catch (cause) {
    fail('code', cause)
  } finally {
    busy.value = ''
  }
}

/**
 * Step two: make the account and spend the code on it.
 *
 * The two checks that need no round trip go first, so a mistyped confirmation
 * does not cost one. Everything after them is the provider's to refuse.
 *
 * A failure about the code itself — claimed or expired since step one — goes
 * back to step one, where the code can be changed. A failure after the account
 * exists leaves the member signed in, and this screen becomes the redeem step
 * with the code already filled in; see `store.createAccount`.
 */
const createAccount = async () => {
  if (busy.value) return
  failure.value = null
  if (password.value.length < MIN_PASSWORD_LENGTH) {
    failure.value = {
      on: 'password',
      message: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
      code: 'weak-password',
    }
    return
  }
  if (confirm.value !== password.value) {
    failure.value = { on: 'confirm', message: 'The passwords don’t match.', code: 'unknown' }
    return
  }

  busy.value = 'account'
  try {
    await store.createAccount(checkedCode.value, email.value, password.value)
    if (await settle()) return
  } catch (cause) {
    if (cause instanceof DataSourceError && CODE_FAILURES.includes(cause.code)) {
      step.value = 'code'
      fail('code', cause)
    } else {
      fail(accountFieldFor(cause), cause)
    }
  }
  busy.value = ''
}

/** Signed in without a membership: spend the code on the session there is. */
const redeem = async () => {
  if (busy.value) return
  busy.value = 'redeem'
  failure.value = null
  try {
    await store.redeemAccessCode(code.value)
    if (await settle()) return
  } catch (cause) {
    fail('code', cause)
  }
  busy.value = ''
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
 * `startupError` — which the watch above puts on the screen — instead of a
 * rejection.
 */
const retry = async () => {
  if (busy.value) return
  busy.value = 'retry'
  failure.value = null
  try {
    await store.hydrate(true)
    if (await settle()) return
  } catch (cause) {
    fail('form', cause)
  }
  busy.value = ''
}

/**
 * Leave the session and go back to the start.
 *
 * The escape hatch on both signed-in steps. Without it they were a trap: the
 * only screen a member in either state may reach, with nothing on it that ends
 * the session — and the session is often the problem, as when a code issued to
 * one address meets an account signed in with another.
 */
const useAnotherAccount = async () => {
  if (busy.value) return
  busy.value = 'switch'
  failure.value = null
  try {
    await store.signOut()
    code.value = ''
    checkedCode.value = ''
    step.value = 'code'
  } catch (cause) {
    fail('form', cause)
  } finally {
    busy.value = ''
  }
}

const submit = () => {
  if (phase.value === 'blocked') return retry()
  if (phase.value === 'redeem') return redeem()
  return phase.value === 'account' ? createAccount() : checkCode()
}

/** What the one button is about to do, in the member's words. */
const submitLabel = computed(() => {
  if (busy.value === 'retry') return 'Trying again…'
  if (busy.value === 'code' || busy.value === 'redeem') return 'Checking…'
  if (busy.value === 'account') return 'Creating your account…'
  if (phase.value === 'blocked') return 'Try again'
  if (phase.value === 'account') return 'Create account'
  return 'Continue'
})

/**
 * The address the signed-in steps are being asked of.
 *
 * Printed because the commonest way to be stuck on either is to be signed in as
 * the wrong person and have no way to see it. A code issued to one address,
 * typed into a session for another, fails with "issued to a different email
 * address" and no way to find out which — unless the screen says whose session
 * it is.
 */
const signedInAs = computed(() => store.authUser.value?.email ?? '')

/**
 * The step, named.
 *
 * The heading is the question the screen is actually asking, so the page says
 * where you are in a flow with four possible places to be. Everybody here has
 * already paid; nothing on it is addressed to somebody deciding whether to buy.
 */
const heading = computed(() => {
  if (installFirst.value) return 'Install the app first'
  if (phase.value === 'blocked') return 'Couldn’t load your account'
  if (phase.value === 'account') return 'Create your account'
  return 'Enter your access code'
})

/**
 * The one line under it, carrying only what no control on the screen says.
 *
 * Paired with `heading` rather than written into the template so the two can
 * never drift into repeating each other — the heading says *what step*, this
 * says the single fact that step needs and the fields cannot state.
 */
const standfirst = computed(() => {
  if (installFirst.value) {
    return 'Then set up your account from your Home Screen, so you only sign in once.'
  }
  if (phase.value === 'blocked') {
    // Deliberately does not say "you are not a member": nothing here knows
    // that. The read failed, and the two look identical from this side.
    return 'You’re signed in, but we couldn’t reach your account just now.'
  }
  if (phase.value === 'account') return 'Use the email address your access code was sent to.'
  return 'It was emailed to you once your payment was confirmed.'
})

/** The signed-in steps, which are the ones that need a way back out. */
const showSwitchAccount = computed(() => phase.value === 'redeem' || phase.value === 'blocked')

/** The other door, for anybody who already has an account and came in this one. */
const showSignInLink = computed(() => phase.value === 'code' || phase.value === 'account')

/** The steps where a code is the thing being asked for, and so the only ones any of the code help belongs on. */
const askingForCode = computed(() => phase.value === 'code' || phase.value === 'redeem')

/** Hidden on a deploy with no site to point at; see `buyHref`. */
const showBuyLink = computed(() => Boolean(webAppUrl) && askingForCode.value)

// Clear the error as soon as the member edits any field.
watch([code, email, password, confirm], () => {
  if (failure.value) failure.value = null
})
</script>

<template>
  <div class="access flex-1 min-h-0 flex flex-col p-[40px_24px_24px] relative overflow-hidden lg:p-[44px_44px_36px]">
    <div class="access__glow absolute w-65 h-65 -top-20 -right-20 rounded-[50%] bg-[radial-gradient(circle,var(--primary-ring),transparent_70%)] filter-[blur(8px)] pointer-events-none" />

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

    <!-- The install ask, in place of the code card rather than above it: the
         point is that the account is made in the app, so the controls for one
         here would only invite it. Nothing on the card installs — iOS keeps
         that in the Share sheet — so its one control is the way past. -->
    <AppCard
      v-if="installFirst"
      variant="raised"
      class="access__card access__install flex flex-col gap-4 shadow-raised"
    >
      <InstallAppSteps method="ios" />

      <p class="m-0 text-center text-[13px] leading-normal text-muted">
        Already added it? Open DP Fitness from your Home Screen.
      </p>

      <AppButton variant="ghost" @click="chooseSignInHere">
        Continue in the browser
      </AppButton>
    </AppCard>

    <!--
      A real form, so Enter submits.

      Worth the element rather than a `@keyup.enter` on the field: implicit
      submission is a browser behaviour that needs a form and a submit button
      to exist, and it is also what makes a phone keyboard offer "Go" instead
      of a newline. The one button that means it is marked `type="submit"` and
      has no `@click` of its own — the form's handler is the single path in, so
      a click and an Enter cannot both fire it.
    -->
    <form v-else novalidate @submit.prevent="submit">
      <AppCard
        variant="raised"
        class="access__card flex flex-col gap-4 shadow-raised"
        :aria-busy="busy !== '' || undefined"
      >
        <!--
          The fields are frozen for as long as the request they started is open.

          Every button on this card already goes dead while `busy` is set; the
          boxes they read from did not, so a code or an address could still be
          retyped after the value had been taken and sent. Whichever answer came
          back then belonged to a string no longer on screen — and a redemption
          is one-shot, so the member would be looking at a code that had just
          been spent on something they could no longer see.
        -->
        <div
          class="flex flex-col gap-4 transition-opacity duration-150"
          :class="busy !== '' && 'opacity-60'"
          :inert="busy !== ''"
        >
          <TextField
            v-if="askingForCode"
            v-model="code"
            label="Access code"
            placeholder="ENTER YOUR CODE"
            autocomplete="off"
            mono
            :error="errorOn('code')"
          />

          <!-- Three fields and nothing else. The code that got the member here
               is held in `checkedCode` and neither shown nor editable: it has
               been checked, it is what this account is about to be made from,
               and a box that still invited a change would be offering to spend
               a different code than the one that passed. The only way back to
               it is a failure that makes it necessary — claimed or expired
               between the two steps — which `createAccount` handles. -->
          <template v-else-if="phase === 'account'">
            <TextField
              v-model="email"
              label="Email address"
              type="email"
              inputmode="email"
              autocomplete="email"
              placeholder="you@example.com"
              :error="errorOn('email')"
            />
            <!-- Both boxes carry their own eye. A password being *chosen* is
                 unreadable to the person choosing it, and the confirmation
                 only ever says whether two strings nobody can see agree — so
                 the toggle is what turns "the passwords don't match" from a
                 guess into something fixable. Per field rather than one switch
                 over both: a member who wants to check one is not asking to
                 put the other on screen too. -->
            <TextField
              v-model="password"
              label="Password"
              type="password"
              autocomplete="new-password"
              reveal
              :placeholder="`At least ${MIN_PASSWORD_LENGTH} characters`"
              :error="errorOn('password')"
            />
            <TextField
              v-model="confirm"
              label="Confirm password"
              type="password"
              autocomplete="new-password"
              reveal
              placeholder="Type it again"
              :error="errorOn('confirm')"
            />
          </template>

          <!-- `blocked` has nothing to type. The read failed, so the only fact
               worth printing is why, and the only useful control is the retry
               below. -->
          <p
            v-else
            class="access__blocked m-0 text-[14px] leading-normal text-(--violet-45)"
          >
            {{ errorOn('form') || 'Check your connection, then try again. An ad blocker or privacy extension can block it too.' }}
          </p>
        </div>

        <!-- Outside the frozen block, so it is read out when it arrives. Only
             what no field can fix lands here; `blocked` prints its own above. -->
        <p
          v-if="errorOn('form') && phase !== 'blocked'"
          role="alert"
          class="access__error m-0 text-xs font-semibold text-primary"
        >
          {{ errorOn('form') }}
        </p>

        <!-- The two failures whose fix is the other door, offered as a link
             rather than only named in the message. -->
        <NuxtLink
          v-if="failure?.code === 'account-exists' || (failure?.code === 'code-claimed' && phase === 'code')"
          to="/sign-in"
          class="access__to-sign-in -mt-1 self-start text-[13px] font-bold text-primary"
        >
          Go to sign in
        </NuxtLink>

        <AppButton type="submit" :disabled="busy !== ''">
          {{ submitLabel }}
        </AppButton>

        <!--
          The way out, on the two steps that have a session behind them.

          It names the address first. Both steps fail in the same silent way —
          a code issued to one inbox typed into a session for another — and the
          screen used to keep the one fact that explains it to itself.
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
            class="access__switch pt-1 pb-1 text-[13px] font-bold text-primary disabled:opacity-50"
            :disabled="busy !== ''"
            @click="useAnotherAccount"
          >
            {{ busy === 'switch' ? 'Signing out…' : 'Not you? Use a different account' }}
          </button>
        </div>
      </AppCard>
    </form>

    <!-- Under the card, not in it: the code is what this screen is for, and
         the offer should not read as part of the form. `How to install` opens
         the same guide Home and More do, mounted below. -->
    <section
      v-if="offerInstall"
      class="access__install-offer relative mt-4 flex items-center gap-2.5 rounded-md p-[10px_10px_10px_12px] shadow-[inset_0_0_0_1px_var(--hairline)]"
    >
      <span class="grid size-7.5 shrink-0 place-items-center rounded-pill bg-primary-soft text-primary">
        <AppIcon name="download" :size="15" />
      </span>
      <div class="min-w-0 flex-auto">
        <p class="m-0 font-display text-[14px] font-black tracking-[-0.2px] text-ink">Install DP Fitness</p>
        <p class="m-0 mt-0.5 text-[12px] leading-[1.35] text-(--violet-45)">Full screen, and it works offline.</p>
      </div>
      <button
        type="button"
        class="h-9 shrink-0 whitespace-nowrap rounded-pill bg-primary-soft px-3.5 text-[13px] font-bold text-primary transition-transform duration-100 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45"
        :disabled="installing"
        @click="runInstall"
      >
        {{ install.ctaLabel.value }}
      </button>
    </section>
    <InstallAppSheet />

    <!--
      `mt-auto` here is what balances the same on `access__intro`: between them
      the card sits in the middle of the screen instead of against the bottom
      edge.

      The hints are conditional. The credit under them is the one thing here
      that always prints, which is also why it is last: it is the floor of the
      screen, not a line the member is being asked to read.
    -->
    <div class="access__foot mt-auto flex flex-col gap-2.5 pt-5 text-center">
      <!--
        The other door, for anybody who already has an account and came in this
        one. The only line at this weight, because it is the only one that is a
        whole route out of the screen rather than an answer to something having
        gone wrong.
      -->
      <p v-if="showSignInLink" class="access__hint m-0 text-[13px] text-muted">
        Already have an account?
        <NuxtLink to="/sign-in" class="access__link text-primary font-bold">Sign in</NuxtLink>
      </p>

      <!--
        Everything for a code that isn't in hand, in one sentence.

        This was two lines — "no code yet" above "can't find your code" — which
        is one question asked twice as far as anybody skimming is concerned, and
        the answers to them sat at different sizes on either side of the screen's
        only real link. They are the same moment: the code is not here. So they
        are one line, and each clause is only the part that applies — check
        spam, then a person, then the way to buy one if there was never a
        purchase behind it.

        Each fragment is a suffix on the one before, so the sentence still
        closes properly on a deploy with no support inbox, no site to point at,
        or neither.

        The purchase link opens a new tab rather than navigating. It ends in an
        email, and leaving this screen where it was means coming back is
        switching tabs rather than finding the app again — which on an installed
        home-screen app is the difference between a tap and a re-launch.
      -->
      <p v-if="askingForCode" class="access__hint m-0 mt-0.5 text-[12px] leading-normal text-muted">
        Can’t find your code? Check spam<template v-if="supportEmail"> or
        <a :href="supportHref" class="access__link font-semibold text-primary">contact support</a></template
        ><template v-if="showBuyLink"> — or
        <a
          :href="buyHref"
          target="_blank"
          rel="noopener noreferrer"
          class="access__link font-semibold text-primary"
        >join the challenge</a> if you don’t have one yet</template>.
      </p>

      <p v-if="store.demoAccessCode && askingForCode" class="access__dev m-0 text-[12px] text-muted">
        Demo code: <strong class="font-data">{{ store.demoAccessCode }}</strong>
      </p>

      <!-- The first screen a member ever opens, so the credit is set quieter
           here than anywhere else: this moment belongs to the brand above it. -->
      <!-- `self-center` rather than `items-center` on the column: an
           `inline-flex` child of a flex container is blockified, so without it
           the credit stretches the full width and sets itself hard left. Kept
           on the child so the hints above go on filling the column. -->
      <PoweredBy :size="12" class="access__credit mt-1 self-center text-(--violet-45)" />
    </div>
  </div>
</template>
