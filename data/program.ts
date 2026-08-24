// =============================================================================
// Program content: authored, not earned.
//
// This is everything the coach defines: the cohort, the 6-week plan, the guide
// library, the badge and rank ladders, the inbox seed. Member-owned data (their
// logs, check-ins, photos) never lives here. See `lib/datasource`.
//
// When a backend arrives this file becomes the response of `GET /program`.
// =============================================================================
import type {
  Announcement,
  AppNotification,
  BadgeDef,
  Coach,
  Cohort,
  Exercise,
  Guide,
  Rank,
  TrainingFeel,
  WorkoutDay,
} from './types'

// --- Cohort & coach --------------------------------------------------------
export const coach: Coach = {
  id: 'coach-dp',
  name: 'Coach Dayo',
  title: 'Head Coach · DP Fitness',
  avatar:
    'https://images.unsplash.com/photo-1594381898411-846e7d193883?w=200&q=80',
}

export const cohort: Cohort = {
  id: 'cohort-01',
  name: 'Cohort 01',
  memberCount: 48,
  coach,
}

// --- Challenge shape -------------------------------------------------------
export const challenge = {
  name: '6-Week Recomp Challenge',
  totalWeeks: 6,
  totalDays: 42,
  sessionsPerWeek: 4,
  get totalSessions() {
    return this.totalWeeks * this.sessionsPerWeek
  },
}

export const weekThemes = [
  { weekNumber: 1, title: 'Foundation', subtitle: 'Dial in form & baseline loads' },
  { weekNumber: 2, title: 'Build', subtitle: 'Add volume, own the tempo' },
  { weekNumber: 3, title: 'Overload', subtitle: 'Push intensity, prove the work' },
  { weekNumber: 4, title: 'Peak', subtitle: 'Heaviest loads of the block' },
  { weekNumber: 5, title: 'Refine', subtitle: 'Sharpen weak points' },
  { weekNumber: 6, title: 'Prove It', subtitle: 'Final push & photos' },
]

/** Access codes that redeem into this cohort. */
export const accessCodes = ['DP-RECOMP-01']

/** How training felt, offered as a choice on the weekly check-in. */
export const trainingFeelOptions: { id: TrainingFeel; label: string; desc: string }[] = [
  { id: 'too-easy', label: 'Too easy', desc: 'You had plenty left in the tank.' },
  { id: 'just-right', label: 'Just right', desc: 'Hard, but every set was clean.' },
  { id: 'too-hard', label: 'Too hard', desc: 'Form or recovery started slipping.' },
]

// --- Reward economy --------------------------------------------------------
export const rewardValues = {
  workout: 25,
  checkIn: 20,
  progressPhoto: 10,
}

export const ranks: Rank[] = [
  { id: 'new-entry', name: 'New Entry', emoji: '🌱', minPoints: 0 },
  { id: 'in-progress', name: 'In Progress', emoji: '⚡', minPoints: 40 },
  { id: 'building-momentum', name: 'Building Momentum', emoji: '💫', minPoints: 100 },
  { id: 'overload-mode', name: 'Overload Mode', emoji: '🔥', minPoints: 200 },
  { id: 'peak-performer', name: 'Peak Performer', emoji: '🏆', minPoints: 350 },
]

export const badges: BadgeDef[] = [
  {
    id: 'first-workout',
    name: 'First Rep',
    emoji: '💪',
    description: 'Log your first qualifying workout.',
  },
  {
    id: 'first-photo',
    name: 'Photo Proof',
    emoji: '📸',
    description: 'Upload your first progress photo.',
  },
  {
    id: 'all-days-once',
    name: 'Consistency Queen',
    emoji: '👑',
    description: 'Log all 4 training days at least once.',
  },
  {
    id: 'checkin-streak-4',
    name: 'Check-In Streak',
    emoji: '📋',
    description: 'Submit a weekly check-in 4 weeks in a row.',
  },
  {
    id: 'week3-8-sessions',
    name: 'Foundation Complete',
    emoji: '🏁',
    description: 'Reach Week 3 with 8+ sessions logged.',
  },
  {
    id: 'week6-20-sessions',
    name: 'Peak Performer',
    emoji: '🏆',
    description: 'Reach Week 6 with 20+ sessions logged.',
  },
  {
    id: 'no-week-missed',
    name: 'No Days Off',
    emoji: '🔥',
    description: 'Every week of the program, no week missed.',
  },
]

// --- Training plan ---------------------------------------------------------
const sets = (n: number, reps: number, weightKg?: number) =>
  Array.from({ length: n }, () => ({ reps, weightKg, done: false }))

