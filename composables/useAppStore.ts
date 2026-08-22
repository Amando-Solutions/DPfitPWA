import { useDataSourceClient } from '~/lib/datasource'
import { defaultSettings } from '~/lib/datasource/local'
import { challengeClock, weekOf } from '~/lib/domain/challenge'
import { nutritionTargetsFor } from '~/lib/domain/nutrition'
import { rewardsSnapshot } from '~/lib/domain/rewards'
import {
  badges as badgeDefs,
  challenge,
  coreCardioDay,
  planDays,
  rewardValues,
} from '~/data/program'
import type {
  ActiveSession,
  AppNotification,
  BadgeRuleId,
  CheckInRecord,
  MemberAccount,
  MemberProfile,
  PhotoRecord,
  SessionLog,
  Settings,
  WorkoutDay,
} from '~/data/types'

interface AppState {
  hydrated: boolean
  member: MemberAccount | null
  sessions: SessionLog[]
  activeSession: ActiveSession | null
  checkIns: CheckInRecord[]
  photos: PhotoRecord[]
  notifications: AppNotification[]
  earnedBadges: Record<string, string>
  settings: Settings
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
  ;(globalThis as any).__buildCount = ((globalThis as any).__buildCount ?? 0) + 1
  const data = useDataSourceClient()

  const state = useState<AppState>('app-store', () => ({
    hydrated: false,
    member: null,
    sessions: [],
    activeSession: null,
    checkIns: [],
    photos: [],
    notifications: [],
    earnedBadges: {},
    settings: defaultSettings(),
    pendingBadge: null,
  }))

  // --- Loading -------------------------------------------------------------
  const hydrate = async (force = false) => {
    if (state.value.hydrated && !force) return
    const [member, sessions, activeSession, checkIns, photos, notifications, earnedBadges, settings] =
      await Promise.all([
        data.getMember(),
        data.listSessions(),
        data.getActiveSession(),
        data.listCheckIns(),
        data.listPhotos(),
        data.listNotifications(),
        data.listEarnedBadges(),
        data.getSettings(),
      ])

    state.value = {
      hydrated: true,
      member,
      sessions,
      activeSession,
      checkIns,
      photos,
      notifications,
      earnedBadges,
      settings,
      pendingBadge: null,
    }
  }

  // --- Derived -------------------------------------------------------------
  const member = computed(() => state.value.member)
  const profile = computed(() => state.value.member?.profile ?? null)
  const isAuthenticated = computed(() => state.value.member !== null)
  const isSetupComplete = computed(() => state.value.member?.setupComplete === true)

  const displayName = computed(() => profile.value?.displayName?.trim() || 'there')

  const clock = computed(() =>
    challengeClock(state.value.member?.joinedAt ?? new Date().toISOString()),
  )

  const targets = computed(() =>
    nutritionTargetsFor(profile.value ?? ({} as MemberProfile)),
  )

  const sessionsThisWeek = computed(() =>
    state.value.sessions.filter((s) => s.weekNumber === clock.value.week),
  )

  /** The plan for this week, with each day's status resolved from the log. */
  const days = computed<WorkoutDay[]>(() => {
    const loggedIds = new Set(sessionsThisWeek.value.map((s) => s.dayId))
    let markedToday = false
    return planDays.map((day) => {
      if (loggedIds.has(day.id)) return { ...day, status: 'completed' as const }
      if (!markedToday) {
        markedToday = true
        return { ...day, status: 'today' as const }
      }
      return { ...day, status: 'upcoming' as const }
    })
  })

  /** The next session waiting on them — what Home leads with. */
  const today = computed<WorkoutDay>(
    () => days.value.find((d) => d.status === 'today') ?? days.value[0],
  )

  const weekComplete = computed(() => days.value.every((d) => d.status === 'completed'))

  const rewards = computed(() =>
    rewardsSnapshot({
      joinedAt: state.value.member?.joinedAt ?? new Date().toISOString(),
      currentWeek: clock.value.week,
      sessions: state.value.sessions,
      checkIns: state.value.checkIns,
      photos: state.value.photos,
      earnedBadges: state.value.earnedBadges,
    }),
  )

  const unreadNotifications = computed(
    () => state.value.notifications.filter((n) => !n.read).length,
  )

  const currentCheckIn = computed(
    () => state.value.checkIns.find((c) => c.weekNumber === clock.value.week) ?? null,
  )

  const checkInDue = computed(() => currentCheckIn.value === null)

