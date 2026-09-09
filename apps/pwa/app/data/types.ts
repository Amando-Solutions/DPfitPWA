// =============================================================================
// Firestore document contracts for DP Fitness.
//
// Every interface below is the *stored* shape of a document, field for field.
// The app handles `WithId<T>`: Firestore keeps the document id on the snapshot
// rather than in the body, so writes use the bare `…Doc` type and reads add the
// id back. Nothing here is a UI shape — anything a screen computes per member
// (a day's status, whether a guide is unlocked, whether a message is your own)
// lives in the "view" section at the bottom and is never persisted.
//
// Three rules the whole file follows, all of them Firestore constraints:
//
//   1. Instants are `Timestamp`, never ISO strings. Server-written instants use
//      `serverTimestamp()`, so the clock is Google's rather than the device's,
//      which is the same reason `lib/time.ts` exists.
//   2. There is no `undefined` in Firestore. An absent value is `null`, so no
//      field on a document type is optional.
//   3. Documents cap at 1 MiB. Anything binary (progress photos, chat
//      attachments) lives in Cloud Storage and the document holds the path.
//
// Collection paths are noted above each group.
// =============================================================================
import type { Timestamp } from 'firebase/firestore'

/**
 * A document as the app receives it: the stored fields plus the snapshot id.
 *
 * Writes take the bare `…Doc` so an id can never be persisted into the body
 * and drift from the real one.
 */
export type WithId<T> = T & { id: string }

// --- Audit -----------------------------------------------------------------
// Every admin-authored document carries both blocks. The email is denormalised
// alongside the uid deliberately: an audit trail that needs a second lookup to
// read is one nobody reads.

export interface CreatedBy {
  createdAt: Timestamp
  createdByUid: string
  createdByEmail: string
}

export interface UpdatedBy {
  updatedAt: Timestamp
  updatedByUid: string
  updatedByEmail: string
}

export interface Audited extends CreatedBy, UpdatedBy {}

// =============================================================================
// Access codes — `accessCodes/{code}`
//
// Keyed by the code itself, so redemption is a single `getDoc` and uniqueness
// is enforced by the database rather than by a query.
// =============================================================================

export interface AccessCodeBase extends CreatedBy, UpdatedBy {
  /** Mirrors the document id. Format: `DPF-XXXX-XXXX`. */
  code: string
  batchId: string
  cohortId: string
  cohortName: string
  expiresAt: Timestamp
  /**
   * The purchase email this code was issued against, if it was issued to a
   * known buyer.
   *
   * Members sign in by email link, so the address is known *before* the code is
   * entered. Binding the two lets redemption reject a code that was forwarded
   * to somebody else. `null` for codes handed out generically.
   */
  issuedToEmail: string | null
  /**
   * The WhatsApp number the buyer registered with, carried here so it survives
   * the gap between registering and signing in.
   *
   * It is not a second credential — nothing checks it, and redemption turns on
   * `issuedToEmail` alone. It rides on the code because that is the only
   * document that exists between the landing form and the member: the number
   * is copied into `MemberProfile.whatsapp` at redemption, and without this it
   * would be stranded in `registrations/{code}`, which the member cannot read.
   *
   * `null` for a code issued by hand, where nobody asked for a number. Every
   * code the landing site issues has one, because the form requires it.
   *
   * Sits at the same sensitivity as `issuedToEmail`, which is already here: a
   * contact detail readable by whoever knows the code, and the code is the
   * secret. It is deliberately absent from the claim rule's `hasOnly` list, so
   * redeeming a code cannot rewrite the number it was issued against.
   */
  issuedToWhatsapp: string | null
}

/**
 * The claim state, as a union rather than six independently nullable fields.
 *
 * The original shape allowed `status: 'unused'` alongside a populated
 * `claimedAt`, which is not a state a code can actually be in, and left no
 * status at all for a code that had been redeemed. Modelling it this way means
 * a claimed code cannot be written without its claimant, and narrowing on
 * `status` gives you the rest for free.
 */
