<script setup lang="ts">
// 10 · Home · Default
definePageMeta({ layout: 'app' })

import { useDataSourceClient } from '~/lib/datasource'
import type { ChatMessageView } from '~/data/types'

const store = useAppStore()
const data = useDataSourceClient()

/**
 * Home is now the screen the app loads *behind*.
 *
 * Signing in no longer waits for the payload — the member is routed the moment
 * their membership is known, and their logs, program, photos and cohort arrive
 * here. So for a second or so this screen holds a member whose state it has not
 * read, and the defaults it holds instead are not neutral: no photos reads as
 * "take your before photo", no check-in as "check in now", no sessions as a
 * ring at 0%. Every one of those is a claim about somebody's training, and
 * getting it wrong for a second and then correcting it is worse than not
 * saying it.
 *
 * So while this is true the cards that make claims stand down and the ones that
 * hold figures go to placeholders at their own size. Nothing moves when the
 * real thing lands. See `identify` in `useAppStore`.
 */
const loading = store.loading

/**
 * The content load came back with nothing and a reason.
 *
 * Only reachable now that the load runs behind this screen: it used to fail
 * under the boot splash or in front of the sign-in button, and the door screens
 * were the only things that ever showed `startupError`. A member here with one
 * is signed in, on the right screen, holding an account that would otherwise
 * render as a fresh one — so the message takes the place of the cards that
 * would be making things up, and the retry re-reads without asking anybody to
 * relaunch an installed app.
 */
const failed = computed(() => !loading.value && store.startupError.value !== '')

/** Nothing below can speak for this member yet, one way or the other. */
const unread = computed(() => loading.value || failed.value)

const retrying = ref(false)
const retry = async () => {
  if (retrying.value) return
  retrying.value = true
  try {
    await store.retryLoad()
  } finally {
    retrying.value = false
  }
}

const greeting = computed(() => {
  // The store's clock, not the device's, so the greeting agrees with the date
  // the rest of the app is working from.
  const hour = store.now.value.getHours()
  if (hour < 12) return 'Morning'
  if (hour < 17) return 'Afternoon'
  return 'Evening'
})

const nextSessionLabel = computed(() =>
  store.nextSessionAt.value.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  }),
)

// Qualifying sessions, so this agrees with the badge and leaderboard counts
// rather than quietly using a second, more generous definition of "logged".
const sessionsLogged = computed(() => store.rewards.value.sessionsQualified)
// Zero rather than NaN when the program has not loaded and there is no total
// to divide by. The ring reads 0% for a moment either way; `x / 0` renders the
// word "NaN" into the middle of it.
const challengePct = computed(() => {
  const total = store.totalSessions.value
  return total > 0 ? Math.round((sessionsLogged.value / total) * 100) : 0
})
const doneThisWeek = computed(
  () => store.days.value.filter((d) => d.status === 'completed').length,
)

// The latest thing the coach said, surfaced on Home.
const coachNote = ref<ChatMessageView | null>(null)
onMounted(async () => {
  const messages = await data.listMessages('cohort')
  coachNote.value = [...messages].reverse().find((m) => m.isCoach) ?? null
})

const initial = (name: string) => name.trim().charAt(0).toUpperCase() || 'C'

const CARD = 'rounded-card bg-raised p-4'

/*
  Three sizes, in the order the card wants to be read.

  The ring's percentage is the headline at 24px; the two counters sit at 16px,
  a clear step below it, and their labels at 12.5px below that. They were 20px
  before, close enough to the ring that the eye had to choose between three
  numbers instead of being led to one.

  The icon chips come back with them. They are not decoration: a flame and a
  dumbbell tell you which row is which before you have read either label, which
  is the whole job of a glanceable card. What was wrong the first time was the
  layout around them, not the icons.
*/
const STAT_ICON = 'grid size-7 shrink-0 place-items-center rounded-pill'
const STAT_LABEL = 'truncate text-[12.5px] text-muted'
const STAT_VALUE =
  'm-0 shrink-0 font-display text-[16px] leading-none font-black text-ink tabular-nums'
</script>