const lowerStrength: Exercise[] = [
  {
    id: 'ex-goblet-squat',
    name: 'Goblet Squat',
    muscleGroup: 'Quads',
    targetSets: 4,
    targetReps: '8-10',
    restSeconds: 90,
    cues: ['Heels planted, chest tall.', 'Sit between the hips.', 'Two-second descent.'],
    sets: sets(4, 10, 16),
  },
  {
    id: 'ex-romanian-deadlift',
    name: 'Romanian Deadlift',
    muscleGroup: 'Hamstrings',
    targetSets: 4,
    targetReps: '8-10',
    restSeconds: 90,
    cues: ['Hinge, don’t squat.', 'Bar stays close to the legs.'],
    sets: sets(4, 10, 30),
  },
  {
    id: 'ex-split-squat',
    name: 'Bulgarian Split Squat',
    muscleGroup: 'Glutes',
    targetSets: 3,
    targetReps: '10 each',
    restSeconds: 75,
    cues: ['Front shin vertical.', 'Drive through the whole foot.'],
    sets: sets(3, 10, 10),
  },
  {
    id: 'ex-calf-raise',
    name: 'Standing Calf Raise',
    muscleGroup: 'Calves',
    targetSets: 3,
    targetReps: '12-15',
    restSeconds: 45,
    cues: ['Full stretch at the bottom.', 'Pause at the top.'],
    sets: sets(3, 15, 20),
  },
]

const upperPush: Exercise[] = [
  {
    id: 'ex-incline-db-press',
    name: 'Incline Dumbbell Press',
    muscleGroup: 'Chest',
    targetSets: 4,
    targetReps: '8-10',
    restSeconds: 90,
    cues: ['Set the bench to ~30°.', 'Elbows at 45°.', 'Control the eccentric for 2 seconds.'],
    sets: sets(4, 10, 14),
  },
  {
    id: 'ex-shoulder-press',
    name: 'Seated Shoulder Press',
    muscleGroup: 'Shoulders',
    targetSets: 3,
    targetReps: '10-12',
    restSeconds: 75,
    cues: ['Brace the core.', 'Press just in front of the ears.'],
    sets: sets(3, 12, 10),
  },
  {
    id: 'ex-cable-fly',
    name: 'Cable Chest Fly',
    muscleGroup: 'Chest',
    targetSets: 3,
    targetReps: '12-15',
    restSeconds: 60,
    cues: ['Soft elbows.', 'Squeeze for a beat at the front.'],
    sets: sets(3, 14, 7),
  },
  {
    id: 'ex-tricep-pushdown',
    name: 'Triceps Rope Pushdown',
    muscleGroup: 'Triceps',
    targetSets: 3,
    targetReps: '12-15',
    restSeconds: 60,
    cues: ['Pin the elbows.', 'Spread the rope at the bottom.'],
    sets: sets(3, 15, 20),
  },
]

const upperPull: Exercise[] = [
  {
    id: 'ex-lat-pulldown',
    name: 'Lat Pulldown',
    muscleGroup: 'Back',
    targetSets: 4,
    targetReps: '8-10',
    restSeconds: 90,
    cues: ['Lead with the elbows.', 'Chest to the bar, not the bar to the chest.'],
    sets: sets(4, 10, 32),
  },
  {
    id: 'ex-seated-row',
    name: 'Seated Cable Row',
    muscleGroup: 'Back',
    targetSets: 4,
    targetReps: '10-12',
    restSeconds: 75,
    cues: ['Squeeze the shoulder blades.', 'No torso swing.'],
    sets: sets(4, 12, 30),
  },
  {
    id: 'ex-face-pull',
    name: 'Face Pull',
    muscleGroup: 'Rear delts',
    targetSets: 3,
    targetReps: '12-15',
    restSeconds: 60,
    cues: ['Pull to the forehead.', 'External rotation at the end.'],
    sets: sets(3, 15, 15),
  },
  {
    id: 'ex-db-curl',
    name: 'Dumbbell Curl',
    muscleGroup: 'Biceps',
    targetSets: 3,
    targetReps: '10-12',
    restSeconds: 60,
    cues: ['Elbows pinned to the ribs.', 'Slow on the way down.'],
    sets: sets(3, 12, 8),
  },
]