export type AccessCodeClaim =
  | {
      status: 'unused'
      claimedByUid: null
      claimedByName: null
      claimedAt: null
      revokedAt: null
    }
  | {
      status: 'claimed'
      claimedByUid: string
      claimedByName: string
      claimedAt: Timestamp
      revokedAt: null
    }
  | {
      /** Revocable before or after a claim, so the claim fields stay open. */
      status: 'revoked'
      claimedByUid: string | null
      claimedByName: string | null
      claimedAt: Timestamp | null
      revokedAt: Timestamp
    }

export type AccessCodeDoc = AccessCodeBase & AccessCodeClaim
export type AccessCode = WithId<AccessCodeDoc>

// =============================================================================
// Registrations — `registrations/{reference}`
//
// One attempt to buy a seat, from the moment the landing form is submitted.
// Written by `apps/web/server/api/register.post.ts` on the Admin SDK and
// completed by `api/payment/webhook` when Selar reports the sale.
//
// Keyed by a reference the landing site generates before the buyer is sent to
// Selar. That ordering is the point: the document is what a payment is later
// matched *back* to, so it cannot be keyed by anything the payment produces —
// including the access code, which does not exist yet and deliberately is not
// minted until money has moved.
//
// Selar has no field for that reference, so the match is made on the email
// address instead. A sale that matches nothing lands in `unmatchedSales`
// rather than being dropped.
//
// It exists separately from `AccessCodeDoc` because a code is a seat and this
// is a person mid-purchase: the time zone decides which live-call slot they are
// pointed at, the WhatsApp number is how they get into the group chat, and the
// payment fields are a record nobody should have to reconstruct from Selar's
// dashboard. The number is the one field that travels onward — onto the code as
// `issuedToWhatsapp`, and from there into `MemberProfile.whatsapp` — because
// the member needs it and cannot read this.
//
// No client writes here, ever. See `firestore.rules`.
// =============================================================================

/** Where a registration came from. One value today; named so it can grow. */
export type RegistrationSource = 'landing'

/**
 * Where a registration is in the one flow it has.
 *
 * `pending` is written before the buyer is sent to Selar, and is the state
 * anyone who abandons checkout is left in — a real and common outcome, not an
 * error. `paid` is set when Selar's sale notification arrives.
 *
 * `failed` is now never written by anything. Under Paystack it recorded a
 * verification that came back as something other than a success; Selar has no
 * verification call and only ever announces sales that happened, so there is
 * nothing to record. It stays in the union because documents written by the
 * old flow still carry it.
 */
export type RegistrationPaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded'

export interface RegistrationDoc {
  /** Mirrors the document id. Ours alone — Selar never sees it. */
  reference: string
  /**
   * The access code, once one exists.
   *
   * `null` until the sale arrives, which is the whole shape of the flow: no
   * money, no code. Writing it is also what makes fulfilment idempotent — a
   * notification can be delivered twice or replayed by hand, and whichever run
   * is second finds this already set and stops.
   */
  code: string | null
  fullName: string
  /** Lower-cased, matching `issuedToEmail` on the code. */
  email: string
  /** As typed. Not normalised to E.164 — see `MemberProfile.whatsapp`. */
  whatsapp: string
  /** Free text: "Lagos, WAT". A human answer, because it picks a call slot. */
  timezone: string
  cohortId: string
  source: RegistrationSource
  paymentStatus: RegistrationPaymentStatus
  /** Which checkout took the money. `undefined` on documents from before Selar. */
  provider?: 'selar'
  /**
   * Minor units — kobo for NGN. What the page advertised, not what arrived.
   *
   * The distinction is new with Selar and it is real: the price lives in
   * Selar's dashboard and is converted into the buyer's own currency at
   * checkout, so a member paying from London is charged in pounds. This pair
   * is the promise; `paidAmountMinor` and `paidCurrency` are what happened.
   */
  amountMinor: number
  currency: string
  /** What Selar reported taking. `null` until the sale arrives. */
  paidAmountMinor?: number | null
  paidCurrency?: string | null
  /** Selar's own purchase code — the handle their dashboard search understands. */
  saleReference?: string | null
  /** From the sale notification: 'card', 'bank_transfer', … when it says. */
  paymentChannel: string | null
  paidAt: Timestamp | null
  /** Whether the access-code email went out. False is worth being able to find. */
  emailed: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}

