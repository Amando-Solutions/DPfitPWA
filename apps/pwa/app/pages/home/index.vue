<script setup lang="ts">
// 10 · Home · Default
definePageMeta({ layout: 'app' })

import { liveCall, rewardValues } from '~/data/program'
import { useDataSourceClient } from '~/lib/datasource'
import type { ChatMessageView } from '~/data/types'

const store = useAppStore()
const data = useDataSourceClient()

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
const challengePct = computed(() =>
  Math.round((sessionsLogged.value / store.totalSessions.value) * 100),
)
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
  <div class="home pt-(--screen-pad-top) px-5 pb-0 flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.82fr)] lg:[grid-template-areas:'intro_intro'_'main_side'] lg:content-start lg:gap-x-6 lg:gap-y-4.5 lg:pt-0 lg:px-0 lg:pb-2">
    <!-- Install nudge. Floats over the top of the screen, so it costs the page
         no height; renders nothing once the app is installed, snoozed, or on a
         browser that has no install route. -->
    <InstallAppCard />

    <!--
      No subtitle. It read "Day 1 of 42 · today is waiting on you", which the
      hero card directly below already says, in larger type, with the session
      attached to it.
    -->
    <ScreenIntro
      :eyebrow="`Week ${store.clock.value.week} · ${store.clock.value.title}`"
      :title="`${greeting}, ${store.displayName.value}`"
      class="home__intro order-0 lg:[grid-area:intro]"
    />

    <!-- Desktop packs these into two independent columns; on mobile the
         wrappers dissolve and `order` restores the design's single-column
         sequence. -->
    <div class="home__col home__col--main contents lg:flex lg:flex-col lg:gap-4.5 lg:self-start lg:[grid-area:main]">
      <!-- Hero workout -->
      <section class="home__section home__section--hero order-1 mt-3.25 lg:mt-0">
        <WorkoutHeroCard
          :day="store.today.value"
          :all-done="store.weekComplete.value"
          :locked="store.trainingLocked.value"
          :next-label="nextSessionLabel"
        />
      </section>

      <!-- This week at a glance -->
      <section class="home__section home__section--glance mt-3.25 lg:mt-0 order-3">
        <div :class="CARD" class="p-4.5">
          <!-- The "0/4" that used to sit in this corner is gone: the sentence
               immediately below it is the same two numbers, spelled out. -->
          <span class="block text-[13px] text-muted">This week at a glance</span>
          <p class="glance__line flex items-baseline gap-1.5 mt-2.5 mx-0 mb-0 text-[13.5px] text-ink">
            <span class="glance__n font-display font-black text-[24px] tracking-[-0.6px] tabular-nums">{{ doneThisWeek }}</span>
            <span>of {{ store.days.value.length }} sessions logged</span>
          </p>
          <ProgressBar
            :value="doneThisWeek"
            :max="store.days.value.length"
            :height="5"
            flame
            class="glance__bar mt-3 mx-0 mb-4"
          />
          <DayDots :days="store.days.value" />
        </div>
      </section>

      <!-- Shortcuts -->
      <section class="home__section home__section--shortcuts mt-3.25 lg:mt-0 order-6 grid grid-cols-[1fr_1fr] gap-3">
        <NuxtLink to="/rewards" class="shortcut min-h-20.5 p-4 rounded-card bg-raised flex flex-col justify-center gap-1.5 text-rose [&_span]:text-[13.5px] [&_span]:text-ink lg:transition-[translate,box-shadow] lg:duration-150 lg:ease-[ease] lg:hover:-translate-y-0.5 lg:hover:shadow-card">
          <AppIcon name="trophy" :size="19" />
          <span>See your rewards</span>
        </NuxtLink>
        <NuxtLink to="/guides" class="shortcut min-h-20.5 p-4 rounded-card bg-raised flex flex-col justify-center gap-1.5 text-rose [&_span]:text-[13.5px] [&_span]:text-ink lg:transition-[translate,box-shadow] lg:duration-150 lg:ease-[ease] lg:hover:-translate-y-0.5 lg:hover:shadow-card">
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
      <section class="home__stats order-2 mt-3.5 lg:mt-0">
        <div :class="CARD" class="flex items-center gap-6">
          <ProgressRing :value="challengePct" :size="82" :stroke="8">
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
              <span :class="STAT_ICON" class="bg-rose-soft text-rose">
                <AppIcon name="train" :size="14" :stroke="2.2" />
              </span>
              <dt :class="STAT_LABEL" class="flex-1">Sessions logged</dt>
              <dd :class="STAT_VALUE">{{ sessionsLogged }}</dd>
            </div>
            <div class="flex items-center gap-2.5 border-t border-hairline pt-2.5">
              <span :class="STAT_ICON" class="bg-orange-soft text-ember-text">
                <AppIcon name="flame" :size="14" :stroke="2.2" />
              </span>
              <dt :class="STAT_LABEL" class="flex-1">Week streak</dt>
              <dd :class="STAT_VALUE">{{ store.rewards.value.streakWeeks }}</dd>
            </div>
          </dl>
        </div>
      </section>

      <!--
        The weekly live call.

        Deliberately the same card for everybody, every week. There is no slot
        to be assigned, no attendance to track and nothing to dismiss: one time,
        set by the coach, that stays on Home whether or not they made it last
        week. A card that disappeared once you had attended would be a card that
        stopped reminding you the week you most needed it.
      -->
      <section class="home__section home__section--live order-3 mt-3.25 lg:mt-0 lg:order-3">
        <div :class="CARD" class="flex flex-col gap-3">
          <div class="flex gap-3">
            <span class="grid size-9 shrink-0 place-items-center rounded-pill bg-rose-soft text-rose">
              <AppIcon name="chat" :size="17" />
            </span>
            <div class="min-w-0 flex-1">
              <h2 class="m-0 font-display text-[16px] font-black tracking-[-0.24px] text-ink">
                Join the live call
              </h2>
              <p class="mt-1 mb-0 text-[13px] leading-[1.45] text-muted">
                {{ liveCall.when }}
              </p>
            </div>
          </div>
          <!-- An outside link, so it opens away from the app rather than
               replacing the session the member is in the middle of. -->
          <AppButton
            :to="liveCall.joinUrl"
            size="md"
            target="_blank"
            rel="noopener noreferrer"
          >
            Join the call
          </AppButton>
        </div>
      </section>

      <!-- Weekly check-in -->
      <section class="home__section home__section--checkin mt-3.25 lg:mt-0 order-4">
        <div :class="CARD">
          <div class="checkin__top flex gap-3">
            <span class="checkin__icon w-9 h-9 rounded-pill bg-rose-soft text-rose grid place-items-center shrink-0"><AppIcon name="checkCircle" :size="17" /></span>
            <div class="checkin__text flex-1 min-w-0">
              <div class="checkin__head flex items-center gap-2">
                <h2 class="checkin__title m-0 font-display font-black text-[16px] tracking-[-0.24px] text-ink">Week {{ store.clock.value.week }} check-in</h2>
                <span v-if="store.checkInDue.value" class="shrink-0 py-0.75 px-2 rounded-pill bg-rose-soft text-rose text-[11px] tabular-nums">
                  +{{ rewardValues.checkIn }} RP
                </span>
              </div>
              <p class="checkin__body mt-1 mx-0 mb-0 text-[13px] leading-[1.45] text-muted">
                {{
                  store.checkInDue.value
                    ? 'How the week went and how training felt. Two minutes.'
                    : 'Submitted for this week. You can still update it.'
                }}
              </p>
            </div>
          </div>
          <AppButton to="/check-in" class="checkin__cta mt-3.25">
            {{ store.checkInDue.value ? 'Check in now' : 'Update check-in' }}
          </AppButton>
        </div>
      </section>

      <!-- Latest from the coach -->
      <section v-if="coachNote" class="home__section home__section--coach mt-3.25 lg:mt-0 order-5">
        <div :class="CARD" class="flex gap-3.25">
          <span class="coach__avatar w-11 h-11 rounded-pill bg-rose-fill text-on-rose grid place-items-center font-display font-black text-[16px] shrink-0">{{ initial(coachNote.authorName) }}</span>
          <div class="coach__text flex-1 min-w-0">
            <div class="coach__head flex items-center gap-1.75">
              <strong class="coach__name text-[14px] font-bold text-ink">{{ coachNote.authorName }}</strong>
              <span class="py-0.5 px-1.75 rounded-pill bg-rose-soft text-rose text-[11px]">Cohort chat</span>
            </div>
            <p class="coach__body mt-1.5 mx-0 mb-0 text-[13.5px] leading-[1.45] text-muted">{{ coachNote.text }}</p>
            <NuxtLink to="/chat" class="coach__reply inline-flex items-center min-h-7 mt-1.25 text-[13px] font-bold text-rose">Reply in chat →</NuxtLink>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