const lowerPosterior: Exercise[] = [
  {
    id: 'ex-leg-press',
    name: 'Leg Press',
    muscleGroup: 'Quads',
    targetSets: 4,
    targetReps: '10-12',
    restSeconds: 90,
    cues: ['Feet mid-platform.', 'Stop just short of lockout.'],
    sets: sets(4, 12, 80),
  },
  {
    id: 'ex-hip-thrust',
    name: 'Hip Thrust',
    muscleGroup: 'Glutes',
    targetSets: 4,
    targetReps: '10-12',
    restSeconds: 90,
    cues: ['Ribs down.', 'Squeeze hard at the top for a beat.'],
    sets: sets(4, 12, 40),
  },
  {
    id: 'ex-leg-curl',
    name: 'Seated Leg Curl',
    muscleGroup: 'Hamstrings',
    targetSets: 3,
    targetReps: '12-15',
    restSeconds: 60,
    cues: ['Toes pulled up.', 'Control the return.'],
    sets: sets(3, 15, 25),
  },
  {
    id: 'ex-leg-extension',
    name: 'Leg Extension',
    muscleGroup: 'Quads',
    targetSets: 3,
    targetReps: '12-15',
    restSeconds: 60,
    cues: ['Pause at the top.', 'No swinging.'],
    sets: sets(3, 15, 30),
  },
]

export const coreCardioExercises: Exercise[] = [
  {
    id: 'ex-plank',
    name: 'Weighted Plank',
    muscleGroup: 'Core',
    targetSets: 3,
    targetReps: '45s',
    restSeconds: 45,
    cues: ['Glutes tight.', 'Neutral neck.'],
    sets: sets(3, 1),
  },
  {
    id: 'ex-dead-bug',
    name: 'Dead Bug',
    muscleGroup: 'Core',
    targetSets: 3,
    targetReps: '10 each',
    restSeconds: 45,
    cues: ['Low back stays flat.', 'Exhale as you extend.'],
    sets: sets(3, 10),
  },
  {
    id: 'ex-bike',
    name: 'Assault Bike Intervals',
    muscleGroup: 'Cardio',
    targetSets: 5,
    targetReps: '30s on / 30s off',
    restSeconds: 30,
    cues: ['Full effort on the work interval.'],
    sets: sets(5, 1),
  },
]

/**
 * The training week. `status` is computed per member from their logs. The
 * value here is only the default for a week nobody has touched yet.
 */
export const planDays: WorkoutDay[] = [
  {
    id: 'day-1',
    dayNumber: 1,
    label: 'Lower (Quad Focus)',
    focus: 'Lower',
    estMinutes: 45,
    estKcal: 160,
    status: 'upcoming',
    proofRequired: true,
    exercises: lowerStrength,
  },
  {
    id: 'day-2',
    dayNumber: 2,
    label: 'Upper (Push Focus)',
    focus: 'Upper · Push',
    estMinutes: 40,
    estKcal: 140,
    status: 'upcoming',
    proofRequired: true,
    exercises: upperPush,
  },
  {
    id: 'day-3',
    dayNumber: 3,
    label: 'Lower (Posterior Focus)',
    focus: 'Lower · Posterior',
    estMinutes: 42,
    estKcal: 150,
    status: 'upcoming',
    proofRequired: true,
    exercises: lowerPosterior,
  },
  {
    id: 'day-4',
    dayNumber: 4,
    label: 'Upper (Pull Focus)',
    focus: 'Upper · Pull',
    estMinutes: 48,
    estKcal: 175,
    status: 'upcoming',
    proofRequired: true,
    exercises: upperPull,
  },
]

export const coreCardioDay: WorkoutDay = {
  id: 'core-cardio',
  dayNumber: 5,
  label: 'Core & Cardio',
  focus: 'Finisher',
  estMinutes: 20,
  estKcal: 90,
  status: 'upcoming',
  proofRequired: false,
  exercises: coreCardioExercises,
}

// --- Guide library ---------------------------------------------------------
export const guideCategories = ['All', 'Training', 'Recovery', 'Main Training Program', 'Core']