export type Registration = WithId<RegistrationDoc>

// =============================================================================
// Cohorts — `cohorts/{cohortId}`
// =============================================================================

/** The coach, denormalised onto the cohort. Shown on nearly every screen. */
export interface CoachRef {
  uid: string
  name: string
  title: string
  avatarUrl: string
}

/**
 * The weekly live call, set by the coach on the cohort document.
 *
 * One time for the whole cohort: there are no slots to assign, no attendance
 * to record and nothing to mark as done, so every member sees the same card
 * every week. `null` on the cohort means there is no call this block, and Home
 * renders nothing rather than a card with a dead button — which is the whole
 * reason this is a nullable object rather than two nullable strings. A `when`
 * with no `joinUrl` is not a state anybody should have to render.
 */
export interface LiveCall {
  /** As it reads on the card, e.g. "Tuesday, 7:00 PM WAT". Carries its own zone. */
  when: string
  /** Zoom, Meet, whatever the coach uses. Opened in a new tab. */
  joinUrl: string
}

export interface CohortDoc extends Audited {
  name: string
  status: 'draft' | 'active' | 'archived'
  startDate: Timestamp
  /**
   * Stored rather than derived from `startDate + durationWeeks`, because
   * "which cohorts are still running" is a range query and Firestore cannot
   * compute one side of it.
   */
  endDate: Timestamp
  durationWeeks: number
  /** IANA zone, e.g. `Africa/Lagos`. The day boundary every gate uses. */
  timezone: string
  memberCount: number
  coach: CoachRef
  programId: string | null
  programName: string | null
  programVersion: number | null
  archivedAt: Timestamp | null
  /**
   * The weekly call, or `null` when this cohort has none. Set from the console
   * — see FIREBASE.md — and read on Home, which renders no card at all when it
   * is absent.
   */
  liveCall: LiveCall | null
  /**
   * Whether the cohort leaderboard is visible to members yet.
   *
   * Off for the opening weeks on purpose. Ranking people before they have a
   * couple of weeks of habit behind them turns "did I show up" into "am I
   * winning". The board is computed and written the whole time regardless, so
   * flipping this on later reveals a full history rather than starting at zero.
   *
   * Per cohort rather than per program: it is a decision about *these* members
   * and when they are ready for it, and a coach has to be able to move it
   * without re-versioning the plan everyone is training against.
   */
  leaderboardVisible: boolean
  /** The week it is meant to appear in, used only for the reveal notice. */
  leaderboardRevealWeek: number
}

export type Cohort = WithId<CohortDoc>

// =============================================================================
// Programs — `programs/{programId}`
//
// Authored content, versioned. A cohort pins `programVersion` so editing a
// published program cannot retroactively change what a running cohort was
// prescribed.
// =============================================================================

export interface WeekTheme {
  weekNumber: number
  /** "Overload" */
  title: string
  /** "Push intensity, prove the work" */
  subtitle: string
}

/** What each action pays out, in reward points. */
export interface RewardValues {
  workout: number
  checkIn: number
  progressPhoto: number
  core: number
  cardio: number
}

export type BadgeTier = 'starter' | 'consistency' | 'elite'

export type BadgeRuleId =
  | 'first-workout'
  | 'first-photo'
  | 'consistency-queen'
  | 'checkin-streak-4'
  | 'foundation-complete'
  | 'peak-performer'
  | 'no-days-off'

export interface BadgeDef {
  id: BadgeRuleId
  name: string
  emoji: string
  description: string
  tier: BadgeTier
}

