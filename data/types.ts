// =============================================================================
// Data contracts for DP Fitness.
// These interfaces double as the shape of the mock data AND the intended
// Firestore document shapes, so swapping the `data/*` modules for Firebase
// reads later requires no changes to components.
// =============================================================================

export interface Member {
  id: string
  firstName: string
  lastName: string
  email: string
  avatar: string
  cohortId: string
  challenge: {
    name: string // e.g. "6-Week Recomp Challenge"
    week: number // current week (1..6)
    totalWeeks: number
    dayInChallenge: number // e.g. 7
    totalDays: number // e.g. 42
    phase: string // e.g. "Overload"
    startDate: string // ISO
  }
  streakDays: number
  trophies: number
  // profile / setup answers
  profile: {
    age: number
    gender: string
    heightCm: number
    weightKg: number
    startWeightKg: number
    goal: string // "Recomp" | "Fat loss" | "Muscle gain"
    activityLevel: string
    trainingDaysPerWeek: number
    injuries: string
    onboardingCallBooked: boolean
  }
}

export interface Cohort {
  id: string
  name: string // "Cohort 01"
  memberCount: number
  coach: Coach
}

export interface Coach {
  id: string
  name: string
  title: string
  avatar: string
}

// --- Training --------------------------------------------------------------
export interface ExerciseSet {
  reps: number
  weightKg?: number
  done: boolean
}

export interface Exercise {
  id: string
  name: string
  muscleGroup: string // "Chest", "Legs", ...
  targetSets: number
  targetReps: string // "8-10"
  restSeconds: number
  videoThumb?: string
  cues: string[]
  sets: ExerciseSet[]
}

export interface WorkoutDay {
  id: string
  dayNumber: number // day of the week program (1..n)
  label: string // "Upper · Push Focus"
  focus: string // "Upper · Push"
  estMinutes: number
  estKcal: number
  /** `locked`: the next session in the plan, but today's is already logged. */
  status: 'completed' | 'today' | 'upcoming' | 'rest' | 'locked'
  proofRequired: boolean
  exercises: Exercise[]
}

export interface Week {
  weekNumber: number
  title: string // "Overload"
  subtitle: string
  sessionsLogged: number
  sessionsTotal: number
  locked: boolean
  days: WorkoutDay[]
}

// --- Nutrition -------------------------------------------------------------
export interface Macro {
  label: string // "Protein"
  current: number
  target: number
  unit: string // "g"
  color: string
}

export interface Meal {
  id: string
  name: string
  time: string // "Breakfast"
  kcal: number
  protein: number
  image?: string
  logged: boolean
  swappable: boolean
}

export interface NutritionDay {
  date: string
  kcalTarget: number
  kcalConsumed: number
  waterMl: number
  waterTargetMl: number
  macros: Macro[]
  meals: Meal[]
}

// --- Progress / check-in ---------------------------------------------------
export interface CheckIn {
  id: string
  weekNumber: number
  submittedAt: string | null
  weightKg: number | null
  energyRating: number | null // 1..5
  sleepRating: number | null
  adherenceRating: number | null
  note: string
}

export interface ProgressPhoto {
  id: string
  weekNumber: number
  url: string
  pose: 'front' | 'side' | 'back'
  takenAt: string
}

// --- Community / chat ------------------------------------------------------
/** A photo or file shared into a thread. */
export interface ChatAttachment {
  id: string
  /** Images render inline; everything else renders as a downloadable chip. */
  kind: 'image' | 'file'
  name: string
  /** Original file size in bytes, before any downscaling. */
  size: number
  mimeType: string
  /** A data URL on device; a served URL once a backend stores the upload. */
  url: string
}

/** One emoji on one message, with how many people have picked it. */
export interface ChatReaction {
  emoji: string
  count: number
  /** True when the signed-in member is one of those people. */
  mine?: boolean
}

export interface ChatMessage {
  id: string
  authorId: string
  authorName: string
  authorAvatar: string
  isCoach: boolean
  isSelf: boolean
  text: string
  sentAt: string
  attachments?: ChatAttachment[]
  reactions?: ChatReaction[]
}

export interface ChatThread {
  id: string
  type: 'cohort' | 'coach'
  title: string
  messages: ChatMessage[]
}

// --- Rewards ---------------------------------------------------------------
export interface Badge {
  id: string
  name: string
  description: string
  icon: string
  earned: boolean
  earnedAt?: string
  progress?: { current: number; total: number }
}

export interface RewardTier {
  id: string
  name: string // "Building Momentum", "Overload Mode", "Peak Performer"
  minPoints: number
  achieved: boolean
}

export interface LeaderboardEntry {
  rank: number
  memberId: string
  name: string
  avatar: string
  points: number
  isSelf: boolean
}

export interface RewardsState {
  points: number
  pointsToNextTier: number
  currentTier: string
  tiers: RewardTier[]
  badges: Badge[]
  leaderboard: LeaderboardEntry[]
}

// --- Program guides --------------------------------------------------------
export interface Guide {
  id: string
  title: string
  category: string
  readMinutes: number
  unlockWeek: number
  locked: boolean
  excerpt: string
  body: string
}

