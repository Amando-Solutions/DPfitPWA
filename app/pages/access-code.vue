<script setup lang="ts">
// 04 · Access Code (idle) + 05 · Access Code Error
definePageMeta({ layout: 'default' })

import { accessCodes } from '~/data/program'
import { DataSourceError } from '~/lib/datasource'

const route = useRoute()
const router = useRouter()
const store = useAppStore()

/**
 * Getting in takes two separate things, and this screen is both of them.
 *
 *   1. Proving the inbox is yours — a sign-in link, no password.
 *   2. Proving you paid — the access code, which binds you to a cohort.
 *
 * They are genuinely separate: somebody can hold a valid Firebase session and
 * still not be a member of anything, which is exactly the state between step
 * one and step two. So the screen shows whichever half is still outstanding
 * rather than assuming a member arrives with both.
 */
const phase = computed<'email' | 'sent' | 'code'>(() => {
  if (store.authUser.value) return 'code'
  return linkSent.value ? 'sent' : 'email'
})

const email = ref('')
const code = ref('')
const error = ref('')
const busy = ref(false)
const linkSent = ref(false)

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
 * Finish sign-in if this page was opened from a link.
 *
 * Runs on mount rather than in middleware: the link lands on this route
 * carrying its credentials in the query string, and they have to be consumed
 * before anything else can decide where the member belongs.
 */
onMounted(async () => {
  const url = window.location.href
  if (!(await store.isSignInLink(url))) return

  busy.value = true
  try {
    await store.completeSignInLink(url)
    // The credentials are single-use and should not survive in history.
    await router.replace({ path: route.path })
  } catch (cause) {
    if (cause instanceof DataSourceError && cause.code === 'needs-email') {
      confirmingEmail.value = true
    } else {
      error.value = message(cause)
    }
  } finally {
    busy.value = false
  }
})

const sendLink = async () => {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await store.sendSignInLink(email.value)
    linkSent.value = true
  } catch (cause) {
    error.value = message(cause)
  } finally {
    busy.value = false
  }
}

/** The other-device path: they retype the address, then the link completes. */
const confirmEmail = async () => {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await store.completeSignInLink(window.location.href, email.value)
    confirmingEmail.value = false
    await router.replace({ path: route.path })
  } catch (cause) {
    error.value = message(cause)
  } finally {
    busy.value = false
  }
}

const redeem = async () => {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await store.redeemAccessCode(code.value)
    await router.push('/setup/about-you')
  } catch (cause) {
    error.value = message(cause)
  } finally {
    busy.value = false
  }
}

const submit = () => {
  if (confirmingEmail.value) return confirmEmail()
  return phase.value === 'code' ? redeem() : sendLink()
}

// Clear the error as soon as the member edits either field.
watch([code, email], () => {
  if (error.value) error.value = ''
})
</script>

<template>
  <div class="access flex-1 min-h-0 flex flex-col p-[40px_24px_24px] relative overflow-hidden lg:p-[44px_44px_36px]">
    <div class="access__glow absolute w-65 h-65 -top-20 -right-20 rounded-[50%] [background:radial-gradient(circle,var(--rose-ring),transparent_70%)] filter-[blur(8px)] pointer-events-none" />

    <div class="access__intro relative mt-auto mb-6 flex flex-col gap-2 lg:mt-0 lg:mb-7">
      <BrandWordmark size="lg" stacked />
      <EyebrowLabel tone="muted"
        >6-week recomp challenge · Cohort 01</EyebrowLabel
      >
      <h1 class="access__title m-[6px_0_4px] font-display font-black text-[30px] leading-[1.08] [letter-spacing:-0.5px] text-(--ink) lg:text-[36px]">
        Let's get<br /><span class="access__title--rose text-rose">your glow back.</span>
      </h1>
      <p class="access__sub m-0 text-(--violet-45) text-[14px] leading-[1.45] lg:text-[15px]">
        <template v-if="confirmingEmail">
          Confirm the email address this link was sent to. It was opened on a
          different device from the one that asked for it.
        </template>
        <template v-else-if="phase === 'sent'">
          Check your inbox. The link signs you in — no password to remember.
        </template>
        <template v-else-if="phase === 'code'">
          Now enter the access code sent to you after your payment was
          confirmed.
        </template>
        <template v-else>
          Enter the email you paid with and we’ll send you a sign-in link.
        </template>
      </p>
    </div>

    <AppCard variant="raised" class="access__card flex flex-col gap-4 [box-shadow:var(--shadow-raised)]">
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
        glow
        icon-right="arrowRight"
        :disabled="busy"
        @click="submit"
      >
        {{ busy ? 'Checking…' : phase === 'code' ? 'Continue' : 'Email me a link' }}
      </AppButton>
      <AppButton v-else variant="ghost" :disabled="busy" @click="linkSent = false">
        Use a different email
      </AppButton>
    </AppCard>

    <p class="access__hint muted m-[18px_0_0] text-center text-[13px]">
      Can’t find your code? Check spam or
      <NuxtLink to="/access-code" class="access__link text-rose font-bold">contact support</NuxtLink>.
    </p>

    <p class="access__dev mt-auto text-center [font-family:var(--font-data)] text-[11px] [color:var(--text-muted)] lg:mt-7">Demo code: <strong>{{ accessCodes[0] }}</strong></p>
  </div>
</template>