export interface Rank {
  id: string
  name: string
  emoji: string
  minPoints: number
}

/** The numbers behind the badge conditions. See `lib/domain/rewards`. */
export interface BadgeTargets {
  dayRepeats: number
  checkInWeeks: number
  foundationWeek: number
  foundationSessions: number
  peakWeek: number
  peakSessions: number
}

/**
 * The reward economy, authored with the program rather than compiled into the
 * client, so a cohort can be re-tuned without shipping a build.
 */
export interface RewardConfig {
  values: RewardValues
  badgeTierPoints: Record<BadgeTier, number>
  badgeTargets: BadgeTargets
  ranks: Rank[]
  badges: BadgeDef[]
}

export interface ProgramDoc extends Audited {
  name: string
  version: number
  status: 'draft' | 'published'
  totalWeeks: number
  totalDays: number
  sessionsPerWeek: number
  /**
   * The share of a session's *prescribed* sets that has to be logged for the
   * session to earn anything. The gate the whole reward system hangs off.
   */
  qualifyingSetPercent: number
  /** How many documents are in the `workoutDays` subcollection. */
  workoutDayCount: number
  weekThemes: WeekTheme[]
  rewards: RewardConfig
  publishedAt: Timestamp | null
}

export type Program = WithId<ProgramDoc>

// --- Workout days -------------- `programs/{programId}/workoutDays/{dayId}` --

/** One prescribed set. No `done` flag: completion is member state, not plan. */
export interface PrescribedSet {
  reps: number
  weightKg: number | null
}

export interface Exercise {
  id: string
  name: string
  /** "Chest", "Quads", "Core", "Cardio". Matched case-insensitively. */
  muscleGroup: string
  targetSets: number
  /** Free text, because "8-10", "10 each" and "30s on / 30s off" all occur. */
  targetReps: string
  restSeconds: number
  videoThumbUrl: string | null
  cues: string[]
  sets: PrescribedSet[]
}

export interface WorkoutDayDoc extends Audited {
  /** Position in the training week, 1-based. */
  dayNumber: number
  /** "Upper (Push Focus)" */
  label: string
  /** "Upper · Push" */
  focus: string
  /**
   * The photograph behind this day's card on Home.
   *
   * Authored with the day and uploaded to Cloud Storage like any other image
   * the product holds, rather than bundled into the client: it is content the
   * coach owns and swaps per block, not a design asset. `null` renders the
   * brand gradient on its own, which is a complete card — nothing on it depends
   * on the photograph being there.
   */
  heroImage: StoredImage | null
  estimatedMinutes: number
  estimatedKcal: number
  proofRequired: boolean
  /** Not part of the weekly quota. The core & cardio finisher is the case. */
  optional: boolean
  /** 1 to 20 items. */
  exercises: Exercise[]
}

export type WorkoutDay = WithId<WorkoutDayDoc>

// --- Guides ----------------------- `programs/{programId}/guides/{guideId}` --

export interface GuideDoc extends Audited {
  title: string
  category: string
  readMinutes: number
  /** Hidden until the member reaches this challenge week. */
  unlockWeek: number
  excerpt: string
  body: string
}

export type Guide = WithId<GuideDoc>

// =============================================================================
// Members — `members/{uid}`
//
// Keyed by the Firebase Auth uid, so `id` *is* the uid and security rules are
// `request.auth.uid == memberId` with no lookup. Members sign in with an email
// link; the access code is redeemed after sign-in and binds them to a cohort.
// =============================================================================

export type Units = 'kg' | 'lb'
/**
 * How height is *shown*. Like `Units`, it never changes what is stored:
 * `MemberProfile.heightCm` is centimetres whichever way this is set.
 */
export type HeightUnits = 'cm' | 'ft'
export type Goal = 'recomp' | 'fat-loss' | 'muscle-gain'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very'
/**
 * Two values, because the calorie baseline has exactly two equations to pick
 * between (see `lib/domain/nutrition`). A third option here would have to fall
 * back to one of these anyway, which is a worse answer than asking.
 */