export const guides: Guide[] = [
  {
    id: 'guide-warm-up',
    title: 'Warm-Up Guide',
    category: 'Training',
    readMinutes: 2,
    unlockWeek: 1,
    locked: false,
    excerpt: 'Four steps that get you ready to lift without burning the session.',
    body: [
      '5 minutes easy cardio: bike, row or brisk walk, just enough to break a light sweat.',
      'Dynamic mobility for the joints you are about to load: hips and ankles on lower days, shoulders and thoracic spine on upper days.',
      'Two activation sets: glute bridges or band pull-aparts, 12 reps, no load worth counting.',
      'Two ramp-up sets on your first exercise at roughly 50% and 75% of your working weight.',
    ].join('\n\n'),
  },
  {
    id: 'guide-core',
    title: 'Core Workout Guide',
    category: 'Core',
    readMinutes: 3,
    unlockWeek: 1,
    locked: false,
    excerpt: 'Bracing beats crunching. Five steps to a core that holds up under load.',
    body: [
      'Train the core to resist movement before you train it to create movement.',
      'Anti-extension first: dead bugs or planks, 3 sets, stop when the low back lifts.',
      'Anti-rotation second: Pallof press, 3 sets of 10 each side, slow and quiet.',
      'Add load before you add reps. A 45-second plank with weight beats a 3-minute one without.',
      'Finish with breathing: 5 slow exhales lying down, ribs pulled toward the hips.',
    ].join('\n\n'),
  },
  {
    id: 'guide-cardio',
    title: 'Cardio Guide',
    category: 'Training',
    readMinutes: 2,
    unlockWeek: 1,
    locked: false,
    excerpt: 'How much, how hard, and when it starts eating your recovery.',
    body: [
      'Two to three sessions a week is plenty alongside four lifting days.',
      'Keep most of it conversational. You should be able to speak in full sentences.',
      'Save intervals for the day after a rest day, never before a heavy lower session.',
    ].join('\n\n'),
  },
  {
    id: 'guide-stretch',
    title: 'Dynamic Stretch Guide',
    category: 'Recovery',
    readMinutes: 2,
    unlockWeek: 1,
    locked: false,
    excerpt: 'Move through range instead of hanging in it.',
    body: [
      'Leg swings, 10 each direction per leg, controlled and not thrown.',
      'World’s greatest stretch, 5 each side, pausing at the rotation.',
      'Cat-cow into thoracic rotations, 8 slow rounds.',
      'Save the long static holds for after training or a rest day.',
    ].join('\n\n'),
  },
  {
    id: 'guide-overload',
    title: 'Progressive Overload Guide',
    category: 'Main Training Program',
    readMinutes: 2,
    unlockWeek: 3,
    locked: true,
    excerpt: 'The rule that turns four weeks of effort into visible change.',
    body: [
      'Add reps before you add weight. Top of the rep range on every set, then go up.',
      'Increase load by the smallest increment available, usually 2.5kg on compounds.',
      'Leave one to two reps in reserve on your first working set of the day.',
      'If a session drops off two weeks running, that is a recovery problem, not a programming one.',
    ].join('\n\n'),
  },
]

// --- Inbox seed ------------------------------------------------------------
// Coach-authored messages. Read state is member-owned and stored separately.
export const notificationSeed: Omit<AppNotification, 'read'>[] = [
  {
    id: 'notif-call-moved',
    type: 'coach',
    title: 'Pinned announcement',
    body: 'Live call moves to Wednesday 7pm, same link. See you there 💗',
    time: '2h ago',
    icon: 'bell',
  },
  {
    id: 'notif-live-call',
    type: 'coach',
    title: 'Live call today',
    body: 'Tuesdays · 7:00 PM WAT. Recorded and posted to Cohort Chat if you miss it.',
    time: 'Starts soon',
    icon: 'phone',
  },
  {
    id: 'notif-cohort-note',
    type: 'community',
    title: 'Cohort chat',
    body: 'Coach Dayo left a note in Cohort Chat for Week 3.',
    time: '2h ago',
    icon: 'chat',
  },
  {
    id: 'notif-schedule-change',
    type: 'coach',
    title: 'Update',
    body: 'The Saturday call time changed. Check the pinned announcement.',
    time: '1d ago',
    icon: 'info',
  },
]

// --- Announcement deck -----------------------------------------------------
export const announcements: Announcement[] = [
  {
    id: 'a1',
    eyebrow: 'Overload week',
    title: 'Proof is required this week',
    body: 'Upload a photo after every session to keep your streak and points alive.',
    cta: 'View today’s workout',
    accent: 'rose',
  },
  {
    id: 'a2',
    eyebrow: 'Live call',
    title: 'Q&A with Coach Dayo · Sat 10am',
    body: 'Bring your form questions. Replay available if you miss it.',
    cta: 'Add to calendar',
    accent: 'orange',
  },
  {
    id: 'a3',
    eyebrow: 'Cohort milestone',
    title: 'Cohort 01 logged 900 sessions 🎉',
    body: 'You’re officially the most consistent cohort so far. Keep it going.',
    accent: 'ink',
  },
]

// --- Cohort leaderboard ----------------------------------------------------
// Everyone but the member; their own row is spliced in from their real RP so
// the ranking always reflects what they have actually earned.
export const leaderboardPeers = [
  { id: 'peer-tomi', name: 'Tomi A.', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&q=80', points: 310 },
  { id: 'peer-lola', name: 'Lola B.', avatar: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=100&q=80', points: 265 },
  { id: 'peer-zainab', name: 'Zainab O.', avatar: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=100&q=80', points: 220 },
  { id: 'peer-ife', name: 'Ife K.', avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=100&q=80', points: 155 },
  { id: 'peer-chi', name: 'Chidi N.', avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=100&q=80', points: 90 },
  { id: 'peer-ada', name: 'Ada M.', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&q=80', points: 45 },
]
