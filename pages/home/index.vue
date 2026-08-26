<script setup lang="ts">
// 10 · Home · Default
definePageMeta({ layout: 'app' })

import { rewardValues } from '~/data/program'
import { useDataSourceClient } from '~/lib/datasource'
import type { ChatMessage } from '~/data/types'

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

const dayLine = computed(() => {
  if (store.weekComplete.value) return 'this week is done, well played'
  if (store.trainingLocked.value) return 'today is logged, rest up'
  return 'today is waiting on you'
})

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
const coachNote = ref<ChatMessage | null>(null)
onMounted(async () => {
  const messages = await data.listMessages('cohort')
  coachNote.value = [...messages].reverse().find((m) => m.isCoach) ?? null
})

const initial = (name: string) => name.trim().charAt(0).toUpperCase() || 'C'
</script>

<template>
  <div class="home [padding:var(--screen-pad-top)_20px_0] [display:flex] [flex-direction:column] lg:[display:grid] lg:[grid-template-columns:minmax(0,_1fr)_minmax(0,_0.82fr)] lg:[grid-template-areas:'intro_intro'_'main_side'] lg:[align-content:start] lg:[column-gap:24px] lg:[row-gap:18px] lg:[padding:0_0_8px]">
    <!-- Install nudge. Floats over the top of the screen, so it costs the page
         no height; renders nothing once the app is installed, snoozed, or on a
         browser that has no install route. -->
    <InstallAppCard />

    <ScreenIntro
      :eyebrow="`Week ${store.clock.value.week} · ${store.clock.value.title}`"
      :title="`${greeting}, ${store.displayName.value}`"
      :subtitle="`Day ${store.clock.value.dayInChallenge} of ${store.clock.value.totalDays} · ${dayLine}`"
      class="home__intro [order:0] lg:[grid-area:intro]"
    />

    <!-- Desktop packs these into two independent columns; on mobile the
         wrappers dissolve and `order` restores the design's single-column
         sequence. -->
    <div class="home__col home__col--main [display:contents] lg:[display:flex] lg:[flex-direction:column] lg:[gap:18px] lg:[align-self:start] lg:[grid-area:main]">
      <!-- Hero workout -->
      <section class="home__section home__section--hero [margin-top:13px] lg:[margin-top:0] [order:1] [margin-top:12px]">
        <WorkoutHeroCard
          :day="store.today.value"
          :all-done="store.weekComplete.value"
          :locked="store.trainingLocked.value"
          :next-label="nextSessionLabel"
        />
      </section>

      <!-- This week at a glance -->
      <section class="home__section home__section--glance [margin-top:13px] lg:[margin-top:0] [order:3]">
        <div class="glance [padding:18px] [border-radius:var(--radius-card)] [background:var(--paper-raised)]">
          <div class="glance__head [display:flex] [align-items:center] [justify-content:space-between]">
            <span class="glance__title [font-family:var(--font-eyebrow)] [text-transform:uppercase] [letter-spacing:1px] [font-size:10px] [font-weight:700] [color:var(--violet-45)]">This week at a glance</span>
            <span class="glance__count data [font-size:10.5px] [letter-spacing:0.42px] [color:var(--rose)]">
              {{ doneThisWeek }}/{{ store.days.value.length }}
            </span>
          </div>
          <p class="glance__line [display:flex] [align-items:baseline] [gap:6px] [margin:10px_0_0] [font-size:13.5px] [color:var(--ink)]">
            <span class="glance__n [font-family:var(--font-display)] [font-weight:900] [font-size:24px] [letter-spacing:-0.6px]">{{ doneThisWeek }}</span>
            <span>of {{ store.days.value.length }} sessions logged</span>
          </p>
          <ProgressBar
            :value="doneThisWeek"
            :max="store.days.value.length"
            :height="5"
            flame
            class="glance__bar [margin:12px_0_16px]"
          />
          <DayDots :days="store.days.value" />
        </div>
      </section>

      <!-- Shortcuts -->
      <section class="home__section home__section--shortcuts [margin-top:13px] lg:[margin-top:0] [order:6] [display:grid] [grid-template-columns:1fr_1fr] [gap:12px] lg:[display:grid] lg:[grid-template-columns:1fr_1fr] lg:[gap:12px]">
        <NuxtLink to="/rewards" class="shortcut [min-height:82px] [padding:16px] [border-radius:var(--radius-card)] [background:var(--paper-raised)] [display:flex] [flex-direction:column] [justify-content:center] [gap:6px] [color:var(--rose)] [&_span]:[font-size:13.5px] [&_span]:[color:var(--ink)] lg:[transition:transform_0.15s_ease,_box-shadow_0.15s_ease] lg:hover:[transform:translateY(-2px)] lg:hover:[box-shadow:var(--shadow-card)]">
          <AppIcon name="trophy" :size="19" />
          <span>See your rewards</span>
        </NuxtLink>
        <NuxtLink to="/guides" class="shortcut [min-height:82px] [padding:16px] [border-radius:var(--radius-card)] [background:var(--paper-raised)] [display:flex] [flex-direction:column] [justify-content:center] [gap:6px] [color:var(--rose)] [&_span]:[font-size:13.5px] [&_span]:[color:var(--ink)] lg:[transition:transform_0.15s_ease,_box-shadow_0.15s_ease] lg:hover:[transform:translateY(-2px)] lg:hover:[box-shadow:var(--shadow-card)]">
          <AppIcon name="guides" :size="19" />
          <span>Program guides</span>
        </NuxtLink>
      </section>
    </div>

    <div class="home__col home__col--side [display:contents] lg:[display:flex] lg:[flex-direction:column] lg:[gap:18px] lg:[align-self:start] lg:[grid-area:side]">
      <!-- Stat row -->
      <section class="home__stats [order:2] [display:grid] [grid-template-columns:minmax(0,_184fr)_minmax(0,_159fr)] [gap:12px] [margin-top:14px] lg:[margin-top:0] lg:[grid-template-columns:minmax(0,_1fr)]">
        <div class="challenge [display:flex] [align-items:center] [gap:14px] [padding:16px] [border-radius:var(--radius-card)] [background:var(--paper-raised)]">
          <ProgressRing :value="challengePct" :size="76" :stroke="8">
            <div class="challenge__ring [display:flex] [flex-direction:column] [align-items:center] [line-height:1]">
              <span class="challenge__pct [display:flex] [align-items:baseline] [font-family:var(--font-display)] [font-weight:900] [letter-spacing:-0.4px] [color:var(--ink)]">
                <span class="challenge__pct-n [font-size:20px]">{{ challengePct }}</span
                ><span class="challenge__pct-s [font-size:11px]">%</span>
              </span>
              <span class="challenge__done [margin-top:3px] [font-family:var(--font-data)] [text-transform:uppercase] [font-size:8px] [color:var(--violet-45)]">Done</span>
            </div>
          </ProgressRing>
          <div class="challenge__text [min-width:0]">
            <span class="challenge__label [display:block] [font-family:var(--font-data)] [text-transform:uppercase] [font-size:9.5px] [color:var(--violet-45)]">Challenge</span>
            <p class="challenge__body [margin:4px_0_0] [font-size:13.5px] [line-height:1.35] [color:var(--ink)]">
              {{ sessionsLogged }} of {{ store.totalSessions.value }} sessions logged
            </p>
          </div>
        </div>

        <div class="home__mini-stats [display:flex] [flex-direction:column] [gap:12px] lg:[flex-direction:row] lg:[&_>_*]:[flex:1]">
          <div class="ministat [display:flex] [align-items:center] [gap:11px] [padding:14px_16px] [border-radius:var(--radius-card)] [background:var(--paper-raised)]">
            <span class="ministat__icon ministat__icon--flame [width:34px] [height:34px] [border-radius:var(--radius-pill)] [display:grid] [place-items:center] [flex-shrink:0] [background:var(--orange-16)]">
              <AppIcon name="flame" :size="17" />
            </span>
            <div>
              <span class="ministat__value [display:block] [font-family:var(--font-display)] [font-weight:900] [font-size:19px] [line-height:1.1] [color:var(--ink)]">{{ store.rewards.value.streakWeeks }}</span>
              <span class="ministat__label [display:block] [font-family:var(--font-data)] [text-transform:uppercase] [font-size:9px] [color:var(--violet-45)]">Week streak</span>
            </div>
          </div>
          <div class="ministat [display:flex] [align-items:center] [gap:11px] [padding:14px_16px] [border-radius:var(--radius-card)] [background:var(--paper-raised)]">
            <span class="ministat__icon ministat__icon--rose [width:34px] [height:34px] [border-radius:var(--radius-pill)] [display:grid] [place-items:center] [flex-shrink:0] [background:var(--rose-soft)] [color:var(--rose)]">
              <AppIcon name="train" :size="17" />
            </span>
            <div>
              <span class="ministat__value [display:block] [font-family:var(--font-display)] [font-weight:900] [font-size:19px] [line-height:1.1] [color:var(--ink)]">{{ sessionsLogged }}</span>
              <span class="ministat__label [display:block] [font-family:var(--font-data)] [text-transform:uppercase] [font-size:9px] [color:var(--violet-45)]">Sessions logged</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Weekly check-in -->
      <section class="home__section home__section--checkin [margin-top:13px] lg:[margin-top:0] [order:4]">
        <div class="checkin [padding:16px] [border-radius:var(--radius-card)] [background:var(--paper-raised)] lg:[transition:transform_0.15s_ease,_box-shadow_0.15s_ease]">
          <div class="checkin__top [display:flex] [gap:12px]">
            <span class="checkin__icon [width:36px] [height:36px] [border-radius:var(--radius-pill)] [background:var(--rose-soft)] [color:var(--rose)] [display:grid] [place-items:center] [flex-shrink:0]"><AppIcon name="checkCircle" :size="17" /></span>
            <div class="checkin__text [flex:1] [min-width:0]">
              <div class="checkin__head [display:flex] [align-items:center] [gap:8px]">
                <h2 class="checkin__title [margin:0] [font-family:var(--font-display)] [font-weight:900] [font-size:16px] [letter-spacing:-0.24px] [color:var(--ink)]">Week {{ store.clock.value.week }} check-in</h2>
                <span v-if="store.checkInDue.value" class="checkin__rp data [flex-shrink:0] [padding:3px_8px] [border-radius:var(--radius-pill)] [background:var(--orange-16)] [color:var(--orange-text)] [font-size:9.5px] [letter-spacing:0.475px]">
                  +{{ rewardValues.checkIn }} RP
                </span>
              </div>
              <p class="checkin__body [margin:4px_0_0] [font-size:13px] [line-height:1.45] [color:var(--violet-45)]">
                {{
                  store.checkInDue.value
                    ? 'How the week went and how training felt. Two minutes.'
                    : 'Submitted for this week. You can still update it.'
                }}
              </p>
            </div>
          </div>
          <AppButton to="/check-in" glow icon-right="arrowRight" class="checkin__cta [margin-top:13px]">
            {{ store.checkInDue.value ? 'Check in now' : 'Update check-in' }}
          </AppButton>
        </div>
      </section>

      <!-- Latest from the coach -->
      <section v-if="coachNote" class="home__section home__section--coach [margin-top:13px] lg:[margin-top:0] [order:5]">
        <div class="coach [display:flex] [gap:13px] [padding:16px] [border-radius:var(--radius-card)] [background:var(--paper-raised)] lg:[transition:transform_0.15s_ease,_box-shadow_0.15s_ease]">
          <span class="coach__avatar [width:44px] [height:44px] [border-radius:var(--radius-pill)] [background:var(--rose-fill)] [color:var(--on-rose)] [display:grid] [place-items:center] [font-family:var(--font-display)] [font-weight:900] [font-size:16px] [flex-shrink:0]">{{ initial(coachNote.authorName) }}</span>
          <div class="coach__text [flex:1] [min-width:0]">
            <div class="coach__head [display:flex] [align-items:center] [gap:7px]">
              <strong class="coach__name [font-size:14px] [font-weight:700] [color:var(--ink)]">{{ coachNote.authorName }}</strong>
              <span class="coach__chip [padding:2px_7px] [border-radius:var(--radius-pill)] [background:var(--rose-soft)] [color:var(--rose)] [font-family:var(--font-data)] [text-transform:uppercase] [font-size:8.5px]">Cohort Chat</span>
            </div>
            <p class="coach__body [margin:6px_0_0] [font-size:13.5px] [line-height:1.45] [color:var(--violet-45)]">{{ coachNote.text }}</p>
            <NuxtLink to="/chat" class="coach__reply [display:inline-flex] [align-items:center] [min-height:28px] [margin-top:5px] [font-size:13px] [font-weight:700] [color:var(--rose)]">Reply in chat →</NuxtLink>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