export type Sex = 'female' | 'male'

/** Setup answers. Empty string and `null` both mean "not answered yet". */
export interface MemberProfile {
  displayName: string
  /**
   * How the coach reaches this member outside the app.
   *
   * Stored on the member rather than left on the access code because it is a
   * property of the person, not of the seat they bought: the code is claimed
   * once and then historical, while the number changes and has to be editable.
   * Seeded from `AccessCodeBase.issuedToWhatsapp` at redemption.
   *
   * Empty string when nobody asked — a code issued by hand in the console
   * never went through the landing form. Not validated here beyond being a
   * string; the landing form and the profile screen each check the shape, and
   * a number that is wrong in a way a regex accepts is a support conversation
   * rather than something the schema can catch.
   */
  whatsapp: string
  age: number | null
  sex: Sex | ''
  heightCm: number | null
  weightKg: number | null
  startWeightKg: number | null
  activity: ActivityLevel | ''
  goal: Goal | ''
  trainingDaysPerWeek: number
  /**
   * Anything medical the coach should train around: conditions, medication,
   * dietary restrictions. Replaced the narrower `allergies` field, which only
   * ever collected a subset of what members actually needed to tell us.
   */
  healthConditions: string
  injuries: string
  avatarUrl: string
}

/** Member-set preferences. Embedded: too small to justify its own read. */
export interface MemberPreferences {
  units: Units
  /** Set once during setup, alongside `units`. Display only. */
  heightUnits: HeightUnits
  workoutReminders: boolean
  coachMessages: boolean
  weeklyCheckInReminder: boolean
}

/**
 * Denormalised counters, written by the same server-side transaction that
 * writes a session or check-in.
 *
 * The leaderboard is one ordered query over this cohort's members. Without
 * these it would be a read of every member's entire session subcollection,
 * which is not a query Firestore can answer at any size.
 *
 * Everything here is recomputable from the logs; `lib/domain/rewards` remains
 * the definition, and these are a cache of it.
 */
export interface MemberStats {
  sessionsLogged: number
  sessionsQualified: number
  checkInsSubmitted: number
  photosUploaded: number
  points: number
  streakWeeks: number
  lastSessionAt: Timestamp | null
}

export type MemberStatus = 'onboarding' | 'active' | 'paused' | 'completed'

export interface MemberDoc extends UpdatedBy {
  /** From Firebase Auth. The address the sign-in link was sent to. */
  email: string
  emailVerified: boolean
  status: MemberStatus
  /** What to return to on resume. Only set while `status === 'paused'`. */
  previousStatus: Exclude<MemberStatus, 'paused'> | null
  pauseReason: string | null
  pausedAt: Timestamp | null
  cohortId: string
  cohortName: string
  programId: string
  programVersion: number
  /** The code they redeemed. One member, one code. */
  accessCode: string
  /** When the challenge clock starts for this member. */
  joinedAt: Timestamp
  profile: MemberProfile
  prefs: MemberPreferences
  stats: MemberStats
  createdAt: Timestamp
}

export type Member = WithId<MemberDoc>

// --- Lifecycle events -------------- `members/{uid}/lifecycleEvents/{eventId}`
//
// Append-only. Nothing reads these to decide anything; they exist so a coach
// can answer "why has she not logged since week 2" without guessing.

export type LifecycleEventType =
  | 'member.joined'
  | 'member.paused'
  | 'member.resumed'
  | 'member.completed'

export interface LifecycleEventDoc extends CreatedBy {
  memberId: string
  type: LifecycleEventType
  /** `null` on `member.joined`: there is no prior status to come from. */
  fromStatus: MemberStatus | null
  toStatus: MemberStatus
  reason: string
}

export type LifecycleEvent = WithId<LifecycleEventDoc>

// --- Workout logging ------------------------ `members/{uid}/sessions/{id}` --

