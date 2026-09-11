import type { Timestamp } from 'firebase/firestore'

import type {
  ActiveSessionDoc,
  Announcement,
  AuthUser,
  ChatAttachment,
  ChatMessageView,
  ChatReaction,
  ChatReplyRef,
  CheckIn,
  CheckInDoc,
  Cohort,
  EarnedBadge,
  Guide,
  LeaderboardEntry,
  Member,
  MemberDoc,
  MemberPreferences,
  MemberProfile,
  Message,
  Notification,
  PhotoPose,
  Program,
  ProgressPhoto,
  SessionLog,
  SessionLogDoc,
  StoredImage,
  ThreadId,
  TypingPeer,
  WorkoutDay,
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
 *   - **Auth.** Passwordless, either way in. Google settles inside a single
 *     gesture; the email link is a two-step flow with a round trip through the
 *     member's inbox in the middle — except on device, where there is no inbox
 *     and `instantSignIn` says so.
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
  // Auth — Firebase Auth: email link ("magic link") and Google
  //
  // No passwords anywhere in the system. Signing in and being a cohort member
  // are separate facts: a valid `AuthUser` with no member document is somebody
  // who opened their link but has not redeemed an access code yet, which is
  // what `MemberGate` distinguishes.
  //
  // The two providers differ only in how long they take. Google settles inside
  // one gesture; the email link leaves the app entirely and comes back through
  // an inbox, possibly on another device. Everything after the `AuthUser` is
  // identical, so nothing downstream asks which one was used.
  // =========================================================================

  /**
   * Whether this implementation can sign a member in without an inbox.
   *
   * Only the on-device one can: it has no email to send, so it signs in on the
   * spot instead. Screens read this to know which half of the flow they are
   * about to run — whether the button says "email me a link" and is followed
   * by a wait, or says "continue" and lands straight on the access code.
   */
  readonly instantSignIn: boolean

  /**
   * Whether Google is on offer at all.
   *
   * A provider has to be enabled in the Firebase console before it exists, and
   * an implementation with no Firebase behind it has no provider to offer, so
   * the button is drawn from this rather than assumed. Offering a sign-in
   * method that answers `auth/operation-not-allowed` is worse than not
   * offering it.
   */
  readonly googleSignIn: boolean

  /**
   * Sign in with Google.
   *
   * Resolves to the signed-in user on the popup path, which is the normal one.
   * Resolves to `null` when the implementation had to fall back to a full-page
   * redirect: the document is being torn down as it returns, there is no user
   * to hand back yet, and the flow finishes in `resumeSignIn` after the load
   * that comes back. Callers should treat `null` as "nothing to do here", not
   * as a failure.
   */
  signInWithGoogle(): Promise<AuthUser | null>

  /**
   * Finish a sign-in that survived a full-page navigation.
   *
   * Called once on boot, before anything asks who is signed in. Almost every
   * load answers `null` — nothing was pending — and the one that does not is
   * the load returning from a Google redirect, where the credentials arrive in
   * the URL and have to be consumed before route middleware can decide where
   * this member belongs. Throws the same user-facing errors `signInWithGoogle`
   * does, because from the member's side it is the same attempt.
   */
  resumeSignIn(): Promise<AuthUser | null>

  /**
   * Email a sign-in link.
   *
   * Resolves to `null` once the link is away; the flow then continues when the
   * member opens it, which may be minutes later and on another device. An
   * implementation with `instantSignIn` set has no inbox to route through and
   * resolves to the signed-in user instead, so the caller has nothing to wait
   * for. Either way the *next* thing outstanding is the access code.
   */
  sendSignInLink(email: string): Promise<AuthUser | null>

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
  // Authored content — the program and the cohort
  //
  // Everything the coach writes and every member reads: the plan, the guide
  // library, the reward economy, the live call, the announcement deck. None of
  // it is member state, so none of it is derived here — it is read as authored
  // and the screens render it.
  //
  // All five are read once per load, in `hydrate`, because they change on the
  // coach's timescale rather than the member's. Nothing polls them; a member
  // who reloads gets the current version, which is the same guarantee the
  // program has always had.
  // =========================================================================

  /**
   * The program the member's cohort is running, at the version pinned on their
   * member document.
   *
   * The source of `qualifyingSetPercent`, the reward values, the badge ladder
   * and the rank ladder — so nothing in `lib/domain/rewards` decides a number
   * any more, it only applies the ones authored here.
   */
  getProgram(): Promise<Program>

  /**
   * The training week, in `dayNumber` order.
   *
   * Includes the optional core & cardio finisher, which is a day like any
   * other with `optional: true` — `days` in the store filters it out of the
   * weekly quota, and `getDay` can still resolve it by id for a member who
   * opens it deliberately.
   */
  listWorkoutDays(): Promise<WorkoutDay[]>

  /** The guide library. Unlocking is per member and stays in the store. */
  listGuides(): Promise<Guide[]>

  /**
   * The member's cohort: the coach, the live call, whether the board is on.
   *
   * `null` when the document is missing rather than a throw, because every one
   * of those has a defined "not set" rendering — no call card, no board, the
   * member's own `cohortName` in the chat header — and a cohort that has not
   * been written yet should not take the app down.
   */
  getCohort(): Promise<Cohort | null>

  /** The announcement deck, newest first. Empty is a normal answer. */
  listAnnouncements(): Promise<Announcement[]>

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

  /**
   * The same thread, but kept live.
   *
   * A chat that is read once on mount is a chat where the other half of the
   * conversation only exists after a reload, which is not a conversation. This
   * subscribes instead: `onMessages` is called with the whole thread as it
   * stands, immediately and then again on every change to it — anyone's
   * message, anyone's reaction.
   *
   * The whole list every time rather than a delta, deliberately. The list is
   * capped at the same 200 messages `listMessages` reads, a screen holds one
   * array either way, and reconciling a stream of adds and removes against a
   * local copy is where duplicated and missing bubbles come from.
   *
   * This member's own writes come back through here too, so a caller that has
   * subscribed does not have to append what `sendMessage` returns — though one
   * that does should merge by id rather than push, since the send may already
   * have arrived this way.
   *
   * `onError` is for a subscription that has *stopped*: a rules refusal or a
   * connection the SDK gave up on. There is no more `onMessages` after it.
   *
   * Resolves to the unsubscribe function. Callers must call it on unmount; a
   * listener nobody has stopped keeps a socket open and a page alive.
   */
  watchMessages(
    threadId: ThreadId,
    onMessages: (messages: ChatMessageView[]) => void,
    onError?: (error: unknown) => void,
  ): Promise<Unsubscribe>

  /**
   * The newest message in a thread, and nothing else, live.
   *
   * For the unread dot on the chat tab, which has to stay right on every
   * screen in the app — not only the one showing the thread. `watchMessages`
   * would answer the same question, but it reads and re-reads the last 200
   * documents to do it, on every load, for a badge that only ever needs the
   * top one.
   *
   * `null` means the thread has nothing in it yet. Delivered immediately and
   * then on every new message, like `watchMessages`, and the raw document
   * rather than the view: a badge needs `sentAt` and `authorUid`, and resolving
   * the viewer's reactions for it would be work nothing renders.
   *
   * Resolves to the unsubscribe function. Same contract as `watchMessages`:
   * callers must call it, and `onError` means the subscription has stopped.
   */
  watchLatestMessage(
    threadId: ThreadId,
    onMessage: (message: Message | null) => void,
    onError?: (error: unknown) => void,
  ): Promise<Unsubscribe>

  /**
   * `text` may be empty when the member is only sharing photos or files.
   *
   * `replyTo` is stored as given rather than resolved from an id — see
   * `ChatReplyRef` for why the quote is a snapshot. Callers should build it
   * with `replyRefFor`, so every implementation excerpts the same way.
   */
  sendMessage(
    threadId: ThreadId,
    text: string,
    attachments?: ChatAttachment[],
    replyTo?: ChatReplyRef | null,
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

  /**
   * Say whether the member is composing in this thread right now.
   *
   * Safe to call on every keystroke: implementations rate-limit the write, so
   * the caller's job is only to describe the state honestly — `true` while
   * there is something in the composer, `false` on send, on an idle pause, and
   * on the way off the screen. A marker that is never turned off is the one
   * failure mode this has, so `false` is also what a reader falls back to after
   * `TYPING_TTL_MS` of silence.
   *
   * Never throws. A typing indicator that could take the composer down with it
   * would be a bad trade, and there is nothing a member could do about it.
   */
  setTyping(threadId: ThreadId, typing: boolean): Promise<void>

  /**
   * Everyone *else* composing in this thread, live.
   *
   * The viewer is filtered out here rather than in the screen: their own
   * marker is written by the same object that reads it back, so it would
   * otherwise arrive a beat later and tell them they are typing.
   *
   * Stale markers are the reader's problem, not the writer's — see `TypingDoc`
   * — so the list is filtered by age on delivery and re-delivered when the
   * oldest entry in it expires, which is what makes an abandoned tab's
   * indicator go away on its own.
   *
   * Resolves to the unsubscribe function, like `watchMessages`.
   */
  watchTyping(
    threadId: ThreadId,
    onTyping: (peers: TypingPeer[]) => void,
    onError?: (error: unknown) => void,
  ): Promise<Unsubscribe>

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

  /**
   * How many members are in this cohort right now.
   *
   * Separate from `listLeaderboard().length`, which was standing in for it and
   * cannot answer it honestly: that query is capped at 200 rows and is read
   * once at boot, so a cohort larger than the cap undercounts and every cohort
   * goes stale the moment anyone joins. Chat puts this number in front of
   * members as "who can see what I am about to say", so it is worth one read of
   * its own on the screen that shows it.
   *
   * The coach is not counted. They are the cohort's `coach`, not a member
   * document, and the header names them separately.
   */
  countCohortMembers(): Promise<number>

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

/** Stops a live subscription. Idempotent — calling it twice is not an error. */
export type Unsubscribe = () => void

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
      /** The member closed the provider window themselves. Not an error to shout about. */
      | 'popup-cancelled'
      /** The provider is not enabled for this project, or there is no provider at all. */
      | 'provider-disabled'
      /** This address is already held by a different sign-in method. */
      | 'account-exists'
      | 'unknown' = 'unknown',
  ) {
    super(message)
    this.name = 'DataSourceError'
  }
}
