<script setup lang="ts">
// The cohort is over. See `MemberGate`: a cohort archived, or past its last
// day, puts this screen in place of every other, and
// `plugins/cohort-ended.client.ts` brings a member here from wherever they
// were when it happened.
definePageMeta({ layout: 'default' })

import { useDataSourceClient, type SupportContact } from '~/lib/datasource'

const router = useRouter()
const store = useAppStore()

/**
 * The cohort's own name, off the archived document, with the one the code was
 * issued under behind it. Either is enough to tell a member which cohort this
 * is about; neither is worth a blank line if both are missing.
 */
const cohortName = computed(
  () => store.endedCohort.value?.name?.trim() || store.member.value?.cohortName?.trim() || '',
)

/** What closed with it. The heading already says it ended, so this does not say it twice. */
const standfirst = computed(() =>
  cohortName.value
    ? `${cohortName.value} is over, so training, chat and the leaderboard are closed. Thanks for showing up.`
    : 'Training, chat and the leaderboard are closed now. Thanks for showing up.',
)

/**
 * What they did, as the app counted it.
 *
 * The screen can land before the member's logs have: a sign-in routes on the
 * membership and reads the rest behind it. Placeholders at the tiles' own size
 * until then, and nothing at all if the read failed — a row of zeros would be
 * a claim that they did nothing.
 */
const statsState = computed<'loading' | 'ready' | 'none'>(() => {
  if (store.loading.value) return 'loading'
  return store.loadError.value ? 'none' : 'ready'
})

const stats = computed(() => {
  const rewards = store.rewards.value
  return [
    { label: 'Sessions', value: rewards.sessionsQualified },
    // Not "Reward points": a third of a phone's width truncates it.
    { label: 'Points', value: rewards.points },
    { label: 'Badges', value: rewards.badgeCount },
  ]
})

/**
 * The ways to ask about it. The support address is the one on the receipt;
 * the coach's WhatsApp is read once here, because a member on this screen is
 * the one most likely to want a person.
 */
const config = useRuntimeConfig().public
const supportEmail = config.supportEmail as string
const supportHref = `mailto:${supportEmail}?subject=${encodeURIComponent('DP Fitness — my cohort has ended')}`

const supportContact = ref<SupportContact | null>(null)
onMounted(async () => {
  try {
    supportContact.value = await useDataSourceClient().getSupportContact()
  } catch (cause) {
    console.warn('[cohort-ended] could not read the support contact', cause)
  }
})
const whatsappHref = computed(() =>
  supportContact.value ? `https://wa.me/${supportContact.value.whatsapp.replace(/\D/g, '')}` : '',
)

const signedInAs = computed(() => store.authUser.value?.email ?? '')

/**
 * The way on to another cohort, which this screen is the door to: the code
 * from their confirmation email. `JoinCohortForm` makes it the active cohort
 * and takes them into it; this one stays theirs, in its results.
 */
const joining = ref(false)

/**
 * The one way out. Frozen for the length of it, as every sign-out is: the
 * session is already going, and there is nothing on the card worth pressing
 * twice. Left frozen on success, because the screen is on its way out.
 */
const signingOut = ref(false)
const signOutFailed = ref(false)
const signOut = async () => {
  if (signingOut.value || joining.value) return
  signingOut.value = true
  signOutFailed.value = false
  try {
    await store.signOut()
    await router.replace('/sign-in')
  } catch {
    signOutFailed.value = true
    signingOut.value = false
  }
}
</script>

<template>
  <div class="ended flex-1 min-h-0 flex flex-col p-[40px_24px_24px] relative overflow-hidden lg:p-[44px_44px_36px]">
    <div class="ended__glow absolute w-65 h-65 -top-20 -right-20 rounded-[50%] bg-[radial-gradient(circle,var(--primary-ring),transparent_70%)] filter-[blur(8px)] pointer-events-none" />

    <div class="ended__intro relative mt-auto mb-6 flex flex-col gap-2 lg:mt-0 lg:mb-7">
      <BrandLogo :size="56" class="text-ink" label="DP Fitness" />

      <h1 class="ended__title m-[10px_0_0] font-display font-black text-[27px] leading-[1.12] tracking-[-0.4px] text-ink lg:text-[30px]">
        Your cohort has ended
      </h1>
      <p class="ended__sub m-0 text-(--violet-45) text-[14px] leading-[1.45] lg:text-[15px]">
        {{ standfirst }}
      </p>
    </div>

    <AppCard
      variant="raised"
      class="ended__card relative flex flex-col gap-4 shadow-raised"
      :aria-busy="signingOut || undefined"
    >
      <p v-if="statsState === 'loading'" role="status" class="sr-only">Loading your results.</p>

      <div :inert="signingOut" class="flex flex-col gap-4">
        <section v-if="statsState !== 'none'" aria-labelledby="ended-results" class="flex flex-col gap-2.5">
          <h2 id="ended-results" class="m-0 text-[13px] font-semibold text-muted">Your challenge</h2>
          <dl class="m-0 grid grid-cols-3 gap-2">
            <div
              v-for="stat in stats"
              :key="stat.label"
              class="flex min-w-0 flex-col-reverse gap-1 rounded-md p-3 shadow-[inset_0_0_0_1px_var(--hairline)]"
            >
              <dt class="truncate text-[12px] text-muted">{{ stat.label }}</dt>
              <dd class="m-0 font-display text-[20px] leading-none font-black text-ink tabular-nums">
                <SkeletonBlock v-if="statsState === 'loading'" :w="36" :h="20" />
                <template v-else>{{ stat.value.toLocaleString() }}</template>
              </dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="ended-join" class="flex flex-col gap-2.5">
          <h2 id="ended-join" class="m-0 text-[13px] font-semibold text-muted">Joining another cohort?</h2>
          <JoinCohortForm v-model:busy="joining" />
        </section>

        <AppButton variant="secondary" :disabled="signingOut || joining" @click="signOut">
          {{ signingOut ? 'Signing out…' : 'Sign out' }}
        </AppButton>
      </div>

      <!-- Outside the frozen block, so it is read out when it arrives. -->
      <p v-if="signOutFailed" role="alert" class="m-0 -mt-1 text-center text-xs font-semibold text-primary">
        Couldn’t sign out. Check your connection and try again.
      </p>

      <p v-if="signedInAs" class="m-0 -mt-1 text-center text-[13px] leading-normal text-muted">
        Signed in as <strong class="text-ink font-semibold">{{ signedInAs }}</strong>
      </p>
    </AppCard>

    <div class="ended__foot mt-auto flex flex-col gap-2.5 pt-5 text-center">
      <p v-if="supportContact || supportEmail" class="m-0 text-[12px] leading-normal text-muted">
        Questions?
        <template v-if="supportContact">
          <a :href="whatsappHref" target="_blank" rel="noopener noreferrer" class="font-semibold text-primary">Message {{ supportContact.name }} on WhatsApp</a
          ><template v-if="supportEmail"> or </template>
        </template>
        <a v-if="supportEmail" :href="supportHref" class="font-semibold text-primary">{{ supportContact ? 'contact support' : 'Contact support' }}</a>.
      </p>

      <PoweredBy :size="12" class="mt-1 self-center text-(--violet-45)" />
    </div>
  </div>
</template>