// --- Notifications ---------------------------------------------------------
export interface AppNotification {
  id: string
  type: 'workout' | 'coach' | 'reward' | 'community' | 'checkin'
  title: string
  body: string
  time: string
  read: boolean
  icon: string
}

// --- Home announcements ----------------------------------------------------
export interface Announcement {
  id: string
  eyebrow: string
  title: string
  body: string
  cta?: string
  accent: 'rose' | 'orange' | 'ink'
}

// =============================================================================
// Persisted app state
//
// Everything below is *member-owned* data: it is created by the member as they
// use the app, and it round-trips through `lib/datasource`. Content types above
// describe the *program* (the plan, the guides) which is authored, not earned.
// =============================================================================

export type Units = 'kg' | 'lb'
export type Goal = 'recomp' | 'fat-loss' | 'muscle-gain'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very'
export type Sex = 'female' | 'male' | 'other'

export interface MemberProfile {
  displayName: string
  age: number | null
  sex: Sex | ''
  heightCm: number | null
  weightKg: number | null
  startWeightKg: number | null
  activity: ActivityLevel | ''
  goal: Goal | ''
  trainingDaysPerWeek: number
  allergies: string
  injuries: string
  callSlot: string
  avatar: string
}

/** The signed-in member. `null` in storage means signed out. */
export interface MemberAccount {
  id: string
  accessCode: string
  cohortId: string
  joinedAt: string // ISO. The challenge clock starts here
  setupComplete: boolean
  profile: MemberProfile
}

// --- Workout logging -------------------------------------------------------
export interface LoggedSet {
  reps: number
  weightKg: number
  done: boolean
  /**
   * Set by the member during the session rather than by the plan.
   *
   * The prescribed sets are the workout; removing one would quietly change what
   * was asked for, so only the extras a member adds themselves can be taken
   * back off. Absent on sets logged before this existed, which is the safe
   * reading: treat them as prescribed.
   */
  added?: boolean
  /**
   * What they lifted last time, for reference while logging. Kept as numbers
   * so the column can be re-rendered in whichever unit is selected.
   */
  previousWeightKg?: number
  previousReps?: number
  /**
   * The same reference, pre-formatted. Only written by builds that predate
   * switchable units, and still read so a session logged back then keeps
   * showing its previous column.
   * @deprecated use `previousWeightKg` / `previousReps`
   */
  previous?: string
}

export interface LoggedExercise {
  id: string
  name: string
  muscleGroup: string
  restSeconds: number
  note: string
  sets: LoggedSet[]
}

/** A workout in progress. Persisted so a reload mid-session loses nothing. */
export interface ActiveSession {
  dayId: string
  startedAt: string | null
  elapsedSeconds: number
  running: boolean
  exercises: LoggedExercise[]
  note: string
  proofPhoto: string | null
}

export interface SessionLog {
  id: string
  dayId: string
  dayNumber: number
  label: string
  weekNumber: number
  completedAt: string
  durationSeconds: number
  volumeKg: number
  setsDone: number
  setsTotal: number
  proofPhoto: string | null
  note: string
  rewardPoints: number
  /** What was actually logged, kept so the next session can show "previous". */
  exercises: LoggedExercise[]
}

// --- Check-ins & photos ----------------------------------------------------
export type TrainingFeel = 'too-easy' | 'just-right' | 'too-hard'

export interface CheckInRecord {
  id: string
  weekNumber: number
  submittedAt: string
  /** Sessions they say they completed: their count, not ours. */
  workoutsDone: number
  /** Self-rated nutrition adherence, 0 to 100. */
  nutritionPct: number
  energy: number | null // 1..5
  trainingFeel: TrainingFeel | null
  pain: string
  note: string
  rewardPoints: number
}

export interface PhotoRecord {
  id: string
  weekNumber: number
  pose: 'front' | 'side' | 'back'
  dataUrl: string
  takenAt: string
}

// --- Settings --------------------------------------------------------------
export interface Settings {
  units: Units
  workoutReminders: boolean
  coachMessages: boolean
  weeklyCheckInReminder: boolean
}

// --- Rewards (program-authored definitions, member-earned state) -----------
export interface Rank {
  id: string
  name: string
  emoji: string
  minPoints: number
}

export type BadgeRuleId =
  | 'first-workout'
  | 'first-photo'
  | 'all-days-once'
  | 'checkin-streak-4'
  | 'week3-8-sessions'
  | 'week6-20-sessions'
  | 'no-week-missed'

export interface BadgeDef {
  id: BadgeRuleId
  name: string
  emoji: string
  description: string
}

export interface EarnedBadge {
  id: BadgeRuleId
  earnedAt: string
}

// --- Nutrition targets (computed from the profile) -------------------------
export interface NutritionTargets {
  bmr: number
  activityMultiplier: number
  goalMultiplier: number
  kcalTarget: number
  proteinG: number
  fatG: number
  carbsG: number
  approach: string
  plateStructure: string
}
