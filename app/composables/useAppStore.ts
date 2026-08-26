import { Timestamp } from 'firebase/firestore'

import { useDataSourceClient } from '~/lib/datasource'
import type { ActiveSessionInput, CheckInInput } from '~/lib/datasource'
import { defaultPreferences } from '~/lib/datasource/local'
import { challengeClock } from '~/lib/domain/challenge'
import { nutritionTargetsFor } from '~/lib/domain/nutrition'
import { rankLeaderboard, rewardsSnapshot } from '~/lib/domain/rewards'
import {
  dateKey,
  relativeLabel,
  restoreClock,
  startOfNextDay,
  syncClock,
  trustedNow,
  trustedTimestamp,
} from '~/lib/time'
import { badges as badgeDefs, challenge, coreCardioDay, planDays } from '~/data/program'
import type { ProcessedImage } from '~/lib/image'
import type {
  ActiveSessionDoc,
  AuthUser,
  BadgeRuleId,
  ChatAttachment,
  CheckIn,
  EarnedBadge,
  LeaderboardEntry,
  Member,
  MemberGate,
  MemberPreferences,
  MemberProfile,
  Notification,
  NotificationView,
  PhotoPose,
  ProgressPhoto,
  SessionLog,
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
  sessions: SessionLog[]
  activeSession: ActiveSessionDoc | null
  checkIns: CheckIn[]
  photos: ProgressPhoto[]
  notifications: Notification[]
  /** Notification id → when this member read it. Absent means unread. */
  notificationReads: Record<string, Timestamp>
  /** Badge id → award record. */
  earnedBadges: Record<string, EarnedBadge>
  /** The cohort, as the last load saw it. Never ordered here: see `rankLeaderboard`. */
  leaderboard: LeaderboardEntry[]
  prefs: MemberPreferences
  /** Badge waiting to be celebrated, consumed by the celebration screen. */
  pendingBadge: BadgeRuleId | null
}

/**
 * The app's single store.
 *
 * Everything a screen needs comes from here: state loaded through the data
 * source, derived values from `lib/domain`, and actions that write back. No
 * component reads storage or fetches directly.
 */
