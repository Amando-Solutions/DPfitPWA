import { Timestamp } from 'firebase/firestore'

import { DataSourceError, useDataSourceClient } from '~/lib/datasource'
import type { ActiveSessionInput, CheckInInput, DeviceClaim } from '~/lib/datasource'
import { defaultPreferences } from '~/lib/datasource/local'
import {
  challengeClock,
  daysBetween,
  isDateKey,
  planDaysOf,
  planWeekOf,
  weekAt,
} from '~/lib/domain/challenge'
import { chatNotificationFor, chatNotificationId } from '~/lib/chat'
import { nutritionTargetsFor } from '~/lib/domain/nutrition'
import {
  finalPhotoOf,
  finalSessionOf,
  rankLeaderboard,
  rewardsContextOf,
  rewardsSnapshot,
} from '~/lib/domain/rewards'

import {
  dateKey,
  relativeLabel,
  restoreClock,
  startOfNextDay,
  syncClock,
  trustedNow,
  trustedTimestamp,
} from '~/lib/time'
import type { ProcessedImage } from '~/lib/image'
import { DEVICE_PREFIX, storage } from '~/lib/storage'
import type {
  ActiveSessionDoc,
  Announcement,
  AuthUser,
  BadgeRuleId,
  ChatAttachment,
  CheckIn,
  Cohort,
  EarnedBadge,
  Guide,
  LeaderboardEntry,
  LoggedExercise,
  Member,
  MemberGate,
  MemberPreferences,
  MemberProfile,
  Message,
  Notification,
  NotificationView,
  PhotoPose,
  Program,
  ProgressPhoto,
  SessionLog,
  TrainingWeek,
  WorkoutDayView,
} from '~/data/types'

interface AppState {
  hydrated: boolean
  /**
   * Trusted "now", as milliseconds. Held in state rather than read fresh so
   * everything derived from the date recomputes together when the clock is
   * re-synced or the day rolls over.
   *
   * Milliseconds rather than a `Timestamp` deliberately: this one ticks, and a
   * number is the cheapest thing to compare and to store in reactive state.
   * `now` and `nowTs` below hand out the shapes callers actually want.
   */
  nowMs: number
  /** The Firebase user. Present without a `member` between sign-in and redemption. */
  authUser: AuthUser | null
  member: Member | null
  /**
   * Whether the member document could not be read, as opposed to not existing.
   *
   * `member: null` used to carry both meanings, and the two want opposite
   * screens. "You have not redeemed a code" asks for a code. "We could not
   * reach your account" must not: a member who redeemed weeks ago would be
   * asked for a code they no longer have, and told it had already been used
   * when they dug it out — with no way back to the sign-in screen, because
   * they *are* signed in. See `gate`.
   */
  memberUnreadable: boolean
  /**
   * The authored plan this member is training against, and the cohort they are
   * in. Both read once per load, both `null` until they are.
   *
   * Everything derived below that used to be a constant hangs off these: the
   * length of the block, the training week, the reward economy, the badge and
   * rank ladders, the live call. `null` is a real state — a program that failed
   * to read, or a cohort document that was never written — and every consumer
   * renders it as absent rather than substituting a plausible default. The
   * numbers a member is shown are the coach's or they are not shown.
   */
  program: Program | null
  /** The dated schedule: every week, each with its days. See `listProgramWeeks`. */
  weeks: TrainingWeek[]
  guides: Guide[]
  cohort: Cohort | null
  // The announcement deck is not here either, for the reason the notifications
  // below are not: it is live. See `announcementFeed`.
  sessions: SessionLog[]
  activeSession: ActiveSessionDoc | null
  checkIns: CheckIn[]
  photos: ProgressPhoto[]
  // The notifications themselves are not here. They are live, not loaded — see
  // `watchInbox` — and a re-hydrate for the same member would wipe them with
  // nothing to bring them back until that member changed.
  /** Notification id → when this member read it. Absent means unread. */
  notificationReads: Record<string, Timestamp>
  /** Badge id → award record. */
  earnedBadges: Record<string, EarnedBadge>
  /** The cohort, as the last load saw it. Never ordered here: see `rankLeaderboard`. */
  leaderboard: LeaderboardEntry[]
  /**
   * The roster size, counted by the data source. `null` until something asks.
   *
   * Not part of `hydrate`: one screen shows it, so it is read when that screen
   * opens rather than on every boot. See `refreshCohortMemberCount`.
   */
  cohortMemberCount: number | null
  prefs: MemberPreferences
  /** Badge waiting to be celebrated, consumed by the celebration screen. */
  pendingBadge: BadgeRuleId | null
}

/**
 * Everything the app knows before it knows anybody.
 *
 * A factory rather than a constant, because it is used twice for different
 * reasons: to seed the store, and to reset it in `hydrate` for a visitor with
 * no member document. Sharing one object between those would let the second
 * hand back arrays the first is still rendering.
 */
/** A boot failure in the member's words. The data source has already logged it. */
const readMessage = (cause: unknown): string =>
  cause instanceof DataSourceError ? cause.message : 'Couldn’t load your account. Try again.'

/** Whether the tour has been seen on this device. A device key: sign-out keeps it. */
const ONBOARDED_KEY = `${DEVICE_PREFIX}onboarded`

/** What a device signed out by a later sign-in is told, on the sign-in screen. */
const SIGNED_IN_ELSEWHERE =
  'Your account was signed in on another device, so you’ve been signed out here.'

const emptyState = (): AppState => ({
  hydrated: false,
  nowMs: Date.now(),
  authUser: null,
  member: null,
  memberUnreadable: false,
  program: null,
  weeks: [],
  guides: [],
  cohort: null,
  sessions: [],
  activeSession: null,
  checkIns: [],
  photos: [],
  notificationReads: {},
  earnedBadges: {},
  leaderboard: [],
  cohortMemberCount: null,
  prefs: defaultPreferences(),
  pendingBadge: null,
})

/**
 * The app's single store.
 *
 * Everything a screen needs comes from here: state loaded through the data
 * source, derived values from `lib/domain`, and actions that write back. No
 * component reads storage or fetches directly.
 */