export interface LoggedSet {
  reps: number
  weightKg: number
  done: boolean
  /**
   * Added by the member mid-session rather than prescribed by the plan.
   *
   * The qualifying threshold is measured against prescribed sets only, so extra
   * work can only ever help. Prescribed sets cannot be removed; only these can.
   */
  added: boolean
  /** What they hit last time, kept as numbers so the column can switch units. */
  previousWeightKg: number | null
  previousReps: number | null
}

export interface LoggedExercise {
  id: string
  name: string
  muscleGroup: string
  restSeconds: number
  note: string
  sets: LoggedSet[]
}

/** An image in Cloud Storage. Documents are capped at 1 MiB; photos are not. */
export interface StoredImage {
  /** Bucket path, e.g. `members/{uid}/photos/{id}.jpg`. The durable reference. */
  storagePath: string
  /** Resolved download URL. Re-resolvable from the path if it ever expires. */
  downloadUrl: string
  width: number
  height: number
  bytes: number
}

export interface SessionLogDoc {
  /** The `workoutDays` document this session was logged against. */
  dayId: string
  dayNumber: number
  label: string
  /** 1-based challenge week, resolved at write time against `joinedAt`. */
  weekNumber: number
  completedAt: Timestamp
  durationSeconds: number
  volumeKg: number
  setsDone: number
  setsTotal: number
  proofPhoto: StoredImage | null
  note: string
  rewardPoints: number
  /**
   * Whether the session cleared `Program.qualifyingSetPercent`.
   *
   * Only a qualifying session earns RP, moves a badge, keeps a streak alive or
   * touches the leaderboard. One below the line still saves in full and still
   * reaches the coach; it just earns nothing. Resolved server-side at write, so
   * a client cannot award itself points.
   */
  qualifies: boolean
  /** Core / cardio logged inside this session. See `RewardValues.core`. */
  loggedCore: boolean
  loggedCardio: boolean
  /** What was actually logged, so the next session can show "previous". */
  exercises: LoggedExercise[]
  /** Which program version prescribed this, for provenance. */
  programId: string
  programVersion: number
  createdAt: Timestamp
}

export type SessionLog = WithId<SessionLogDoc>

// --- Active session ------------- `members/{uid}/state/activeSession` (single)
//
// A workout in progress. A fixed document id rather than a collection: there is
// only ever one, and a fixed id makes that unrepresentable rather than merely
// discouraged.

export interface ActiveSessionDoc {
  dayId: string
  startedAt: Timestamp | null
  elapsedSeconds: number
  running: boolean
  exercises: LoggedExercise[]
  note: string
  proofPhoto: StoredImage | null
  updatedAt: Timestamp
}

export type ActiveSession = WithId<ActiveSessionDoc>

// --- Check-ins ----------------------- `members/{uid}/checkIns/week-{n}` -----
//
// The document id is the week (`week-3`), so one check-in per week is enforced
// by the key and a resubmit is a natural overwrite.

export type TrainingFeel = 'too-easy' | 'just-right' | 'too-hard'

export interface CheckInDoc {
  weekNumber: number
  submittedAt: Timestamp
  /** Sessions they say they completed: their count, not ours. */
  workoutsDone: number
  /** Self-rated nutrition adherence, 0 to 100. */
  nutritionPct: number
  /** 1..10 */
  energy: number | null
  trainingFeel: TrainingFeel | null
  pain: string
  note: string
  rewardPoints: number
}

export type CheckIn = WithId<CheckInDoc>

// --- Progress photos ---------------------- `members/{uid}/photos/{photoId}` -

export type PhotoPose = 'front' | 'side' | 'back'

export interface ProgressPhotoDoc {
  weekNumber: number
  pose: PhotoPose
  image: StoredImage
  takenAt: Timestamp
}

export type ProgressPhoto = WithId<ProgressPhotoDoc>

