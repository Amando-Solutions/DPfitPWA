<script setup lang="ts">
// 10 · Home · Default
definePageMeta({ layout: 'app' })

import { rewardValues } from '~/data/program'
import { useDataSourceClient } from '~/lib/datasource'
import type { ChatMessage } from '~/data/types'

const store = useAppStore()
const data = useDataSourceClient()

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Morning'
  if (hour < 17) return 'Afternoon'
  return 'Evening'
})

const sessionsLogged = computed(() => store.sessions.value.length)
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
  <div class="home">
    <ScreenIntro
      :eyebrow="`Week ${store.clock.value.week} · ${store.clock.value.title}`"
      :title="`${greeting}, ${store.displayName.value}`"
      :subtitle="`Day ${store.clock.value.dayInChallenge} of ${store.clock.value.totalDays} · ${
        store.weekComplete.value ? 'this week is done — well played' : 'today is waiting on you'
      }`"
      class="home__intro"
    />

    <!-- Desktop packs these into two independent columns; on mobile the
         wrappers dissolve and `order` restores the design's single-column
         sequence. -->
    <div class="home__col home__col--main">
      <!-- Hero workout -->
      <section class="home__section home__section--hero">
        <WorkoutHeroCard :day="store.today.value" :all-done="store.weekComplete.value" />
      </section>

      <!-- This week at a glance -->
      <section class="home__section home__section--glance">
        <div class="glance">
          <div class="glance__head">
            <span class="glance__title">This week at a glance</span>
            <span class="glance__count data">
              {{ doneThisWeek }}/{{ store.days.value.length }}
            </span>
          </div>
          <p class="glance__line">
            <span class="glance__n">{{ doneThisWeek }}</span>
            <span>of {{ store.days.value.length }} sessions logged</span>
          </p>
          <ProgressBar
            :value="doneThisWeek"
            :max="store.days.value.length"
            :height="5"
            flame
            class="glance__bar"
          />
          <DayDots :days="store.days.value" />
        </div>
      </section>

      <!-- Shortcuts -->
      <section class="home__section home__section--shortcuts">
        <NuxtLink to="/rewards" class="shortcut">
          <AppIcon name="trophy" :size="19" />
          <span>See your rewards</span>
        </NuxtLink>
        <NuxtLink to="/guides" class="shortcut">
          <AppIcon name="guides" :size="19" />
          <span>Program guides</span>
        </NuxtLink>
      </section>
    </div>

    <div class="home__col home__col--side">
      <!-- Stat row -->
      <section class="home__stats">
        <div class="challenge">
          <ProgressRing :value="challengePct" :size="76" :stroke="8">
            <div class="challenge__ring">
              <span class="challenge__pct">
                <span class="challenge__pct-n">{{ challengePct }}</span
                ><span class="challenge__pct-s">%</span>
              </span>
              <span class="challenge__done">Done</span>
            </div>
          </ProgressRing>
          <div class="challenge__text">
            <span class="challenge__label">Challenge</span>
            <p class="challenge__body">
              {{ sessionsLogged }} of {{ store.totalSessions.value }} sessions logged
            </p>
          </div>
        </div>

        <div class="home__mini-stats">
          <div class="ministat">
            <span class="ministat__icon ministat__icon--flame">
              <AppIcon name="flame" :size="17" />
            </span>
            <div>
              <span class="ministat__value">{{ store.rewards.value.streakWeeks }}</span>
              <span class="ministat__label">Week streak</span>
            </div>
          </div>
          <div class="ministat">
            <span class="ministat__icon ministat__icon--rose">
              <AppIcon name="train" :size="17" />
            </span>
            <div>
              <span class="ministat__value">{{ sessionsLogged }}</span>
              <span class="ministat__label">Sessions logged</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Weekly check-in -->
      <section class="home__section home__section--checkin">
        <div class="checkin">
          <div class="checkin__top">
            <span class="checkin__icon"><AppIcon name="checkCircle" :size="17" /></span>
            <div class="checkin__text">
              <div class="checkin__head">
                <h2 class="checkin__title">Week {{ store.clock.value.week }} check-in</h2>
                <span v-if="store.checkInDue.value" class="checkin__rp data">
                  +{{ rewardValues.checkIn }} RP
                </span>
              </div>
              <p class="checkin__body">
                {{
                  store.checkInDue.value
                    ? 'How the week went and how training felt — two minutes.'
                    : 'Submitted for this week. You can still update it.'
                }}
              </p>
            </div>
          </div>
          <AppButton to="/check-in" glow icon-right="arrowRight" class="checkin__cta">
            {{ store.checkInDue.value ? 'Check in now' : 'Update check-in' }}
          </AppButton>
        </div>
      </section>

      <!-- Latest from the coach -->
      <section v-if="coachNote" class="home__section home__section--coach">
        <div class="coach">
          <span class="coach__avatar">{{ initial(coachNote.authorName) }}</span>
          <div class="coach__text">
            <div class="coach__head">
              <strong class="coach__name">{{ coachNote.authorName }}</strong>
              <span class="coach__chip">Cohort Chat</span>
            </div>
            <p class="coach__body">{{ coachNote.text }}</p>
            <NuxtLink to="/chat" class="coach__reply">Reply in chat →</NuxtLink>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.home {
  padding: var(--screen-pad-top) 20px 0;
  display: flex;
  flex-direction: column;

  // The column wrappers are layout-only; on mobile they get out of the way and
  // `order` puts the sections back into the design's single-column sequence.
  &__col {
    display: contents;
  }

  &__intro {
    order: 0;
  }

  &__section {
    margin-top: 13px;

    &--hero {
      order: 1;
      margin-top: 12px;
    }

    &--glance {
      order: 3;
    }

    &--checkin {
      order: 4;
    }

    &--coach {
      order: 5;
    }

    &--shortcuts {
      order: 6;
    }
  }

  &__stats {
    order: 2;
    display: grid;
    grid-template-columns: minmax(0, 184fr) minmax(0, 159fr);
    gap: 12px;
    margin-top: 14px;
  }

  &__mini-stats {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  &__section--shortcuts {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
}

// --- Challenge ring card ----------------------------------------------------
.challenge {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  border-radius: var(--radius-card);
  background: var(--paper-raised);

  &__ring {
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 1;
  }

  &__pct {
    display: flex;
    align-items: baseline;
    font-family: var(--font-display);
    font-weight: 900;
    letter-spacing: -0.4px;
    color: var(--ink);
  }

  &__pct-n {
    font-size: 20px;
  }

  &__pct-s {
    font-size: 11px;
  }

  &__done {
    margin-top: 3px;
    font-family: var(--font-data);
    text-transform: uppercase;
    font-size: 8px;
    color: var(--violet-45);
  }

  &__text {
    min-width: 0;
  }

  &__label {
    display: block;
    font-family: var(--font-data);
    text-transform: uppercase;
    font-size: 9.5px;
    color: var(--violet-45);
  }

  &__body {
    margin: 4px 0 0;
    font-size: 13.5px;
    line-height: 1.35;
    color: var(--ink);
  }
}

// --- Mini stat rows ---------------------------------------------------------
.ministat {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 14px 16px;
  border-radius: var(--radius-card);
  background: var(--paper-raised);

  &__icon {
    width: 34px;
    height: 34px;
    border-radius: var(--radius-pill);
    display: grid;
    place-items: center;
    flex-shrink: 0;

    &--flame {
      background: var(--orange-16);
    }
    &--rose {
      background: rgba(200, 30, 92, 0.11);
      color: var(--rose);
    }
  }

  &__value {
    display: block;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 19px;
    line-height: 1.1;
    color: var(--ink);
  }

  &__label {
    display: block;
    font-family: var(--font-data);
    text-transform: uppercase;
    font-size: 9px;
    color: var(--violet-45);
  }
}

// --- Week at a glance -------------------------------------------------------
.glance {
  padding: 18px;
  border-radius: var(--radius-card);
  background: var(--paper-raised);

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__title {
    font-family: var(--font-eyebrow);
    text-transform: uppercase;
    letter-spacing: 1px;
    font-size: 10px;
    font-weight: 700;
    color: var(--violet-45);
  }

  &__count {
    font-size: 10.5px;
    letter-spacing: 0.42px;
    color: var(--rose);
  }

  &__line {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin: 10px 0 0;
    font-size: 13.5px;
    color: var(--ink);
  }

  &__n {
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 24px;
    letter-spacing: -0.6px;
  }

  &__bar {
    margin: 12px 0 16px;
  }
}

// --- Weekly check-in --------------------------------------------------------
.checkin {
  padding: 16px;
  border-radius: var(--radius-card);
  background: var(--paper-raised);

  &__top {
    display: flex;
    gap: 12px;
  }

  &__icon {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-pill);
    background: rgba(200, 30, 92, 0.11);
    color: var(--rose);
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }

  &__text {
    flex: 1;
    min-width: 0;
  }

  &__head {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__title {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 16px;
    letter-spacing: -0.24px;
    color: var(--ink);
  }

  &__rp {
    flex-shrink: 0;
    padding: 3px 8px;
    border-radius: var(--radius-pill);
    background: var(--orange-16);
    color: var(--orange);
    font-size: 9.5px;
    letter-spacing: 0.475px;
  }

  &__body {
    margin: 4px 0 0;
    font-size: 13px;
    line-height: 1.45;
    color: var(--violet-45);
  }

  &__cta {
    margin-top: 13px;
  }
}

// --- Coach note -------------------------------------------------------------
.coach {
  display: flex;
  gap: 13px;
  padding: 16px;
  border-radius: var(--radius-card);
  background: var(--paper-raised);

  &__avatar {
    width: 44px;
    height: 44px;
    border-radius: var(--radius-pill);
    background: var(--rose);
    color: var(--paper-raised);
    display: grid;
    place-items: center;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 16px;
    flex-shrink: 0;
  }

  &__text {
    flex: 1;
    min-width: 0;
  }

  &__head {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  &__name {
    font-size: 14px;
    font-weight: 700;
    color: var(--ink);
  }

  &__chip {
    padding: 2px 7px;
    border-radius: var(--radius-pill);
    background: rgba(200, 30, 92, 0.1);
    color: var(--rose);
    font-family: var(--font-data);
    text-transform: uppercase;
    font-size: 8.5px;
  }

  &__body {
    margin: 6px 0 0;
    font-size: 13.5px;
    line-height: 1.45;
    color: var(--violet-45);
  }

  &__reply {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    margin-top: 5px;
    font-size: 13px;
    font-weight: 700;
    color: var(--rose);
  }
}

// --- Shortcut tiles ---------------------------------------------------------
.shortcut {
  min-height: 82px;
  padding: 16px;
  border-radius: var(--radius-card);
  background: var(--paper-raised);
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  color: var(--rose);

  span {
    font-size: 13.5px;
    color: var(--ink);
  }
}

// Desktop: two independent columns. Each packs its own cards with a single
// gap, so a short card never leaves a hole waiting on a taller neighbour.
@media (min-width: 1024px) {
  .home {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 0.82fr);
    grid-template-areas:
      'intro intro'
      'main  side';
    align-content: start;
    column-gap: 24px;
    row-gap: 18px;
    padding: 0 0 8px;

    &__intro {
      grid-area: intro;
    }

    &__col {
      display: flex;
      flex-direction: column;
      gap: 18px;
      align-self: start;

      &--main {
        grid-area: main;
      }

      &--side {
        grid-area: side;
      }
    }

    // Spacing is the columns' gap now, not per-section margins.
    &__section,
    &__stats {
      margin-top: 0;
    }

    &__stats {
      grid-template-columns: minmax(0, 1fr);
    }

    &__mini-stats {
      flex-direction: row;

      > * {
        flex: 1;
      }
    }

    &__section--shortcuts {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
  }

  .shortcut,
  .coach,
  .checkin {
    transition:
      transform 0.15s ease,
      box-shadow 0.15s ease;
  }

  .shortcut:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-card);
  }
}

</style>