const buildStore = () => {
  const data = useDataSourceClient()

  const state = useState<AppState>('app-store', emptyState)

  /**
   * Whatever went wrong before the app could ask the member anything.
   *
   * Two things land here, and neither has an `await` to be handed back to.
   * A Google redirect finishes on a *different page load* from the one that
   * started it. And a boot read that fails takes the whole of `hydrate` with
   * it — which runs in a plugin, before the app mounts, so it is not an error
   * message, it is a 500 page instead of an app.
   *
   * `/access-code` picks this up on mount, which is the screen a member in
   * either state is looking at anyway.
   */
  const startupError = ref('')

  /** `resumeSignIn` answers for the whole load, so it runs once per load. */
  let resumed = false

  /**
   * Whether this device has been through the onboarding tour.
   *
   * Kept on the device rather than the member document, because the tour is
   * shown to somebody who is not signed in: there is no document to read at the
   * moment the question is asked. A device key, so signing out does not replay
   * it. Once true it never goes back.
   */
  const isOnboarded = useState<boolean>('onboarded', () =>
    storage.read<boolean>(ONBOARDED_KEY, false),
  )

  const markOnboarded = () => {
    if (isOnboarded.value) return
    isOnboarded.value = true
    storage.write(ONBOARDED_KEY, true)
  }

  // --- Loading -------------------------------------------------------------
  const hydrate = async (force = false) => {
    if (state.value.hydrated && !force) return

    // A re-run re-answers the question, so the previous answer's failure does
    // not survive it. Without this a retry that succeeds still hands the screen
    // the error that prompted it.
    startupError.value = ''

    // Before anything asks who is signed in. A load returning from a Google
    // redirect carries its credentials in the URL, and they have to be
    // consumed here or the reads below run as nobody and route middleware
    // bounces a member who just signed in back to the door.
    if (!resumed) {
      resumed = true
      try {
        await data.resumeSignIn()
      } catch (cause) {
        startupError.value =
          cause instanceof DataSourceError ? cause.message : 'Sign-in didn’t complete.'
      }
    }

    // Cheap and synchronous: the offset from the last session, so the first
    // paint already has the right date. The network sync lands later.
    restoreClock()

    // Read behind a catch, all the way down. `plugins/store.client.ts` awaits
    // this before the app mounts, so anything that escapes is not a message on
    // a screen — there is no screen yet — it is the error page. A member whose
    // ad blocker is refusing `firestore.googleapis.com`, or who is simply on a
    // bad train, gets the sign-in screen and a reason; reloading recovers.
    let authUser: AuthUser | null = null
    try {
      authUser = await data.getAuthUser()
    } catch (cause) {
      startupError.value = readMessage(cause)
      state.value = { ...emptyState(), hydrated: true, nowMs: trustedNow().getTime() }
      return
    }

    // Anybody signed in here is past the tour, however they got in: a sign-in
    // link opened on a fresh device skips it, and members signed in from before
    // the flag existed never set it. Recorded now, so signing out later does
    // not send them back through it.
    if (authUser) markOnboarded()

    // One device at a time, settled before anything is read as this member.
    // The rules refuse every read from a device that has lost the account, and
    // finding that out through a failed member read would look like a broken
    // account rather than a sign-in somewhere else. See `claimDevice`.
    if (authUser) {
      let claim: DeviceClaim = 'claimed'
      try {
        claim = await data.claimDevice()
      } catch (cause) {
        // Not fatal. If the claim really is lost, the member read below is
        // refused and reports it the way any unreadable account does.
        console.warn('[store] could not claim this device for the account', cause)
      }
      if (claim === 'superseded') {
        try {
          await data.signOut()
        } catch (cause) {
          console.warn('[store] could not sign out a superseded device', cause)
        }
        startupError.value = SIGNED_IN_ELSEWHERE
        state.value = { ...emptyState(), hydrated: true, nowMs: trustedNow().getTime() }
        return
      }
    }

    // Two reads, in order, rather than one `Promise.all`.
    //
    // They were parallel, and a rejected member read took the auth answer down
    // with it: `Promise.all` rejects whole, so `authUser` stayed at its `null`
    // seed and a signed-in member was written back into the store as nobody.
    // The screens then asked them to sign in — while they were signed in — and
    // the sign-in they were being offered was for a session they already had.
    //
    // Nothing was gained by the parallelism either: `getMember` waits on the
    // same session restore `getAuthUser` does before it can name a document, so
    // the second read never started early. Sequencing it also means a signed-out
    // visitor makes no member read at all.
    let member: Member | null = null
    let memberUnreadable = false
    if (authUser) {
      try {
        member = await data.getMember()
      } catch (cause) {
        // Signed in, and the document could not be read. Keep the session and
        // say so: this is `gate === 'unknown'`, and the difference between a
        // retry and being asked for an access code that was redeemed weeks ago.
        startupError.value = readMessage(cause)
        memberUnreadable = true
      }
    }

    // Everything past this point hangs off the member document — their logs,
    // their photos, their cohort's notifications and leaderboard — and every
    // one of those reads resolves a path through it. Somebody who has not
    // redeemed an access code yet has no such document, and asking anyway is
    // not an empty answer: `FirestoreDataSource` throws "no membership on this
    // account yet" for each. On the boot path that took the whole app down,
    // sign-in screen included, which is the one screen a visitor in exactly
    // that state needs. So the load stops here for them, with the rest of the
    // state at its defaults and eight round trips not made.
    if (!member) {
      state.value = {
        ...emptyState(),
        hydrated: true,
        nowMs: trustedNow().getTime(),
        authUser,
        memberUnreadable,
      }
      return
    }

    // The authored half of the load, alongside the member's own.
    //
    // It is not a second round trip: the program, the training week, the guide
    // library and the cohort go out with the member's logs and settle together,
    // because every screen needs both halves and there is nothing worth
    // painting with only one of them. They are also the
    // reads that used to be `import` statements, which is why they cost nothing
    // before and are the whole of the difference now.
    /**
     * A read the app can do without.
     *
     * The guide library and the cohort document are each one screen or one
     * card, and neither is load-bearing: an empty library renders its empty
     * state, and a missing cohort costs the live-call card and the board.
     * Inside `Promise.all` they were neither — a single rejection takes the
     * whole array down and blanks the app, so a rules file that had not been deployed for one collection
     * would present as a member's entire account failing to load.
     *
     * The training data below is deliberately *not* wrapped this way. A member
     * with no sessions and no program has nothing to be shown, and pretending
     * otherwise would replace an error message with a screen quietly claiming
     * they had done nothing.
     */
    const optional = async <T>(read: Promise<T>, fallback: T, what: string): Promise<T> => {
      try {
        return await read
      } catch (cause) {
        console.warn(`[store] ${what} could not be read; continuing without it.`, cause)
        return fallback
      }
    }

    let loaded
    try {
      loaded = await Promise.all([
        data.listSessions(),
        data.getActiveSession(),
        data.listCheckIns(),
        data.listPhotos(),
        data.listNotificationReads(),
        data.listEarnedBadges(),
        data.listLeaderboard(),
        data.getPreferences(),
        data.getProgram(),
        data.listProgramWeeks(),
        optional(data.listGuides(), [], 'the guide library'),
        optional(data.getCohort(), null, 'the cohort'),
      ])
    } catch (cause) {
      // The member document was readable and the rest was not, so keep them:
      // being signed in is a fact worth not throwing away over a failed read,
      // and it is the difference between a reload fixing this and the member
      // having to sign in again.
      startupError.value = readMessage(cause)
      state.value = {
        ...emptyState(),
        hydrated: true,
        nowMs: trustedNow().getTime(),
        authUser,
        member,
      }
      return
    }

    const [
      sessions,
      activeSession,
      checkIns,
      photos,
      notificationReads,
      earnedBadges,
      leaderboard,
      prefs,
      program,
      weeks,
      guides,
      cohort,
    ] = loaded

    state.value = {
      hydrated: true,
      nowMs: trustedNow().getTime(),
      authUser,
      member,
      memberUnreadable: false,
      program,
      weeks,
      guides,
      cohort,
      sessions,
      activeSession,
      checkIns,
      photos,
      notificationReads,
      earnedBadges,
      leaderboard,
      // Read on the screen that shows it, not here. See `refreshCohortMemberCount`.
      cohortMemberCount: null,
      prefs,
      pendingBadge: null,
    }

    // Two badges turn on the calendar as much as on the logs ("reach Week 3
    // with…"), so their moment can arrive with no RP event to notice it. Catch
    // up quietly here: a celebration hours after the fact is worse than none.
    await syncBadges({ celebrate: false })
  }

  /** Re-read the trusted clock. Cheap, and what the midnight rollover calls. */
  const tick = () => {
    state.value.nowMs = trustedNow().getTime()
  }

  /** Refresh the offset from the network, then re-read. Never throws. */
  const refreshClock = async () => {
    await syncClock()
    tick()
  }

  // --- Derived -------------------------------------------------------------
  const authUser = computed(() => state.value.authUser)
  const member = computed(() => state.value.member)
  const profile = computed(() => state.value.member?.profile ?? null)

  /** Signed in *and* bound to a cohort. Both are needed to be in the app. */
  const isAuthenticated = computed(() => state.value.member !== null)
  const isSetupComplete = computed(() => state.value.member?.status !== 'onboarding')

  /**
   * How far through the door this visitor is.
   *
   * Auth and cohort membership are separate facts now that sign-in is an email
   * link, so "signed in" is no longer the same question as "has an account
   * here". Route middleware branches on this rather than re-deriving it.
   *
   * The three states before `needs-setup` are the ones worth keeping apart. A
   * missing member document used to mean all three at once, so a signed-in
   * member whose account simply could not be read was handed the access-code
   * prompt — the one screen with no way back to sign-in, asking for a code
   * they redeemed weeks ago and no longer have.
   */
  const gate = computed<MemberGate>(() => {
    if (!state.value.authUser) return 'needs-auth'
    if (state.value.memberUnreadable) return 'unknown'
    if (!state.value.member) return 'needs-code'
    if (state.value.member.status === 'paused') return 'paused'
    if (state.value.member.status === 'onboarding') return 'needs-setup'
    return 'ready'
  })

  /** Nobody is in the app yet, whichever of the three reasons applies. */
  const atTheDoor = computed(
    () =>
      gate.value === 'needs-auth' || gate.value === 'needs-code' || gate.value === 'unknown',
  )

  const displayName = computed(() => profile.value?.displayName?.trim() || 'there')

  /** Trusted now, as a Date. Everything date-shaped derives from this. */
  const now = computed(() => new Date(state.value.nowMs))

  /** The same instant as a `Timestamp`, for anything written to a document. */
  const nowTs = computed(() => Timestamp.fromMillis(state.value.nowMs))

  // --- Authored content ----------------------------------------------------
  const program = computed(() => state.value.program)
  const cohort = computed(() => state.value.cohort)
  const guides = computed(() => state.value.guides)
  /**
   * `cohorts/{id}/announcements`, as the listener last delivered them.
   *
   * Live rather than loaded, and fed by the inbox's listeners below. The admin
   * announces a new card with a notification, and the inbox links to the deck:
   * a deck read once at boot would not have the card the bell just announced
   * until the member happened to reload.
   */
  const announcementFeed = ref<Announcement[]>([])
  const announcements = computed(() => announcementFeed.value)

  /** The coach, off the cohort document. `null` before the cohort has loaded. */
  const coach = computed(() => state.value.cohort?.coach ?? null)

  /**
   * The weekly call, or `null` when this cohort has none set.
   *
   * Null is the common case, not an error: a cohort between blocks has no call
   * to advertise, and Home renders nothing rather than a card whose button goes
   * nowhere. Set it on the cohort document — see FIREBASE.md.
   *
   * Both halves are required here as well as in `FirestoreDataSource`, which is
   * not redundant: Home's `v-if` is the one thing standing between a member and
   * a "Join the call" button that navigates nowhere, and it should hold whatever
   * implementation answered and whatever a coach half-typed into the console.
   */
  const liveCall = computed(() => {
    const call = state.value.cohort?.liveCall
    return call?.when?.trim() && call?.joinUrl?.trim() ? call : null
  })

  /** Whether the cohort's board is switched on, and the week it was promised for. */
  const leaderboardVisible = computed(() => state.value.cohort?.leaderboardVisible === true)
  const leaderboardRevealWeek = computed(() => state.value.cohort?.leaderboardRevealWeek ?? 0)

  /** The reward economy, as authored. Empty until the program has loaded. */
  const rewardValues = computed(() => state.value.program?.rewards.values ?? null)
  const badgeDefs = computed(() => state.value.program?.rewards.badges ?? [])
  const ranks = computed(() => state.value.program?.rewards.ranks ?? [])
  const badgeTierPoints = computed(() => state.value.program?.rewards.badgeTierPoints ?? null)

  /**
   * The share of prescribed sets a session has to log to count.
   *
   * `0` means no program was read. Screens that quote it in copy check for that
   * rather than printing "at least 0% of the sets".
   */
  const qualifyingSetPercent = computed(() => state.value.program?.qualifyingSetPercent ?? 0)

  /** Guide categories, taken from the guides themselves. "All" leads. */
  const guideCategories = computed(() => [
    'All',
    ...[...new Set(state.value.guides.map((g) => g.category).filter(Boolean))].sort(),
  ])

  /** Where the challenge is today, off the dated weeks. The same for the whole cohort. */
  const clock = computed(() => challengeClock(state.value.weeks, now.value))

  /** The week today falls in, with its days. `null` until a schedule has loaded. */
  const currentWeek = computed(() => weekAt(state.value.weeks, clock.value.today))

  const targets = computed(() =>
    nutritionTargetsFor(profile.value ?? ({} as MemberProfile)),
  )

  const sessionsThisWeek = computed(() =>
    state.value.sessions.filter((s) => s.weekNumber === clock.value.week),
  )

  /**
   * Everything logged on today's date, newest first.
   *
   * No longer a gate. A member catching up on a day they missed will log two
   * sessions in one afternoon, and that is the point of catching up; what stops
   * the whole week going down in a single sitting is the calendar ceiling in
   * `days` below, not a cap on how many sessions a date may hold.
   */
  const sessionsToday = computed(() => {
    const key = dateKey(now.value)
    return state.value.sessions.filter((s) => dateKey(s.completedAt) === key)
  })

  /** The latest session logged today, if there is one. Read for copy, not gating. */
  const sessionToday = computed(() => sessionsToday.value[0] ?? null)

  /**
   * This week's training days: the ones that count toward the weekly quota.
   *
   * `optional` days — the core & cardio finisher is the one that exists — are
   * not in it. They are still resolvable by id through `getDay`, so a member
   * who opens one can log it, but they are not part of "3 of 4 sessions" and a
   * week is not incomplete for skipping one.
   */
  const planDays = computed(() => planDaysOf(currentWeek.value))

  /**
   * The plan for this week, with each day's status resolved from the log.
   *
   * `WorkoutDayView`, not `WorkoutDay`: `status` is a fact about this member's
   * sessions, so it is attached here rather than stored on content the whole
   * cohort reads.
   *
   * A plain array, where this used to be a non-empty tuple. The tuple was
   * honest about a hard-coded four-day week and is a lie about an authored one:
   * a week whose days have not been written yet has none, and the screens have
   * to be able to say so rather than index into nothing.
   */
  const days = computed<WorkoutDayView[]>(() => resolveWeek(currentWeek.value))

  /**
   * Any week's plan, resolved against the sessions logged for that week's days.
   *
   * What Train's week switcher reads. The current week is `days` itself, so
   * the list on Train and the dots on Home cannot drift apart.
   */
  const weekDays = (weekNumber: number): WorkoutDayView[] =>
    weekNumber === clock.value.week
      ? days.value
      : resolveWeek(state.value.weeks.find((w) => w.weekNumber === weekNumber) ?? null)

  function resolveWeek(week: TrainingWeek | null): WorkoutDayView[] {
    if (!week) return []
    // By the week the session was *for*, not by id alone and not by the week it
    // was logged in: ids repeat across weeks, and week 1's `day-1` caught up in
    // week 3 must not mark week 3's `day-1` done.
    const loggedIds = new Set(
      state.value.sessions
        .filter((s) => planWeekOf(s) === week.weekNumber)
        .map((s) => s.dayId),
    )
    const today = clock.value.today

    return planDaysOf(week).map((day) => {
      const opensInNights = daysBetween(today, day.date)

      if (loggedIds.has(day.id)) {
        return { ...day, status: 'completed' as const, canStart: false, opensInNights }
      }
      // Everything the calendar has reached is open: today's session, and every
      // day behind it that was never logged, in this week or any before it. A
      // missed session does not close with its week; a member who fell behind
      // in week 1 can still do week 1's sessions in week 3.
      if (opensInNights <= 0) {
        const status = opensInNights === 0 ? ('today' as const) : ('missed' as const)
        return { ...day, status, canStart: true, opensInNights }
      }
      // Ahead of them. The one thing the calendar still withholds, and the
      // reason the block cannot be finished in an afternoon.
      return { ...day, status: 'upcoming' as const, canStart: false, opensInNights }
    })
  }

  /**
   * Nothing in the plan can be started right now.
   *
   * True once every day the week has reached is logged, and on a rest day where
   * the plan schedules nothing and nothing was left behind — the two ways the
   * calendar says "not now" — so screens have one thing to ask rather than two.
   */
  const trainingLocked = computed(() => !days.value.some((d) => d.canStart))

  /**
   * The next training day whose date is still ahead, in this week or a later one.
   *
   * What the screens name when they have to say which session is next. It
   * crosses into next week, because the days are dated: a member who finished
   * the week on Friday is waiting on next Wednesday's session, and that is a
   * real document with a real date rather than this week's day 1 wrapped round.
   * `null` once the schedule has nothing left in it.
   */
  const nextUp = computed<WorkoutDayView | null>(() => {
    const inWeek = days.value.find((d) => d.status === 'upcoming')
    if (inWeek) return inWeek

    const today = clock.value.today
    for (const week of state.value.weeks) {
      if (week.weekNumber <= clock.value.week) continue
      const day = planDaysOf(week).find((d) => d.date > today)
      if (day) {
        return {
          ...day,
          status: 'upcoming' as const,
          canStart: false,
          opensInNights: daysBetween(today, day.date),
        }
      }
    }
    return null
  })

  /**
   * Local midnight on the date the next session opens.
   *
   * Not simply tomorrow. Sessions are pinned to their dates, so after Monday's
   * day 1 the next one is whenever day 2 is dated; a member on a three-day plan
   * finishing day 3 is waiting four nights, not one, and telling them "back
   * tomorrow" would be a promise the picker then breaks.
   *
   * Floored at tomorrow, because this is only ever read while nothing is open:
   * a day whose slot is today but whose session is spent opens again at
   * midnight, not now.
   */
  const nextSessionAt = computed(() => {
    const nights = Math.max(nextUp.value?.opensInNights ?? 1, 1)
    const at = startOfNextDay(now.value)
    at.setDate(at.getDate() + nights - 1)
    return at
  })

  /**
   * The session Home leads with. `null` when the program has no training days
   * authored yet.
   *
   * Today's scheduled day first. Then the earliest day still open behind it:
   * somebody who has already logged today but is a day down has one session
   * left to do this week and that is the one to lead with, not the one they
   * finished this morning. `days` arrives ordered by date, so the first match
   * is the oldest debt. Only when nothing at all is open does this fall
   * through to a day finished today, and then to the next one they are waiting
   * on.
   */
  const today = computed<WorkoutDayView | null>(
    () =>
      days.value.find((d) => d.status === 'today') ??
      days.value.find((d) => d.canStart) ??
      days.value.find((d) => d.status === 'completed' && d.opensInNights === 0) ??
      nextUp.value ??
      days.value[0] ??
      null,
  )

  /** Every session this week is logged. An empty week is not a complete one. */
  const weekComplete = computed(
    () => days.value.length > 0 && days.value.every((d) => d.status === 'completed'),
  )

  const rewardsContext = computed(() =>
    rewardsContextOf(state.value.program, state.value.weeks),
  )

  const rewards = computed(() =>
    rewardsSnapshot(
      {
        joinedAt: state.value.member?.joinedAt ?? nowTs.value,
        currentWeek: clock.value.week,
        sessions: state.value.sessions,
        checkIns: state.value.checkIns,
        photos: state.value.photos,
        earnedBadges: state.value.earnedBadges,
      },
      rewardsContext.value,
    ),
  )

  /**
   * The cohort board, ordered.
   *
   * The member's own count is taken from their live logs rather than from
   * whatever the last fetch returned, so their row moves the moment they finish
   * a session instead of on the next refresh. Everyone else's comes from the
   * fetch, because it has to.
   */
  const leaderboard = computed(() => {
    const mine = rewards.value.sessionsQualified
    const rows = state.value.leaderboard.map((row) =>
      row.isSelf ? { ...row, sessions: mine } : row,
    )
    if (!rows.some((row) => row.isSelf)) {
      rows.push({
        memberId: state.value.member?.id ?? 'me',
        name: displayName.value,
        avatarUrl: profile.value?.avatarUrl ?? '',
        sessions: mine,
        isSelf: true,
      })
    }
    return rankLeaderboard(rows)
  })

  /**
   * How many people are in this cohort, counted rather than declared.
   *
   * Chat used to render `cohort.memberCount` out of `data/program.ts`, which is
   * a fixture: every cohort, on every deploy, was told it had 48 members. The
   * `memberCount` field on the cohort document is no better a source — nothing
   * in the app writes it, so it holds whatever was typed when the cohort was
   * created and drifts from the first member who joins or leaves.
   *
   * The board projection is the roster. There is one document per member under
   * `cohorts/{id}/leaderboard`, written when they set a display name in setup,
   * and it is deleted with them on `reset()`. That also makes it exactly the
   * set of people who can be in the thread: a member who has not finished that
   * step has not reached Chat either.
   *
   * The counted answer is preferred over the board's `length` because the board
   * is one page of at most 200 rows read once at boot, and the header this
   * feeds tells a member how many people are about to read what they type. The
   * board stands in until `refreshCohortMemberCount` lands, so the header has a
   * plausible number immediately rather than a blank; `leaderboard` above
   * guarantees the viewer's own row is in that fallback whether or not the
   * fetch returned it.
   */
  const cohortMemberCount = computed(
    () => state.value.cohortMemberCount ?? leaderboard.value.length,
  )

  // --- Inbox ---------------------------------------------------------------
  //
  // Two sources, both live: the coach's notifications, and cohort chat messages
  // aimed at this member. Held outside `state` for the reason given on
  // `AppState`: they belong to a subscription, not to a load. The announcement
  // deck rides on the same listeners without being a source; see
  // `announcementFeed`.

  /** `cohorts/{id}/notifications`, as the listener last delivered them. */
  const broadcasts = ref<Notification[]>([])

  /** Cohort chat messages that name or answer this member. See `addressedUidsOf`. */
  const addressed = ref<Message[]>([])

  let stopInbox: Array<() => void> = []

  const unwatchInbox = () => {
    stopInbox.forEach((stop) => stop())
    stopInbox = []
  }

  /**
   * Open every inbox listener for `memberId`.
   *
   * Each on its own, so a failure in one leaves the others working: an index
   * that has not built yet costs the member their mentions, not their coach's
   * notifications or the deck.
   */
  const watchInbox = async (memberId: string) => {
    const subscriptions: Array<[string, () => Promise<() => void>]> = [
      [
        'coach notifications',
        () =>
          data.watchNotifications(
            (next) => {
              broadcasts.value = next
            },
            (error) => console.error('[inbox] the coach notifications listener stopped', error),
          ),
      ],
      [
        'announcements',
        () =>
          data.watchAnnouncements(
            (next) => {
              announcementFeed.value = next
            },
            (error) => console.error('[inbox] the announcements listener stopped', error),
          ),
      ],
      [
        'mentions',
        () =>
          data.watchAddressedMessages(
            (next) => {
              addressed.value = next
            },
            (error) => console.error('[inbox] the mentions listener stopped', error),
          ),
      ],
    ]

    for (const [what, subscribe] of subscriptions) {
      try {
        const stop = await subscribe()
        // Signed out, or in as somebody else, while this was resolving. Nothing
        // else would ever stop it.
        if (state.value.member?.id !== memberId) stop()
        else stopInbox.push(stop)
      } catch (cause) {
        console.error(`[inbox] could not watch ${what}`, cause)
      }
    }
  }

  /**
   * Follow the signed-in member, like the chat tab's dot does.
   *
   * Keyed on the member rather than on the auth user because every listener
   * resolves its path through the member's cohort. A re-hydrate for the same
   * member leaves them alone; a different member, or nobody, drops them and
   * what they delivered, so the next person in does not inherit an inbox.
   */
  watch(
    () => state.value.member?.id ?? null,
    (memberId) => {
      unwatchInbox()
      broadcasts.value = []
      announcementFeed.value = []
      addressed.value = []
      if (memberId) void watchInbox(memberId)
    },
    { immediate: true },
  )

  onScopeDispose(unwatchInbox)

  // --- Cohort --------------------------------------------------------------
  //
  // Loaded at boot with everything else, then followed. The admin turns the
  // leaderboard on and off, and sets the live call, on a document members
  // already have open — see `DataSource.watchCohort`. It writes straight into
  // `state.cohort` rather than a ref of its own, because unlike the inbox a
  // re-hydrate re-reads it and never leaves it empty.

  let stopCohort: (() => void) | null = null
  /** Bumped per subscription, so a slow one that resolves late cannot win. */
  let cohortWatch = 0

  const unwatchCohort = () => {
    stopCohort?.()
    stopCohort = null
  }

  watch(
    () => state.value.member?.id ?? null,
    async (memberId) => {
      unwatchCohort()
      const current = ++cohortWatch
      if (!memberId) return
      try {
        const stop = await data.watchCohort(
          (next) => {
            if (current === cohortWatch) state.value.cohort = next
          },
          // The last cohort delivered stays. A stopped listener means changes
          // arrive on the next load again, not that the board should vanish.
          (error) => console.error('[cohort] the cohort listener stopped', error),
        )
        if (current === cohortWatch) stopCohort = stop
        else stop()
      } catch (cause) {
        console.error('[cohort] could not watch the cohort', cause)
      }
    },
    { immediate: true },
  )

  onScopeDispose(() => {
    cohortWatch++
    unwatchCohort()
  })

  /**
   * The inbox, with read state and a relative label folded in.
   *
   * Both are per-reader: `read` comes from this member's own
   * `notificationState`, and the label is rendered against the trusted clock on
   * every tick rather than stored, because "2h ago" written into a document is
   * wrong within the hour.
   *
   * Mentions and replies are never pinned, so they sit in date order among the
   * coach's unpinned notifications. Each one links to its message.
   *
   * Announcements are not a source. Publishing one is not the same act as
   * notifying the cohort about it, so the admin writes a notification alongside
   * any announcement that should light the bell.
   */
  const notifications = computed<NotificationView[]>(() => {
    const viewerUid = state.value.member?.id ?? ''
    const items: Array<Notification & { to: string | null }> = [
      ...broadcasts.value.map((n) => ({ ...n, to: null })),
      ...addressed.value.map((m) => ({
        ...chatNotificationFor(m, viewerUid),
        to: `/chat?message=${encodeURIComponent(m.id)}`,
      })),
    ]
    return items
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        return b.publishedAt.toMillis() - a.publishedAt.toMillis()
      })
      .map((n) => ({
        ...n,
        read: state.value.notificationReads[n.id] !== undefined,
        timeLabel: relativeLabel(n.publishedAt, now.value),
      }))
  })

  const unreadNotifications = computed(
    () => notifications.value.filter((n) => !n.read).length,
  )

  const currentCheckIn = computed(
    () => state.value.checkIns.find((c) => c.weekNumber === clock.value.week) ?? null,
  )

  const checkInDue = computed(() => currentCheckIn.value === null)

  /**
   * No progress photo on file yet, so there is no "before" to measure against.
   *
   * Any photo lifts it, from any week and in any pose: the rule is that the
   * block starts with a picture, not that the member keeps a full set. Members
   * already training are held to it too, deliberately; there is no exemption
   * for having logged sessions before the rule existed. Home
   * leads with the card while it holds, and Start workout refuses until it
   * does not. Photos are read from the data source, not the device, so a
   * member on a new phone is not asked a second time.
   */
  const firstPhotoDue = computed(() => state.value.photos.length === 0)

  /**
   * The block's last session is logged and no photo has been taken since.
   *
   * The bookend to `firstPhotoDue`, and the last thing the block asks for. Home
   * leads with it and Saved turns its main action over to it. It locks nothing:
   * all that is left to start by then is a catch-up or the finisher, and
   * holding those back would cost the member sessions the block still counts.
   *
   * Deleting that photo brings it back. The badge stays, as every badge does,
   * but the coach is still owed the picture.
   */
  const finalPhotoDue = computed(
    () =>
      finalSessionOf(state.value.sessions, rewardsContext.value) !== null &&
      finalPhotoOf(state.value, rewardsContext.value) === null,
  )

  /** Final Photo Proof as the program authors it, for the RP its card quotes. */
  const finalPhotoBadge = computed(() => {
    const def = badgeDefs.value.find((b) => b.id === 'final-photo')
    return def ? { ...def, points: badgeTierPoints.value?.[def.tier] ?? 0 } : null
  })

  /**
   * Any authored day by id, whether or not it is part of the weekly quota.
   *
   * This week's first, because ids repeat across weeks and this week's copy is
   * the one with a status that means something today.
   *
   * `days` only carries the quota, so an optional day — the core & cardio
   * finisher — resolves from the rest of the week with a neutral status: it
   * holds no slot, so it is never "today" and the calendar has nothing to open
   * or close for it. The one rule it is under is its own: once a day. It is the
   * finisher, so it is meant to be stacked on top of a session rather than
   * counted against one, but a day that could be logged twice over would be a
   * way to farm the same session all afternoon.
   *
   * A day that exists only in another week — a week whose ids were authored
   * differently, or a session resumed across the rollover — resolves readable
   * and shut: it is not this week's to start.
   *
   * `weekNumber` asks for a particular week's copy, which is how a day picked
   * off Train's week switcher opens as itself rather than as this week's day
   * of the same id. Omitted, or naming the current week, it changes nothing.
   */
  const getDay = (id: string, weekNumber?: number): WorkoutDayView | undefined => {
    if (weekNumber !== undefined && weekNumber !== clock.value.week) {
      const picked = weekDays(weekNumber).find((d) => d.id === id)
      if (picked) return picked
    }

    const inWeek = days.value.find((d) => d.id === id)
    if (inWeek) return inWeek

    const optional = currentWeek.value?.days.find((d) => d.id === id && d.optional)
    if (optional) {
      return {
        ...optional,
        status: 'upcoming' as const,
        canStart: !sessionsToday.value.some((s) => s.dayId === id),
        opensInNights: null,
      }
    }

    const elsewhere = state.value.weeks.flatMap((w) => w.days).find((d) => d.id === id)
    if (!elsewhere) return undefined
    const opensInNights = isDateKey(elsewhere.date)
      ? daysBetween(clock.value.today, elsewhere.date)
      : null
    return {
      ...elsewhere,
      status: opensInNights !== null && opensInNights < 0 ? ('missed' as const) : ('upcoming' as const),
      canStart: false,
      opensInNights,
    }
  }

  /**
   * The week whose day the session in progress is for. `null` with none open.
   *
   * The current week for a session opened before `planWeek` was written, which
   * is the only week it could have been opened in.
   */
  const activeSessionWeek = computed(() => {
    const active = state.value.activeSession
    return active ? (active.planWeek ?? clock.value.week) : null
  })

  /**
   * Whether the session in progress is this day, in this week.
   *
   * Both halves, because ids repeat across weeks: with week 3's `day-3` half
   * logged, opening week 1's `day-3` is a different session, not a resume.
   */
  const isActiveDay = (dayId: string, weekNumber: number = clock.value.week) =>
    state.value.activeSession?.dayId === dayId && activeSessionWeek.value === weekNumber

  /**
   * What they hit last time on this exercise, shown in the "previous" column.
   * Sessions are stored newest-first, so the first match is the latest.
   *
   * Returns the raw numbers rather than a label: the column has to be able to
   * re-render in kilograms or pounds, which a baked-in string cannot do.
   */
  const previousFor = (
    exerciseId: string,
  ): { weightKg: number; reps: number } | undefined => {
    for (const session of state.value.sessions) {
      const logged = session.exercises?.find((e) => e.id === exerciseId)
      // `?.` on `sets` too: a session document written without it is not a
      // hypothetical here — the seeded sample session has no `exercises` key.
      const last = logged?.sets?.filter((s) => s.done).at(-1)
      if (last) return { weightKg: last.weightKg, reps: last.reps }
    }
    return undefined
  }

  /**
   * Every logged session that did this exercise, newest first, with only the
   * sets that were ticked done.
   *
   * Matched by exercise id across days and weeks, the same way `previousFor`
   * matches, so the history follows the lift rather than the day it sat on. A
   * session where the exercise was on the plan but no set of it was done is
   * left out: it is not history of doing the exercise.
   */
  const historyFor = (
    exerciseId: string,
  ): { log: SessionLog; exercise: LoggedExercise }[] =>
    state.value.sessions.flatMap((log) => {
      const logged = log.exercises?.find((e) => e.id === exerciseId)
      const sets = logged?.sets?.filter((s) => s.done) ?? []
      return logged && sets.length ? [{ log, exercise: { ...logged, sets } }] : []
    })

  // --- Actions: auth -------------------------------------------------------
  /**
   * Start sign-in for `email`.
   *
   * Normally that means emailing a link and resolving to `null`: the flow
   * resumes when they open it, which may be minutes later and on a different
   * device. On device there is no inbox, so the data source signs them in on
   * the spot and hands back the user — the same state `completeSignInLink`
   * would have reached, so it re-hydrates for the same reason.
   */
  const sendSignInLink = async (email: string) => {
    const user = await data.sendSignInLink(email)
    if (user) await hydrate(true)
    return user
  }

  /** Whether `sendSignInLink` signs in outright instead of emailing a link. */
  const instantSignIn = data.instantSignIn

  /** Whether the Google button has anything behind it. */
  const googleSignIn = data.googleSignIn

  /**
   * Sign in with Google.
   *
   * Resolves to `null` when the data source had to hand the page over to a
   * full-page redirect: there is no user yet and this document is about to
   * stop existing, so there is nothing to hydrate and nothing for the caller
   * to do. The other branch is a popup that came back with a user, which is
   * the same state `completeSignInLink` reaches and re-hydrates for the same
   * reason — the member document and everything derived from it belong to
   * whoever just signed in, and none of it was loaded for them.
   */
  const signInWithGoogle = async () => {
    startupError.value = ''
    const user = await data.signInWithGoogle()
    if (user) await hydrate(true)
    return user
  }

  const isSignInLink = (url: string) => data.isSignInLink(url)

  /**
   * Finish sign-in from an opened link.
   *
   * Re-hydrates rather than just setting `authUser`: the member document, their
   * logs and everything derived from them all belong to whoever just signed in,
   * and none of it was loaded for them.
   */
  const completeSignInLink = async (url: string, email?: string) => {
    const user = await data.completeSignInLink(url, email)
    await hydrate(true)
    return user
  }

  // --- Actions: membership -------------------------------------------------
  /**
   * Redeem a code and load everything that hangs off the membership it creates.
   *
   * Hydration deliberately stops at the member document when there isn't one,
   * so a visitor arriving at this call has a store at its defaults: no
   * preferences, no cohort notifications, an empty leaderboard. Setting
   * `member` alone left all of that empty for the rest of the session — the
   * board showed a cohort of one and the inbox showed nothing until the member
   * happened to reload. The full load belongs here, at the moment the paths it
   * reads through start resolving.
   */
  const redeemAccessCode = async (code: string) => {
    const account = await data.redeemAccessCode(code)
    // No `state.value.member = account` first: `hydrate` replaces the state
    // whole, so it would only be overwritten a line later. The document was
    // just committed by this client, so the read below sees it.
    await hydrate(true)
    return account
  }

  const saveProfile = async (patch: Partial<MemberProfile>) => {
    state.value.member = await data.saveProfile(patch)
  }

  const completeSetup = async () => {
    state.value.member = await data.completeSetup()
  }

  const signOut = async () => {
    await data.signOut()
    await hydrate(true)
  }

  // --- One device at a time ------------------------------------------------
  //
  // `hydrate` checks on every load. This is the other half: a device that is
  // already open when the account signs in somewhere else. Keyed on the auth
  // user rather than the member, because the account is claimed at sign-in,
  // before there is a member document.

  const nuxtApp = useNuxtApp()

  let stopDevice: (() => void) | null = null
  /** Bumped per subscription, so a slow one that resolves late cannot win. */
  let deviceWatch = 0

  const unwatchDevice = () => {
    stopDevice?.()
    stopDevice = null
  }

  /** Signed out by a later sign-in, and told why on the screen it lands on. */
  const signedInElsewhere = async () => {
    try {
      await signOut()
    } catch (cause) {
      console.error('[device] could not sign out a superseded device', cause)
    }
    // After the sign-out, because `hydrate` clears it on the way in.
    startupError.value = SIGNED_IN_ELSEWHERE
    await nuxtApp.runWithContext(() => navigateTo('/access-code', { replace: true }))
  }

  watch(
    () => state.value.authUser?.uid ?? null,
    async (uid) => {
      unwatchDevice()
      const current = ++deviceWatch
      if (!uid) return
      try {
        const stop = await data.watchDevice(
          () => {
            if (current === deviceWatch) void signedInElsewhere()
          },
          (error) => console.error('[device] the sign-in listener stopped', error),
        )
        if (current === deviceWatch) stopDevice = stop
        else stop()
      } catch (cause) {
        console.error('[device] could not watch this account’s sign-ins', cause)
      }
    },
    { immediate: true },
  )

  onScopeDispose(() => {
    deviceWatch++
    unwatchDevice()
  })

  // --- Actions: workout logging -------------------------------------------
  /**
   * Open a session for `day`, or return null if the plan does not open it today.
   *
   * The gate lives here rather than only in the screens, so a deep link into
   * `/train/<id>` cannot walk around it: `canStart` is false on every day the
   * member's calendar has not reached, so nobody starts Friday's session on
   * Tuesday and a new member cannot run the whole week off in one evening. What
   * it no longer refuses is a day left behind — that one is theirs to pick up
   * whenever they get to it.
   *
   * Two things are deliberately *not* gated. A session already in flight for
   * this day is handed back whatever the calendar now says — it may have been
   * opened before midnight — and finishing one is not gated at all, for the
   * same reason.
   */
  const startSession = async (day: WorkoutDayView) => {
    if (isActiveDay(day.id, day.weekNumber)) return state.value.activeSession
    if (!day.canStart) return null

    const session: ActiveSessionInput = {
      dayId: day.id,
      planWeek: day.weekNumber,
      startedAt: null,
      elapsedSeconds: 0,
      running: false,
      note: '',
      proofPhoto: null,
      exercises: day.exercises.map((exercise) => {
        // The same for every set of the exercise, so look it up once.
        const last = previousFor(exercise.id)
        return {
          id: exercise.id,
          name: exercise.name,
          muscleGroup: exercise.muscleGroup,
          restSeconds: exercise.restSeconds,
          note: '',
          // The bar, written down before the member touches anything. Nothing
          // they do during the session moves it.
          setsPrescribed: exercise.sets.length,
          sets: exercise.sets.map((set) => ({
            reps: set.reps,
            weightKg: set.weightKg ?? 0,
            done: false,
            added: false,
            // The plan prescribes working sets. Warm-ups, failures and drops
            // are things that happen in the gym, so they are the member's to
            // mark from the SET column once they are training.
            setType: 'normal' as const,
            previousWeightKg: last?.weightKg ?? null,
            previousReps: last?.reps ?? null,
          })),
        }
      }),
    }
    state.value.activeSession = { ...session, updatedAt: trustedTimestamp() }
    await data.setActiveSession(session)
    return state.value.activeSession
  }

  /** Persist the in-flight session so a reload mid-workout loses nothing. */
  const persistActiveSession = async () => {
    await data.setActiveSession(state.value.activeSession)
  }

  /**
   * Upload the proof shot and hang it on the in-flight session.
   *
   * The upload happens on pick rather than on finish: it is a one-time choice,
   * and a photo that only reaches storage when the member taps "finish" is one
   * that a closed tab loses along with the session it was proving.
   */
  const attachProofPhoto = async (image: ProcessedImage) => {
    if (!state.value.activeSession) return null
    const stored = await data.uploadImage(image, 'proof')
    state.value.activeSession.proofPhoto = stored
    await persistActiveSession()
    return stored
  }

  const clearProofPhoto = async () => {
    if (!state.value.activeSession) return
    state.value.activeSession.proofPhoto = null
    await persistActiveSession()
  }

  const discardSession = async () => {
    state.value.activeSession = null
    await data.setActiveSession(null)
  }

  const finishSession = async () => {
    const active = state.value.activeSession
    if (!active) return null
    const planWeek = activeSessionWeek.value ?? clock.value.week
    const day = getDay(active.dayId, planWeek)

    const setsTotal = active.exercises.reduce((n, e) => n + e.sets.length, 0)
    const setsDone = active.exercises.reduce(
      (n, e) => n + e.sets.filter((s) => s.done).length,
      0,
    )
    const volumeKg = active.exercises.reduce(
      (n, e) => n + e.sets.filter((s) => s.done).reduce((v, s) => v + s.weightKg * s.reps, 0),
      0,
    )

    // Recorded whether or not the lift portion qualified: this is the extra
    // mile, and it is deliberately outside the gate. Nothing pays out for it
    // yet — see `rewardValues.core`.
    const loggedIn = (group: string) =>
      active.exercises.some(
        (e) => e.muscleGroup.toLowerCase() === group && e.sets.some((s) => s.done),
      )

    // `weekNumber`, `qualifies` and `rewardPoints` are deliberately not sent:
    // the data source resolves them against the program's dated weeks and its
    // threshold. A client that could name its own reward points
    // could name any number, and the Firestore rules reject the attempt.
    // `planWeek` is sent, unlike those three. It earns nothing, and the data
    // source still refuses a week the calendar has not reached.
    const log = await data.saveSession({
      dayId: active.dayId,
      planWeek,
      dayNumber: day?.dayNumber ?? 0,
      label: day?.label ?? 'Workout',
      completedAt: trustedTimestamp(),
      durationSeconds: active.elapsedSeconds,
      volumeKg: Math.round(volumeKg),
      setsDone,
      setsTotal,
      proofPhoto: active.proofPhoto,
      note: active.note,
      loggedCore: loggedIn('core'),
      loggedCardio: loggedIn('cardio'),
      exercises: active.exercises,
    })

    state.value.sessions = [log, ...state.value.sessions]
    state.value.activeSession = null
    await data.setActiveSession(null)
    await syncBadges()
    return log
  }

  // --- Actions: check-ins & photos ----------------------------------------
  const saveCheckIn = async (input: CheckInInput) => {
    try {
      const record = await data.saveCheckIn(input)
      state.value.checkIns = [record, ...state.value.checkIns]
      await syncBadges()
      return record
    } catch (cause) {
      // Refused because the week is already in, sent from another device since
      // this one loaded. Pull it down so `currentCheckIn` shows what was sent
      // instead of leaving a form that can only be refused again. A failed
      // reload keeps the list as it was; the refusal is still the error.
      if (cause instanceof DataSourceError && cause.code === 'check-in-submitted') {
        await data
          .listCheckIns()
          .then((checkIns) => (state.value.checkIns = checkIns))
          .catch(() => {})
      }
      throw cause
    }
  }

  const addPhoto = async (input: { pose: PhotoPose; image: ProcessedImage }) => {
    // The upload and the document are one call: a photo in the bucket with no
    // document pointing at it is invisible, and a document pointing at nothing
    // renders as a broken tile.
    const record = await data.savePhoto(input)
    state.value.photos = [record, ...state.value.photos]
    await syncBadges()
    return record
  }

  const deletePhoto = async (id: string) => {
    await data.deletePhoto(id)
    state.value.photos = state.value.photos.filter((p) => p.id !== id)
  }

  // --- Actions: notifications & settings ----------------------------------
  const markNotificationRead = async (id: string) => {
    await data.markNotificationRead(id)
    state.value.notificationReads = {
      ...state.value.notificationReads,
      [id]: trustedTimestamp(),
    }
  }

  /** Everything in the inbox that is still unread, in one write. */
  const markAllNotificationsRead = async () => {
    const ids = notifications.value.filter((n) => !n.read).map((n) => n.id)
    if (!ids.length) return
    await data.markNotificationsRead(ids)
    const now = trustedTimestamp()
    state.value.notificationReads = {
      ...Object.fromEntries(ids.map((id) => [id, now])),
      ...state.value.notificationReads,
    }
  }

  /**
   * The member has scrolled past these cohort chat messages.
   *
   * A mention read in the thread is a mention read, and the bell should not go
   * on announcing it. Chat calls this as its read marker moves, with the
   * messages aimed at the member that just came above the fold.
   *
   * Drawn before it is written, unlike the inbox's own receipts, because the
   * caller is a scroll: a slow write would otherwise let the next scroll event
   * send the same ids again. A failure puts them back to unread, and never
   * throws — a read receipt that did not land is not the member's problem, and
   * there is no screen to tell them on.
   */
  const markChatMessagesSeen = async (messageIds: string[]) => {
    const reads = state.value.notificationReads
    const ids = messageIds.map(chatNotificationId).filter((id) => reads[id] === undefined)
    if (!ids.length) return

    const now = trustedTimestamp()
    state.value.notificationReads = {
      ...reads,
      ...Object.fromEntries(ids.map((id) => [id, now])),
    }

    try {
      await data.markNotificationsRead(ids)
    } catch (cause) {
      const rolledBack = { ...state.value.notificationReads }
      for (const id of ids) delete rolledBack[id]
      state.value.notificationReads = rolledBack
      console.error('[inbox] could not mark chat mentions read', cause)
    }
  }

  const savePreferences = async (patch: Partial<MemberPreferences>) => {
    state.value.prefs = await data.savePreferences(patch)
  }

  // --- Badges --------------------------------------------------------------
  /**
   * Award anything newly qualified and queue the first one for celebration.
   *
   * Called after every RP-earning event rather than on a timer, so the unlock
   * lands while the member is still on the screen that earned it. A badge is
   * only ever awarded once: anything already in `earnedBadges` is skipped, and
   * nothing here can take one back.
   */
  const syncBadges = async ({ celebrate = true } = {}) => {
    const alreadyEarned = state.value.earnedBadges
    const qualified = rewards.value.earned
    const fresh = qualified.filter((id) => !alreadyEarned[id])
    // Destructured rather than length-checked: `fresh[0]` below is only known to
    // be a real badge id if the compiler saw it pulled out and tested.
    const [firstFresh] = fresh
    if (!firstFresh) return

    for (const id of fresh) await data.awardBadge(id)
    // Re-read rather than patched in: the award record carries the RP the
    // badge actually paid out, at the tier rate in force when it was earned,
    // and that is the writer's to decide.
    state.value.earnedBadges = await data.listEarnedBadges()
    if (celebrate) state.value.pendingBadge = firstFresh
  }

  /** Re-read the cohort board. Refresh on load is enough for v1. */
  const refreshLeaderboard = async () => {
    state.value.leaderboard = await data.listLeaderboard()
  }

  /**
   * Re-count the roster. Called by Chat when the thread opens.
   *
   * Swallows its failure on purpose: the fallback in `cohortMemberCount` is a
   * number that was true at boot, and a header that keeps a slightly old count
   * is better than one that shows an error where a subtitle should be. The
   * cause still reaches the console.
   */
  const refreshCohortMemberCount = async () => {
    try {
      state.value.cohortMemberCount = await data.countCohortMembers()
    } catch (cause) {
      console.error('[cohort] could not count members', cause)
    }
  }

  const consumePendingBadge = () => {
    const id = state.value.pendingBadge
    state.value.pendingBadge = null
    return id ? badgeDefs.value.find((b) => b.id === id) ?? null : null
  }

  return {
    // state
    state,
    hydrated: computed(() => state.value.hydrated),
    authUser,
    member,
    profile,
    prefs: computed(() => state.value.prefs),
    sessions: computed(() => state.value.sessions),
    activeSession: computed(() => state.value.activeSession),
    checkIns: computed(() => state.value.checkIns),
    photos: computed(() => state.value.photos),
    notifications,
    earnedBadges: computed(() => state.value.earnedBadges),
    pendingBadge: computed(() => state.value.pendingBadge),

    // authored content
    program,
    cohort,
    coach,
    liveCall,
    guides,
    guideCategories,
    announcements,
    weeks: computed(() => state.value.weeks),
    currentWeek,
    planDays,
    rewardValues,
    badgeDefs,
    ranks,
    badgeTierPoints,
    qualifyingSetPercent,
    leaderboardVisible,
    leaderboardRevealWeek,

    // derived
    isAuthenticated,
    isSetupComplete,
    gate,
    atTheDoor,
    isOnboarded: computed(() => isOnboarded.value),
    markOnboarded,
    displayName,
    now,
    nowTs,
    clock,
    sessionToday,
    trainingLocked,
    nextSessionAt,
    targets,
    days,
    today,
    nextUp,
    weekComplete,
    sessionsThisWeek,
    rewards,
    leaderboard,
    cohortMemberCount,
    unreadNotifications,
    currentCheckIn,
    checkInDue,
    firstPhotoDue,
    finalPhotoDue,
    finalPhotoBadge,
    /** Sessions the whole block asks for: every quota day of every week. Zero until loaded. */
    totalSessions: computed(() =>
      state.value.weeks.reduce((n, week) => n + planDaysOf(week).length, 0),
    ),
    getDay,
    weekDays,
    activeSessionWeek,
    isActiveDay,
    previousFor,
    historyFor,

    // actions
    hydrate,
    tick,
    refreshClock,
    refreshCohortMemberCount,
    instantSignIn,
    googleSignIn,
    signInWithGoogle,
    startupError,
    sendSignInLink,
    isSignInLink,
    completeSignInLink,
    redeemAccessCode,
    saveProfile,
    completeSetup,
    signOut,
    startSession,
    persistActiveSession,
    attachProofPhoto,
    clearProofPhoto,
    discardSession,
    finishSession,
    saveCheckIn,
    addPhoto,
    deletePhoto,
    markNotificationRead,
    markAllNotificationsRead,
    markChatMessagesSeen,
    savePreferences,
    refreshLeaderboard,
    consumePendingBadge,
  }
}