// --- Badges ------------------------------- `members/{uid}/badges/{badgeId}` -
//
// Keyed by badge id, so awarding twice is a no-op write rather than a duplicate.

export interface EarnedBadgeDoc {
  badgeId: BadgeRuleId
  earnedAt: Timestamp
  /** RP this badge paid out, at the tier rate in force when it was earned. */
  rewardPoints: number
}

export type EarnedBadge = WithId<EarnedBadgeDoc>

// =============================================================================
// Notifications
//
// Authored once per cohort, read state once per member. The alternative — a
// `readBy` array on the notification — makes every read a write to a document
// every member of the cohort is watching.
// =============================================================================

export type NotificationType = 'workout' | 'coach' | 'reward' | 'community' | 'checkin'

/** `cohorts/{cohortId}/notifications/{notificationId}` */
export interface NotificationDoc extends CreatedBy {
  type: NotificationType
  title: string
  body: string
  /** An instant, not "2h ago". The relative label is rendered client-side. */
  publishedAt: Timestamp
  icon: string
  /** Pinned notifications sort above everything regardless of date. */
  pinned: boolean
}

export type Notification = WithId<NotificationDoc>

/** `members/{uid}/notificationState/{notificationId}` — present means read. */
export interface NotificationStateDoc {
  readAt: Timestamp
}

// =============================================================================
// Chat — `cohorts/{cohortId}/threads/{threadId}/messages/{messageId}`
//
// `threadId` is `cohort` for the group thread, or the member's uid for their
// direct thread with the coach.
// =============================================================================

export type ThreadId = 'cohort' | (string & {})

export interface ChatAttachment {
  id: string
  /** Images render inline; everything else renders as a downloadable chip. */
  kind: 'image' | 'file'
  name: string
  /** Original size in bytes, before any downscaling. */
  bytes: number
  mimeType: string
  storagePath: string
  downloadUrl: string
}

export interface MessageDoc {
  authorUid: string
  authorName: string
  authorAvatarUrl: string
  isCoach: boolean
  /** May be empty when the member is only sharing photos or files. */
  text: string
  sentAt: Timestamp
  attachments: ChatAttachment[]
  /**
   * Everyone's reactions, as emoji → count.
   *
   * A map rather than an array so a reaction is an atomic
   * `increment(1)` on one field, which is what lets two members react at the
   * same instant without one overwriting the other. Who reacted lives in the
   * `reactions` subcollection below.
   */
  reactionCounts: Record<string, number>
}

export type Message = WithId<MessageDoc>

/** `…/messages/{messageId}/reactions/{uid}` — one document per reactor. */
export interface MessageReactionDoc {
  emojis: string[]
  updatedAt: Timestamp
}

// =============================================================================
// Auth
//
// Two ways in, no password on either: an email link ("magic link"), and Google.
// There is no password anywhere in the system, so there is no password to leak.
//
// Both settle the same question — is this address yours — and neither is more
// trusted than the other, so nothing downstream branches on which was used.
// The provider is recorded because a member who signed in with Google and
// later asks for a link is a support conversation, not a bug.
// =============================================================================

/** How this session proved the address. */
export type AuthProvider = 'email-link' | 'google'

/** The signed-in Firebase Auth user, before any member document is involved. */
export interface AuthUser {
  uid: string
  email: string
  emailVerified: boolean
  /**
   * What the provider already knew about them.
   *
   * Google hands over a name and an avatar; an email link hands over nothing
   * but the address, so both are empty strings on that path. `redeemAccessCode`
   * seeds the new member's profile from these, which is the difference between
   * arriving at setup with your name already in the field and typing it again.
   */
  displayName: string
  photoUrl: string
  provider: AuthProvider
}

export type SignInLinkStatus =
  /** Nothing pending; show the email field. */
  | 'idle'
  /** Link sent, waiting for them to open it. */
  | 'sent'
  /** Opened on a different device, so the address has to be re-entered. */
  | 'needs-email'
  | 'expired'
  | 'invalid'