const buildStore = () => {
  const data = useDataSourceClient()

  const state = useState<AppState>('app-store', () => ({
    hydrated: false,
    nowMs: Date.now(),
    authUser: null,
    member: null,
    sessions: [],
    activeSession: null,
    checkIns: [],
    photos: [],
    notifications: [],
    notificationReads: {},
    earnedBadges: {},
    leaderboard: [],
    prefs: defaultPreferences(),
    pendingBadge: null,
  }))

  // --- Loading -------------------------------------------------------------
  const hydrate = async (force = false) => {
    if (state.value.hydrated && !force) return
    // Cheap and synchronous: the offset from the last session, so the first
    // paint already has the right date. The network sync lands later.
    restoreClock()
    const [
      authUser,
      member,
      sessions,
      activeSession,
      checkIns,
      photos,
      notifications,
      notificationReads,
      earnedBadges,
      leaderboard,
      prefs,
    ] = await Promise.all([
      data.getAuthUser(),
      data.getMember(),
      data.listSessions(),
      data.getActiveSession(),
      data.listCheckIns(),
      data.listPhotos(),
      data.listNotifications(),
      data.listNotificationReads(),
      data.listEarnedBadges(),
      data.listLeaderboard(),
      data.getPreferences(),
    ])

    state.value = {
      hydrated: true,
      nowMs: trustedNow().getTime(),
      authUser,
      member,
      sessions,
      activeSession,
      checkIns,
      photos,
      notifications,
      notificationReads,
      earnedBadges,
      leaderboard,
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
   */
  const gate = computed<MemberGate | null>(() => {
    if (!state.value.member) return 'needs-code'
    if (state.value.member.status === 'paused') return 'paused'
    if (state.value.member.status === 'onboarding') return 'needs-setup'
    return 'ready'
  })

  const displayName = computed(() => profile.value?.displayName?.trim() || 'there')

  /** Trusted now, as a Date. Everything date-shaped derives from this. */
  const now = computed(() => new Date(state.value.nowMs))

  /** The same instant as a `Timestamp`, for anything written to a document. */
  const nowTs = computed(() => Timestamp.fromMillis(state.value.nowMs))

  const clock = computed(() =>
    challengeClock(state.value.member?.joinedAt ?? nowTs.value, now.value),
  )

  const targets = computed(() =>
    nutritionTargetsFor(profile.value ?? ({} as MemberProfile)),
  )

  const sessionsThisWeek = computed(() =>
    state.value.sessions.filter((s) => s.weekNumber === clock.value.week),
  )

  /**
   * The session already logged on today's date, if there is one.
   *
   * The plan is one session a day. Without this the four days of a week can all
   * be logged back to back in a single sitting, which is not training, and it
   * makes the previous-session column meaningless from week two onwards.
   */
  const sessionToday = computed(() => {
    const key = dateKey(now.value)
    return state.value.sessions.find((s) => dateKey(s.completedAt) === key) ?? null
  })

  /** No further sessions until tomorrow. */
  const trainingLocked = computed(() => sessionToday.value !== null)

  /** Local midnight after today, when the next session opens up. */
  const nextSessionAt = computed(() => startOfNextDay(now.value))

  /**
   * The plan for this week, with each day's status resolved from the log.
   *
   * `WorkoutDayView`, not `WorkoutDay`: `status` is a fact about this member's
   * sessions, so it is attached here rather than stored on content the whole
   * cohort reads.
   */
  const days = computed<[WorkoutDayView, ...WorkoutDayView[]]>(() => {
    const loggedIds = new Set(sessionsThisWeek.value.map((s) => s.dayId))
    const locked = trainingLocked.value
    let markedNext = false
    // `planDays` is a non-empty tuple and `map` is length-preserving, but the
    // signature widens it back to a plain array, so the tuple is restated here
    // rather than asserted at each of the reads downstream.
    return planDays.map((day) => {
      if (loggedIds.has(day.id)) return { ...day, status: 'completed' as const }
      // Every remaining day locks, not just the next one: the rule is one
      // session a day, so skipping ahead to day 4 is the same spam by another
      // route. Screens single out the first of them as the one that opens next.
      if (locked) return { ...day, status: 'locked' as const }
      if (!markedNext) {
        markedNext = true
        return { ...day, status: 'today' as const }
      }
      return { ...day, status: 'upcoming' as const }
    }) as [WorkoutDayView, ...WorkoutDayView[]]
  })

  /** The next session waiting on them, which is what Home leads with. */
  const today = computed<WorkoutDayView>(
    () =>
      days.value.find((d) => d.status === 'today' || d.status === 'locked') ?? days.value[0],
  )

  const weekComplete = computed(() => days.value.every((d) => d.status === 'completed'))

  const rewards = computed(() =>
    rewardsSnapshot({
      joinedAt: state.value.member?.joinedAt ?? nowTs.value,
      currentWeek: clock.value.week,
      sessions: state.value.sessions,
      checkIns: state.value.checkIns,
      photos: state.value.photos,
      earnedBadges: state.value.earnedBadges,
    }),
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
   * The inbox, with read state and a relative label folded in.
   *
   * Both are per-reader: `read` comes from this member's own
   * `notificationState`, and the label is rendered against the trusted clock on
   * every tick rather than stored, because "2h ago" written into a document is
   * wrong within the hour.
   */
  const notifications = computed<NotificationView[]>(() =>
    [...state.value.notifications]
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        return b.publishedAt.toMillis() - a.publishedAt.toMillis()
      })
      .map((n) => ({
        ...n,
        read: state.value.notificationReads[n.id] !== undefined,
        timeLabel: relativeLabel(n.publishedAt, now.value),
      })),
  )

  const unreadNotifications = computed(
    () => notifications.value.filter((n) => !n.read).length,
  )

  const currentCheckIn = computed(
    () => state.value.checkIns.find((c) => c.weekNumber === clock.value.week) ?? null,
  )

  const checkInDue = computed(() => currentCheckIn.value === null)

  const getDay = (id: string): WorkoutDayView | undefined =>
    id === coreCardioDay.id
      ? { ...coreCardioDay, status: 'upcoming' as const }
      : days.value.find((d) => d.id === id)

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
      const last = logged?.sets.filter((s) => s.done).at(-1)
      if (last) return { weightKg: last.weightKg, reps: last.reps }
    }
    return undefined
  }

  // --- Actions: auth -------------------------------------------------------
  /**
   * Start email-link sign-in. The flow resumes when they open the link, which
   * may be minutes later and on a different device.
   */
  const sendSignInLink = async (email: string) => {
    await data.sendSignInLink(email)
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
  const redeemAccessCode = async (code: string) => {
    const account = await data.redeemAccessCode(code)
    state.value.member = account
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

  // --- Actions: workout logging -------------------------------------------
  /**
   * Open a session for `day`, or return null if today's is already logged.
   *
   * The gate lives here rather than only in the screens, so a deep link into
   * `/train/<id>` cannot walk around it. Finishing is deliberately *not* gated:
   * a session opened before midnight has to be able to close after it.
   */
  const startSession = async (day: WorkoutDayView) => {
    if (trainingLocked.value && state.value.activeSession?.dayId !== day.id) return null

    const session: ActiveSessionInput = {
      dayId: day.id,
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
          sets: exercise.sets.map((set) => ({
            reps: set.reps,
            weightKg: set.weightKg ?? 0,
            done: false,
            added: false,
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
    const day = getDay(active.dayId)

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
    // the data source resolves them against the member's join date and their
    // program's threshold. A client that could name its own reward points
    // could name any number, and the Firestore rules reject the attempt.
    const log = await data.saveSession({
      dayId: active.dayId,
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
    const record = await data.saveCheckIn(input)
    state.value.checkIns = [
      record,
      ...state.value.checkIns.filter((c) => c.weekNumber !== record.weekNumber),
    ]
    await syncBadges()
    return record
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

  const markAllNotificationsRead = async () => {
    await data.markAllNotificationsRead()
    const now = trustedTimestamp()
    state.value.notificationReads = {
      ...Object.fromEntries(state.value.notifications.map((n) => [n.id, now])),
      ...state.value.notificationReads,
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

  const consumePendingBadge = () => {
    const id = state.value.pendingBadge
    state.value.pendingBadge = null
    return id ? badgeDefs.find((b) => b.id === id) ?? null : null
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

    // derived
    isAuthenticated,
    isSetupComplete,
    gate,
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
    weekComplete,
    sessionsThisWeek,
    rewards,
    leaderboard,
    unreadNotifications,
    currentCheckIn,
    checkInDue,
    totalSessions: computed(() => challenge.totalSessions),
    getDay,
    previousFor,

    // actions
    hydrate,
    tick,
    refreshClock,
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