type AppStore = ReturnType<typeof buildStore>

/**
 * The store, built once per app.
 *
 * `buildStore` stands up roughly thirty `computed`s, several of which walk the
 * whole session log (`rewards`, `days`, `sessionsThisWeek`). Calling it per
 * consumer, meaning every page, every component, and the global route middleware
 * on each navigation, meant a fresh un-shared computed graph each time: the same
 * derivations recomputed once per caller instead of once per change, and the
 * garbage to match. Memoising on the Nuxt instance gives every caller the same
 * refs, so a value is recomputed only when its dependencies actually change.
 *
 * The build runs inside a detached `effectScope`, so the computeds belong to
 * the app rather than to whichever component happened to ask first, because otherwise
 * unmounting that component would dispose the store out from under everyone
 * else.
 */
export const useAppStore = (): AppStore => {
  const nuxtApp = useNuxtApp()
  const existing = nuxtApp.$appStore as AppStore | undefined
  if (existing) return existing

  const scope = effectScope(true)
  const store = scope.run(buildStore)!
  nuxtApp.$appStore = store
  // Tear the graph down when this module is hot-replaced.
  //
  // This used to be `nuxtApp.hook('app:unmounted', ...)`, which never fired:
  // there is no such runtime hook in Nuxt, so the scope was never stopped. In a
  // browser that costs nothing — the app only ever goes away with the page,
  // which takes the whole graph with it. Dev HMR is the case that actually
  // leaked: without this, every edit left the previous store's computeds live
  // and recomputing alongside their replacement.
  import.meta.hot?.dispose(() => scope.stop())
  return store
}

declare module '#app' {
  interface NuxtApp {
    $appStore?: AppStore
  }
}