/**
 * Where a member lands after sign-in.
 *
 * The first three exist because auth and cohort membership are separate facts,
 * and the routing goes wrong in a different way for each:
 *
 *   `needs-auth`  nobody is signed in. The sign-in half of `/access-code`.
 *   `needs-code`  signed in, and the member document is *known* to be absent.
 *                 The code half.
 *   `unknown`     signed in, and the member document could not be read at all
 *                 — offline, blocked, or refused. Not the same as not having
 *                 one, and it must never be answered with the code prompt: a
 *                 member who redeemed weeks ago would be asked for a code they
 *                 no longer have, and told it was already used when they typed
 *                 it. This state asks them to retry instead.
 */
export type MemberGate =
  | 'needs-auth'
  | 'needs-code'
  | 'unknown'
  | 'needs-setup'
  | 'ready'
  | 'paused'

// =============================================================================
// View models
//
// Computed per member, per render. None of this is stored: every field here is
// either derived from a document or true only of the current viewer, and both
// kinds go stale the moment they are written down.
// =============================================================================

/** A plan day with this member's progress resolved against it. */
export interface WorkoutDayView extends WorkoutDay {
  /** `locked`: next in the plan, but today's session is already logged. */
  status: 'completed' | 'today' | 'upcoming' | 'rest' | 'locked'
}

export interface GuideView extends Guide {
  locked: boolean
}

export interface NotificationView extends Notification {
  read: boolean
  /** "2h ago", rendered against the trusted clock. */
  timeLabel: string
}

/** One emoji on one message, with how many people picked it. */
export interface ChatReaction {
  emoji: string
  count: number
  /** True when the signed-in member is one of those people. */
  mine: boolean
}

export interface ChatMessageView extends Message {
  /** True of the viewer, so it cannot be a stored field. */
  isSelf: boolean
  reactions: ChatReaction[]
}

export interface BadgeView extends BadgeDef {
  earned: boolean
  earnedAt: Timestamp | null
}

/**
 * One row of the cohort leaderboard.
 *
 * Ranked on qualifying sessions logged, never on weight, calories or visible
 * results. Position is not stored: it falls out of sorting the rows, so it
 * cannot drift out of sync with the counts.
 */
export interface LeaderboardEntry {
  memberId: string
  name: string
  avatarUrl: string
  sessions: number
  isSelf: boolean
}

// --- Leaderboard projection -------------------------------------------------
//
// `cohorts/{cohortId}/leaderboard/{uid}`
//
// A deliberate copy of three fields off the member document, written beside
// `stats` on the same paths.
//
// The board has to be readable by everyone in the cohort, and a member document
// is not: it carries their email, weight, injuries and allergies. Answering the
// board from `members` would mean granting every member read access to all of
// that about all of their peers, which is not a trade the feature is worth.
// Projecting the three fields the board actually renders keeps the rest
// private, and keeps the query one collection read.
export interface LeaderboardEntryDoc {
  name: string
  avatarUrl: string
  /** Qualifying sessions only. Mirrors `MemberStats.sessionsQualified`. */
  sessions: number
  updatedAt: Timestamp
}

// --- Home announcements --------- `cohorts/{cohortId}/announcements/{id}` ---
//
// The deck behind the inbox. Longer-form and card-shaped where a notification
// is a line in a list, which is why it is a second collection rather than a
// flag on the first: the two are authored differently and read on different
// screens, and folding them together would mean every notification carrying
// four fields it does not use.
export interface AnnouncementDoc extends Audited {
  eyebrow: string
  title: string
  body: string
  /** Label for the card's button, or `null` for a card with no action. */
  cta: string | null
  /** Where `cta` goes. Ignored, and the button not rendered, when `cta` is null. */
  ctaUrl: string | null
  accent: 'rose' | 'orange' | 'ink'
  /** An instant. Newest first, like the inbox. */
  publishedAt: Timestamp
}

export type Announcement = WithId<AnnouncementDoc>

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
