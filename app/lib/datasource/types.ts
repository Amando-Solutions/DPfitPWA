import type { Timestamp } from 'firebase/firestore'

import type {
  ActiveSessionDoc,
  AuthUser,
  ChatAttachment,
  ChatMessageView,
  ChatReaction,
  CheckIn,
  CheckInDoc,
  EarnedBadge,
  LeaderboardEntry,
  Member,
  MemberDoc,
  MemberPreferences,
  MemberProfile,
  Notification,
  PhotoPose,
  ProgressPhoto,
  SessionLog,
  SessionLogDoc,
  StoredImage,
  ThreadId,
} from '~/data/types'
import type { ProcessedImage } from '~/lib/image'

/**
 * The one contract every screen reads and writes through.
 *
 * Every method is async and speaks in the document types from `data/types`, so
 * the localStorage implementation and the Firestore one are interchangeable.
 * See `local.ts`, `http.ts`, and the Firestore path noted beside each group.
 * Nothing in `components/` or `pages/` may import a storage, upload or query
 * primitive directly.
 *
 * Three responsibilities live behind this seam that used not to:
 *
 *   - **Auth.** Sign-in is an email link, so it is a two-step flow with a
 *     round trip through the member's inbox in the middle.
 *   - **Uploads.** Documents cap at 1 MiB, so anything binary goes to Cloud
 *     Storage first and the document holds the reference. Callers hand over a
 *     `ProcessedImage` and get back a `StoredImage`; where that actually lands
 *     is the implementation's business.
 *   - **Server-resolved fields.** `qualifies`, `rewardPoints`, `weekNumber`
 *     and every `createdAt` are decided by the writer, not the caller, so the
 *     input types below omit them.
 */
export interface DataSource {
  // =========================================================================
  // Auth — Firebase Auth, email link ("magic link")
  //
  // No passwords anywhere in the system. Signing in and being a cohort member
  // are separate facts: a valid `AuthUser` with no member document is somebody
  // who opened their link but has not redeemed an access code yet, which is
  // what `MemberGate` distinguishes.
  // =========================================================================

  /**
   * Email a sign-in link. Resolves once it is away; the flow continues when
   * the member opens it, which may be on another device.
   */
  sendSignInLink(email: string): Promise<void>

  /** Whether `url` is a sign-in link this app issued. Cheap, synchronous-ish. */
  isSignInLink(url: string): Promise<boolean>

  /**
   * Finish sign-in from an opened link.
   *
   * `email` is only needed when the link was opened on a different device from
   * the one that requested it, where the pending address is not in storage to
   * be read back. Throws `DataSourceError('needs-email')` in exactly that case,
   * so the caller knows to ask rather than to show a failure.
   */
  completeSignInLink(url: string, email?: string): Promise<AuthUser>

  /** The signed-in Firebase user, before any member document is involved. */
  getAuthUser(): Promise<AuthUser | null>

  signOut(): Promise<void>

  // =========================================================================
  // Membership — `members/{uid}`
  // =========================================================================

  /**
   * Bind the signed-in user to a cohort by redeeming a code.
   *
   * Claiming the code and creating the member document have to happen together
   * or not at all, so this is one server-side transaction. Throws on a code
   * that is unknown, expired, already claimed, or issued to a different email.
   */
  redeemAccessCode(code: string): Promise<Member>

  getMember(): Promise<Member | null>
  updateMember(patch: Partial<MemberDoc>): Promise<Member>
  saveProfile(patch: Partial<MemberProfile>): Promise<Member>

  /** Ends onboarding: `status` becomes `active` and a lifecycle event is written. */
  completeSetup(): Promise<Member>

  // =========================================================================
  // Uploads — Cloud Storage
  // =========================================================================

  /**
   * Store an image and return the reference a document can hold.
   *
   * `folder` decides the bucket path, which is what security rules key off:
   * progress photos are the member's alone, chat images are readable by their
   * thread.
   */
  uploadImage(
    image: ProcessedImage,
    folder: 'proof' | 'progress' | 'chat',
  ): Promise<StoredImage>

  /** The same, for the non-image files the paperclip accepts. */
  uploadAttachment(file: PendingFile): Promise<ChatAttachment>

  // --- Workout logging ------------------- `members/{uid}/sessions/{id}` ----
  listSessions(): Promise<SessionLog[]>
  saveSession(log: SessionInput): Promise<SessionLog>
  deleteSession(id: string): Promise<void>

  // --- Active session -------------- `members/{uid}/state/activeSession` ----
  getActiveSession(): Promise<ActiveSessionDoc | null>
  setActiveSession(session: ActiveSessionInput | null): Promise<void>

  // --- Check-ins --------------------- `members/{uid}/checkIns/week-{n}` ----
  listCheckIns(): Promise<CheckIn[]>
  saveCheckIn(input: CheckInInput): Promise<CheckIn>