<template>
  <!--
    `lg:min-h-[calc(100dvh-72px)]` with a `1fr` last row is what puts the credit
    on the bottom edge of the screen rather than merely under the longer of the
    two columns.

    The 72px is the chrome `layouts/app.vue` puts around this page on desktop:
    32px of top padding on `.layout-app__main`, plus its 40px `.tab-spacer`.
    Subtracting both is what makes a full-height grid stop exactly at the
    viewport instead of pushing a scrollbar onto a screen that fits. Those two
    numbers live in that file — change one there and this follows.

    A floor, not a height: a cohort with a live call and a coach note can run
    past the viewport, and then the `1fr` row collapses to its content and the
    page scrolls as it always did.
  -->
  <div class="home pt-(--screen-pad-top) px-5 pb-0 flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.82fr)] lg:grid-rows-[auto_auto_1fr] lg:[grid-template-areas:'intro_intro'_'main_side'_'credit_credit'] lg:min-h-[calc(100dvh-72px)] lg:content-start lg:gap-x-6 lg:gap-y-4.5 lg:pt-0 lg:px-0 lg:pb-2">
    <!-- Install nudge. Floats over the top of the screen, so it costs the page
         no height; renders nothing once the app is installed, snoozed, or on a
         browser that has no install route. -->
    <InstallAppCard />

    <!-- The one place the wait is announced. Every placeholder below is
         `aria-hidden`, so a screen reader hears this sentence once instead of
         a dozen elements each declaring themselves busy. -->
    <p v-if="loading" role="status" class="sr-only">Loading your training.</p>

    <!--
      No subtitle. It read "Day 1 of 42 · today is waiting on you", which the
      hero card directly below already says, in larger type, with the session
      attached to it.
    -->
    <!-- The greeting is off the member document, so it is right from the first
         frame. The week is off the schedule, which is still arriving: an
         eyebrow reading "Week 1" and correcting itself to "Week 5" is the one
         thing on this header that can be wrong. -->
    <ScreenIntro
      :eyebrow="unread ? '' : store.clock.value.label"
      :title="`${greeting}, ${store.displayName.value}`"
      class="home__intro order-0 lg:[grid-area:intro]"
    >
      <template v-if="loading" #eyebrow>
        <SkeletonBlock :w="72" :h="10" />
      </template>
    </ScreenIntro>

    <!-- Desktop packs these into two independent columns; on mobile the
         wrappers dissolve and `order` restores the design's single-column
         sequence. -->
    <div class="home__col home__col--main contents lg:flex lg:flex-col lg:gap-4.5 lg:self-start lg:[grid-area:main]">
      <!--
        Final progress photo, once the block's last session is logged. The same
        place and shape as the before photo below, because it is the other end
        of the same pair, and it takes that card's slot when both would show:
        any photo lifts the first one too, so asking twice is asking for one.

        Stays until a photo taken after that session is on file.
      -->
      <!-- Both photo prompts are held back until the photos have been read.
           `firstPhotoDue` is "no photo on file", which is what an empty store
           looks like too, so showing it early asks a member who uploaded one
           in week one to upload it again. -->
      <section
        v-if="!unread && store.finalPhotoDue.value"
        class="home__section home__section--photo order-1 mt-3.25 lg:mt-0"
      >
        <div :class="CARD">
          <div class="flex gap-3">
            <span class="grid size-9 shrink-0 place-items-center rounded-pill bg-primary-soft text-primary">
              <AppIcon name="image" :size="17" />
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <h2 class="m-0 font-display text-[16px] font-black tracking-[-0.24px] text-ink">
                  Take your final photo
                </h2>
                <span
                  v-if="store.finalPhotoBadge.value?.points"
                  class="shrink-0 rounded-pill bg-secondary-soft px-2 py-0.75 text-[11px] text-secondary-ink tabular-nums"
                >
                  +{{ store.finalPhotoBadge.value.points }} RP
                </span>
              </div>
              <p class="mt-1 mb-0 text-[13px] leading-[1.45] text-muted">
                That was your last session. Upload a final progress photo to
                close out the block<template v-if="store.finalPhotoBadge.value">
                  and unlock {{ store.finalPhotoBadge.value.name }}</template
                >.
              </p>
            </div>
          </div>
          <AppButton to="/progress" class="mt-3.25">Upload final photo</AppButton>
        </div>
      </section>

      <!--
        First progress photo. Ahead of the hero, on both layouts, because Start
        workout refuses until it is done: leading with a session they cannot
        start yet would be sending them to a dialog rather than to the thing
        the dialog asks for. Shares the hero's `order-1` and comes first in the
        DOM, which is what puts it above the hero on mobile too.

        Gone for good once any photo is on file; unlike the check-in there is
        no next week for it to come back in.
      -->
      <section
        v-else-if="!unread && store.firstPhotoDue.value"
        class="home__section home__section--photo order-1 mt-3.25 lg:mt-0"
      >
        <div :class="CARD">
          <div class="flex gap-3">
            <span class="grid size-9 shrink-0 place-items-center rounded-pill bg-primary-soft text-primary">
              <AppIcon name="image" :size="17" />
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <h2 class="m-0 font-display text-[16px] font-black tracking-[-0.24px] text-ink">
                  Take your before photo
                </h2>
                <span
                  v-if="store.rewardValues.value"
                  class="shrink-0 rounded-pill bg-secondary-soft px-2 py-0.75 text-[11px] text-secondary-ink tabular-nums"
                >
                  +{{ store.rewardValues.value.progressPhoto }} RP
                </span>
              </div>
              <p class="mt-1 mb-0 text-[13px] leading-[1.45] text-muted">
                Upload a progress photo before your first session. Training
                unlocks once it’s in.
              </p>
            </div>
          </div>
          <AppButton to="/progress" class="mt-3.25">Upload progress photo</AppButton>
        </div>
      </section>

      <!--
        What the hero's slot holds when the read failed.

        In the hero's place rather than as a banner above it, because with
        nothing loaded there is no hero, no week at a glance and no stats — the
        screen below is empty, and a strip of red over an empty screen explains
        less than a card sitting in the space the training should be in.
      -->
      <section
        v-if="failed"
        class="home__section home__section--failed order-1 mt-3.25 lg:mt-0"
      >
        <div :class="CARD">
          <div class="flex gap-3">
            <span class="grid size-9 shrink-0 place-items-center rounded-pill bg-primary-soft text-primary">
              <AppIcon name="info" :size="17" />
            </span>
            <div class="min-w-0 flex-1">
              <h2 class="m-0 font-display text-[16px] font-black tracking-[-0.24px] text-ink">
                Couldn’t load your training
              </h2>
              <p class="mt-1 mb-0 text-[13px] leading-[1.45] text-muted">
                {{ store.startupError.value }}
              </p>
            </div>
          </div>
          <AppButton class="mt-3.25" :disabled="retrying" @click="retry">
            {{ retrying ? 'Trying again…' : 'Try again' }}
          </AppButton>
        </div>
      </section>

      <!-- The hero's own shape while the schedule is still arriving. Bottom
           aligned and at the card's real heights, because the hero is the
           tallest thing on the screen and everything below it would jump the
           moment it appeared. -->
      <section
        v-if="loading"
        class="home__section home__section--hero order-1 mt-3.25 lg:mt-0"
      >
        <div class="flex min-h-52 flex-col justify-end gap-3 rounded-lg bg-raised p-5 lg:min-h-64 lg:p-6">
          <SkeletonBlock :w="96" :h="11" />
          <SkeletonBlock w="70%" :h="26" />
          <SkeletonBlock w="45%" :h="13" />
        </div>
      </section>

      <!-- Hero workout. Nothing to lead with until the program's training week
           has been authored, and an empty hero is worse than none. -->
      <section
        v-else-if="store.today.value"
        class="home__section home__section--hero order-1 mt-3.25 lg:mt-0"
      >
        <WorkoutHeroCard
          :day="store.today.value"
          :all-done="store.weekComplete.value"
          :next-label="nextSessionLabel"
        />
      </section>

      <!--
        This week at a glance. The whole card opens Train, on this week.

        A stretched link rather than a card wrapped in <NuxtLink>: every dot
        is already a link to its own day, and a link inside a link is invalid
        markup that browsers untangle by splitting the outer one apart. So the
        title is the link, its `::after` covers the card, and the dots sit
        above it (`relative`) and keep going to the day they show.
      -->
      <section
        v-if="loading"
        class="home__section home__section--glance mt-3.25 lg:mt-0 order-3"
      >
        <div :class="CARD" class="p-4.5">
          <SkeletonBlock w="55%" :h="13" />
          <SkeletonBlock w="65%" :h="24" class="mt-2.5" />
          <SkeletonBlock :h="5" class="mt-3 mb-4" />
          <!-- `DayDots`' own geometry: a flexed square per day with its caption
               under it, at the 54px the real dot is drawn at. Five, because a
               training week is four to seven days and the middle of that costs
               the least movement whichever it turns out to be. -->
          <div class="flex gap-2">
            <div
              v-for="dot in 5"
              :key="dot"
              class="flex min-w-0 flex-1 flex-col items-center gap-2"
            >
              <SkeletonBlock shape="circle" w="100%" :h="54" class="max-w-13.5" />
              <SkeletonBlock :w="24" :h="11" />
            </div>
          </div>
        </div>
      </section>

      <section
        v-else-if="store.days.value.length"
        class="home__section home__section--glance mt-3.25 lg:mt-0 order-3"
      >
        <div
          :class="CARD"
          class="relative p-4.5 lg:transition-[translate,box-shadow] lg:duration-150 lg:ease-[ease] lg:hover:-translate-y-0.5 lg:hover:shadow-card"
        >
          <!-- The "0/4" that used to sit in this corner is gone: the sentence
               immediately below it is the same two numbers, spelled out. -->
          <NuxtLink
            to="/train"
            class="flex items-center justify-between gap-2 text-[13px] text-muted outline-none after:absolute after:inset-0 after:rounded-card focus-visible:after:ring-2 focus-visible:after:ring-primary-ring"
          >
            This week at a glance
            <AppIcon name="chevronRight" :size="16" class="shrink-0" />
          </NuxtLink>
          <p class="glance__line flex items-baseline gap-1.5 mt-2.5 mx-0 mb-0 text-[13.5px] text-ink">
            <span class="glance__n font-display font-black text-[24px] tracking-[-0.6px] tabular-nums">{{ doneThisWeek }}</span>
            <span>of {{ store.days.value.length }} sessions logged</span>
          </p>
          <ProgressBar
            :value="doneThisWeek"
            :max="store.days.value.length"
            :height="5"
            gradient
            class="glance__bar mt-3 mx-0 mb-4"
          />
          <DayDots :days="store.days.value" class="relative" />
        </div>
      </section>

      <!-- Shortcuts -->
      <section class="home__section home__section--shortcuts mt-3.25 lg:mt-0 order-6 grid grid-cols-[1fr_1fr] gap-3">
        <NuxtLink to="/rewards" class="shortcut min-h-20.5 p-4 rounded-card bg-raised flex flex-col justify-center gap-1.5 text-primary [&_span]:text-[13.5px] [&_span]:text-ink lg:transition-[translate,box-shadow] lg:duration-150 lg:ease-[ease] lg:hover:-translate-y-0.5 lg:hover:shadow-card">
          <AppIcon name="trophy" :size="19" />
          <span>See your rewards</span>
        </NuxtLink>
        <NuxtLink to="/guides" class="shortcut min-h-20.5 p-4 rounded-card bg-raised flex flex-col justify-center gap-1.5 text-primary [&_span]:text-[13.5px] [&_span]:text-ink lg:transition-[translate,box-shadow] lg:duration-150 lg:ease-[ease] lg:hover:-translate-y-0.5 lg:hover:shadow-card">
          <AppIcon name="guides" :size="19" />
          <span>Program guides</span>
        </NuxtLink>
      </section>
    </div>

    <div class="home__col home__col--side contents lg:flex lg:flex-col lg:gap-4.5 lg:self-start lg:[grid-area:side]">
      <!--
        One card, one hierarchy.

        This was three cards, then one card holding three co-equal columns —
        the same problem in less space: a ring, a flame and a dumbbell all
        shouting at the same volume, with "Week streak" wrapping to two lines to
        fit. They are not three peers. The ring is the one figure here about the
        whole programme; the other two are counters against it.

        So the ring anchors the left at full size and the counters become a
        ledger beside it: icon, label, value on a common right edge, a hairline
        between the rows. The size ladder does the ranking — 24px in the ring,
        16px on the counters, 12.5px on their labels — so the eye lands on the
        percentage first and reads the detail second, instead of arbitrating
        between three numbers of equal weight.
      -->
      <!-- Gone entirely when the read failed, rather than placeholders that
           will never fill: the card above says why and offers the retry, and a
           second, quieter copy of "no data" under it adds nothing. -->
      <section v-if="!failed" class="home__stats order-2 mt-3.5 lg:mt-0">
        <div :class="CARD" class="flex items-center gap-6">
          <!-- A ring at 0% is not an empty ring, it is a claim that nothing has
               been logged, so the whole dial stands down rather than drawing
               itself at a value it has not read. The ledger beside it keeps its
               icons and labels — those are the card, and they are true before
               any of the numbers are — and only the figures are held back. -->
          <SkeletonBlock v-if="loading" shape="circle" :w="82" :h="82" />
          <ProgressRing v-else :value="challengePct" :size="82" :stroke="8">
            <div class="flex flex-col items-center leading-none">
              <span class="flex items-baseline font-display font-black tracking-[-0.5px] text-ink tabular-nums">
                <span class="text-[24px]">{{ challengePct }}</span
                ><span class="text-[12px]">%</span>
              </span>
              <span class="mt-1 text-[10.5px] text-muted">done</span>
            </div>
          </ProgressRing>

          <dl class="m-0 min-w-0 flex-1">
            <div class="flex items-center gap-2.5 pb-2.5">
              <span :class="STAT_ICON" class="bg-primary-soft text-primary">
                <AppIcon name="train" :size="14" :stroke="2.2" />
              </span>
              <dt :class="STAT_LABEL" class="flex-1">Sessions logged</dt>
              <dd :class="STAT_VALUE">
                <SkeletonBlock v-if="loading" :w="20" :h="13" />
                <template v-else>{{ sessionsLogged }}</template>
              </dd>
            </div>
            <div class="flex items-center gap-2.5 border-t border-hairline pt-2.5">
              <span :class="STAT_ICON" class="bg-secondary-soft text-secondary-ink">
                <AppIcon name="flame" :size="14" :stroke="2.2" />
              </span>
              <dt :class="STAT_LABEL" class="flex-1">Week streak</dt>
              <dd :class="STAT_VALUE">
                <SkeletonBlock v-if="loading" :w="20" :h="13" />
                <template v-else>{{ store.rewards.value.streakWeeks }}</template>
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <!--
        The weekly live call, read off the cohort document.

        Only on the day of the call. The same card for everybody: there is no
        slot to be assigned, no attendance to track and nothing to dismiss.
        Before the call starts the button is there but shut, so the time is on
        Home all day; once it starts the button opens the link; after it ends
        the card stays for the rest of the day, shut again.

        No call set, or one only half filled in, renders nothing at all rather
        than a card whose button goes nowhere. The admin app sets it on
        `cohorts/{id}.liveCall`; see FIREBASE.md.
      -->
      <section
        v-if="store.liveCallToday.value"
        class="home__section home__section--live order-3 mt-3.25 lg:mt-0 lg:order-3"
      >
        <LiveCallCard :call="store.liveCallToday.value" />
      </section>

      <!-- Weekly check-in. This card is the reminder the "Weekly check-in
           reminder" switch on Profile turns off; the check-in itself stays
           reachable from the nav and the More menu. -->
      <!-- Held back with the photo prompts, and for the same reason: an
           unread store has no check-in on file, which is indistinguishable
           from one that is due. The card would say "Check in now" to somebody
           who checked in on Sunday. -->
      <section
        v-if="!unread && store.prefs.value.weeklyCheckInReminder"
        class="home__section home__section--checkin mt-3.25 lg:mt-0 order-4"
      >
        <div :class="CARD">
          <div class="checkin__top flex gap-3">
            <span class="checkin__icon w-9 h-9 rounded-pill bg-primary-soft text-primary grid place-items-center shrink-0"><AppIcon name="checkCircle" :size="17" /></span>
            <div class="checkin__text flex-1 min-w-0">
              <div class="checkin__head flex items-center gap-2">
                <h2 class="checkin__title m-0 font-display font-black text-[16px] tracking-[-0.24px] text-ink">Week {{ store.clock.value.week }} check-in</h2>
                <span
                  v-if="store.checkInDue.value && store.rewardValues.value"
                  class="shrink-0 py-0.75 px-2 rounded-pill bg-secondary-soft text-secondary-ink text-[11px] tabular-nums"
                >
                  +{{ store.rewardValues.value.checkIn }} RP
                </span>
              </div>
              <p class="checkin__body mt-1 mx-0 mb-0 text-[13px] leading-[1.45] text-muted">
                {{
                  store.checkInDue.value
                    ? 'How the week went and how training felt. Two minutes.'
                    : 'Submitted for this week. Your coach has it.'
                }}
              </p>
            </div>
          </div>
          <AppButton to="/check-in" class="checkin__cta mt-3.25">
            {{ store.checkInDue.value ? 'Check in now' : 'View check-in' }}
          </AppButton>
        </div>
      </section>

      <!-- Latest from the coach -->
      <section v-if="coachNote" class="home__section home__section--coach mt-3.25 lg:mt-0 order-5">
        <div :class="CARD" class="flex gap-3.25">
          <span class="coach__avatar w-11 h-11 rounded-pill bg-secondary text-on-secondary grid place-items-center font-display font-black text-[16px] shrink-0">{{ initial(coachNote.authorName) }}</span>
          <div class="coach__text flex-1 min-w-0">
            <div class="coach__head flex items-center gap-1.75">
              <strong class="coach__name text-[14px] font-bold text-ink">{{ coachNote.authorName }}</strong>
              <span class="py-0.5 px-1.75 rounded-pill bg-primary-soft text-primary text-[11px]">Cohort chat</span>
            </div>
            <p class="coach__body mt-1.5 mx-0 mb-0 text-[13.5px] leading-[1.45] text-muted">{{ coachNote.text }}</p>
            <NuxtLink to="/chat" class="coach__reply inline-flex items-center min-h-7 mt-1.25 text-[13px] font-bold text-primary">Reply in chat →</NuxtLink>
          </div>
        </div>
      </section>
    </div>

    <!--
      The build credit, on the floor of Home.

      A direct child of the root rather than a row inside either column, which
      is what lets it be both things at once: on mobile the two column wrappers
      are `contents`, so this is just the last flex item and `order-7` puts it
      after the shortcuts; on desktop it is the grid's own third row, spanning
      both tracks under whichever of the two columns runs longer.

      Set smaller than anywhere else in the app — 11px against the 13px the
      hub and the footer use. Home is the screen a member opens every day, so
      the credit has to survive being seen a hundred times, and the size is what
      keeps it fine print rather than furniture. `text-faint` for the same
      reason: it is there to be found, not read.

      `lg:self-end` is the half that pins it: the row above gives it the
      leftover height, and this puts it at the bottom of that space instead of
      stretched through the middle of it.

      `lg:-mb-10` then reclaims the last 40px. `layouts/app.vue` ends every
      screen with a `.tab-spacer`, which it sizes at 96px on mobile "so content
      clears the floating tab bar" and 40px on desktop — where there is no
      floating tab bar at all, only the side rail, so those 40px are the one
      piece of space on this screen that nothing is using. Pulling the credit
      through them is what puts it on the bottom edge rather than 48px above it.

      It cannot overflow: the margin reclaims exactly the spacer's own height,
      so the credit ends 8px off the viewport floor — the page's `lg:pb-2` —
      and the scroll container is no taller than it was. On mobile none of this
      applies; there the spacer is real clearance for a real tab bar.
    -->
    <section
      class="home__credit order-7 mt-6 flex justify-center lg:mt-2 lg:-mb-10 lg:self-end lg:[grid-area:credit]"
    >
      <PoweredBy :size="11" class="text-faint" />
    </section>
  </div>
</template>