  const getDay = (id: string): WorkoutDay | undefined =>
    id === coreCardioDay.id ? coreCardioDay : days.value.find((d) => d.id === id)

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
  const startSession = async (day: WorkoutDay) => {
    const session: ActiveSession = {
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
            previousWeightKg: last?.weightKg,
            previousReps: last?.reps,
          })),
        }
      }),
    }
    state.value.activeSession = session
    await data.setActiveSession(session)
    return session
  }

  /** Persist the in-flight session so a reload mid-workout loses nothing. */
  const persistActiveSession = async () => {
    await data.setActiveSession(state.value.activeSession)
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

    const completedAt = new Date().toISOString()
    const log = await data.saveSession({
      dayId: active.dayId,
      dayNumber: day?.dayNumber ?? 0,
      label: day?.label ?? 'Workout',
      weekNumber: weekOf(state.value.member?.joinedAt ?? completedAt, completedAt),
      completedAt,
      durationSeconds: active.elapsedSeconds,
      volumeKg: Math.round(volumeKg),
      setsDone,
      setsTotal,
      proofPhoto: active.proofPhoto,
      note: active.note,
      rewardPoints: rewardValues.workout,
      exercises: active.exercises,
    })

    state.value.sessions = [log, ...state.value.sessions]
    state.value.activeSession = null
    await data.setActiveSession(null)
    await syncBadges()
    return log
  }

  // --- Actions: check-ins & photos ----------------------------------------
  const saveCheckIn = async (input: {
    workoutsDone: number
    nutritionPct: number
    energy: number | null
    trainingFeel: number | null
    pain: string
    note: string
  }) => {
    const record = await data.saveCheckIn({
      ...input,
      weekNumber: clock.value.week,
      submittedAt: new Date().toISOString(),
      rewardPoints: rewardValues.checkIn,
    })
    state.value.checkIns = [
      record,
      ...state.value.checkIns.filter((c) => c.weekNumber !== record.weekNumber),
    ]
    await syncBadges()
    return record
  }

  const addPhoto = async (input: { pose: PhotoRecord['pose']; dataUrl: string }) => {
    const record = await data.savePhoto({
      ...input,
      weekNumber: clock.value.week,
      takenAt: new Date().toISOString(),
    })
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
    state.value.notifications = state.value.notifications.map((n) =>
      n.id === id ? { ...n, read: true } : n,
    )
  }

  const markAllNotificationsRead = async () => {
    await data.markAllNotificationsRead()
    state.value.notifications = state.value.notifications.map((n) => ({ ...n, read: true }))
  }

  const saveSettings = async (patch: Partial<Settings>) => {
    state.value.settings = await data.saveSettings(patch)
  }

  // --- Badges --------------------------------------------------------------
  /** Award anything newly qualified and queue the first one for celebration. */
  const syncBadges = async () => {
    const alreadyEarned = state.value.earnedBadges
    const qualified = rewards.value.earned
    const fresh = qualified.filter((id) => !alreadyEarned[id])
    if (!fresh.length) return

    const earnedAt = new Date().toISOString()
    for (const id of fresh) await data.awardBadge(id, earnedAt)
    state.value.earnedBadges = {
      ...alreadyEarned,
      ...Object.fromEntries(fresh.map((id) => [id, earnedAt])),
    }
    state.value.pendingBadge = fresh[0]
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
    member,
    profile,
    settings: computed(() => state.value.settings),
    sessions: computed(() => state.value.sessions),
    activeSession: computed(() => state.value.activeSession),
    checkIns: computed(() => state.value.checkIns),
    photos: computed(() => state.value.photos),
    notifications: computed(() => state.value.notifications),
    earnedBadges: computed(() => state.value.earnedBadges),
    pendingBadge: computed(() => state.value.pendingBadge),

    // derived
    isAuthenticated,
    isSetupComplete,
    displayName,
    clock,
    targets,
    days,
    today,
    weekComplete,
    sessionsThisWeek,
    rewards,
    unreadNotifications,
    currentCheckIn,
    checkInDue,
    totalSessions: computed(() => challenge.totalSessions),
    getDay,
    previousFor,

    // actions
    hydrate,
    redeemAccessCode,
    saveProfile,
    completeSetup,
    signOut,
    startSession,
    persistActiveSession,
    discardSession,
    finishSession,
    saveCheckIn,
    addPhoto,
    deletePhoto,
    markNotificationRead,
    markAllNotificationsRead,
    saveSettings,
    consumePendingBadge,
  }
}

type AppStore = ReturnType<typeof buildStore>

/**
 * The store, built once per app.
 *
 * `buildStore` stands up roughly thirty `computed`s, several of which walk the
 * whole session log (`rewards`, `days`, `sessionsThisWeek`). Calling it per
 * consumer — every page, every component, and the global route middleware on
 * each navigation — meant a fresh, un-shared computed graph each time: the same
 * derivations recomputed once per caller instead of once per change, and the
 * garbage to match. Memoising on the Nuxt instance gives every caller the same
 * refs, so a value is recomputed only when its dependencies actually change.
 *
 * The build runs inside a detached `effectScope`, so the computeds belong to
 * the app rather than to whichever component happened to ask first — otherwise
 * unmounting that component would dispose the store out from under everyone
 * else.
 */
export const useAppStore = (): AppStore => {
  ;(globalThis as any).__callCount = ((globalThis as any).__callCount ?? 0) + 1
  const nuxtApp = useNuxtApp()
  const existing = nuxtApp.$appStore as AppStore | undefined
  if (existing) return existing

  const scope = effectScope(true)
  const store = scope.run(buildStore)!
  nuxtApp.$appStore = store
  // Tear the graph down with the app (matters for HMR and for tests, which
  // create and discard app instances in the same process).
  nuxtApp.hook('app:unmounted', () => scope.stop())
  return store
}

declare module '#app' {
  interface NuxtApp {
    $appStore?: AppStore
  }
}