  // --- Progress photos ------------------- `members/{uid}/photos/{id}` -----
  listPhotos(): Promise<ProgressPhoto[]>
  savePhoto(input: PhotoInput): Promise<ProgressPhoto>
  deletePhoto(id: string): Promise<void>

  // =========================================================================
  // Notifications
  //
  // Authored per cohort, read state per member, so marking one read never
  // writes to a document the whole cohort is watching.
  // =========================================================================
  listNotifications(): Promise<Notification[]>
  /** Notification id → when this member read it. Absent means unread. */
  listNotificationReads(): Promise<Record<string, Timestamp>>
  markNotificationRead(id: string): Promise<void>
  markAllNotificationsRead(): Promise<void>

  // =========================================================================
  // Chat — `cohorts/{cohortId}/threads/{threadId}/messages`
  // =========================================================================

  /**
   * Messages with the viewer folded in.
   *
   * Returns the view type rather than the raw documents because `isSelf` and
   * `reactions.mine` are facts about the reader: resolving them here keeps the
   * "who am I" lookup in one place instead of in every component that renders
   * a bubble.
   */
  listMessages(threadId: ThreadId): Promise<ChatMessageView[]>

  /** `text` may be empty when the member is only sharing photos or files. */
  sendMessage(
    threadId: ThreadId,
    text: string,
    attachments?: ChatAttachment[],
  ): Promise<ChatMessageView>

  /**
   * Add the member's reaction to a message, or take it back off if it is
   * already there. Resolves to that message's reactions as they now stand,
   * counting everyone's.
   */
  toggleReaction(
    threadId: ThreadId,
    messageId: string,
    emoji: string,
  ): Promise<ChatReaction[]>

  // --- Rewards ------------------------- `members/{uid}/badges/{badgeId}` --
  /** Badge id → the award record, keyed so a lookup is not a scan. */
  listEarnedBadges(): Promise<Record<string, EarnedBadge>>
  awardBadge(id: string): Promise<void>

  // --- Leaderboard ----------------------------------------------------------
  /**
   * Every member of the cohort with their qualifying-session count, unordered.
   *
   * One ordered query over `members`, reading the denormalised `stats` rather
   * than each member's session subcollection — the latter is not a query
   * Firestore can answer at any size. Sorting and tie-breaking belong to
   * `rankLeaderboard`.
   */
  listLeaderboard(): Promise<LeaderboardEntry[]>

  // --- Device ---------------------------------------------------------------
  /**
   * Whether this session's writes have stopped reaching durable storage.
   *
   * The on-device implementation shares one ~5 MB Web Storage budget across
   * photos, session logs and chat attachments. Once it is full, writes are kept
   * in memory for the session and lost on the next reload, and a member relying
   * on a photo they just sent deserves to know. A backend has no such ceiling
   * and always answers no.
   */
  storageFull(): Promise<boolean>

  // --- Preferences ----------------------- `members/{uid}.prefs` -----------
  getPreferences(): Promise<MemberPreferences>
  savePreferences(patch: Partial<MemberPreferences>): Promise<MemberPreferences>

  /** Remove every trace of this member from the device (or the account). */
  reset(): Promise<void>
}

// =============================================================================
// Write inputs
//
// What a *caller* is allowed to supply. Everything a caller must not decide is
// omitted here and filled in by the implementation: document ids, `createdAt`,
// and — the ones that matter — `qualifies`, `rewardPoints` and `weekNumber`. A
// client that could name its own reward points could award itself any number.
// =============================================================================

/** A non-image file picked on the device, before anything has stored it. */
export interface PendingFile {
  name: string
  bytes: number
  mimeType: string
  /** `data:…;base64,…`. Where this ends up is the implementation's business. */
  dataUrl: string
}

export type SessionInput = Omit<
  SessionLogDoc,
  | 'createdAt'
  | 'weekNumber'
  | 'qualifies'
  | 'rewardPoints'
  | 'programId'
  | 'programVersion'
>

export type ActiveSessionInput = Omit<ActiveSessionDoc, 'updatedAt'>

export type CheckInInput = Omit<CheckInDoc, 'submittedAt' | 'weekNumber' | 'rewardPoints'>

export interface PhotoInput {
  pose: PhotoPose
  image: ProcessedImage
}

/** Thrown for expected, user-facing failures (bad access code, etc.). */
export class DataSourceError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'invalid-code'
      | 'code-claimed'
      | 'code-expired'
      | 'code-wrong-email'
      | 'not-found'
      | 'unauthenticated'
      /** The link was opened on a device that never requested it. */
      | 'needs-email'
      | 'expired-link'
      | 'unknown' = 'unknown',
  ) {
    super(message)
    this.name = 'DataSourceError'
  }
}
