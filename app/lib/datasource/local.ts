import { Timestamp } from 'firebase/firestore'

import { storage } from '~/lib/storage'
import { trustedTimestamp } from '~/lib/time'
import {
  DataSourceError,
  type ActiveSessionInput,
  type CheckInInput,
  type DataSource,
  type PendingFile,
  type PhotoInput,
  type SessionInput,
} from './types'
import {
  PROGRAM_ID,
  PROGRAM_VERSION,
  accessCodes,
  badgeTierPoints,
  badges,
  cohort,
  leaderboardSeed,
  notificationSeed,
  rewardValues,
} from '~/data/program'
import { coachSeed, cohortSeed } from '~/data/community'
import { qualifyingSessions, sessionQualifies } from '~/lib/domain/rewards'
import { weekOf } from '~/lib/domain/challenge'
import type { ProcessedImage } from '~/lib/image'
import type {
  ActiveSessionDoc,
  AuthProvider,
  AuthUser,
  BadgeRuleId,
  ChatAttachment,
  ChatMessageView,
  ChatReaction,
  CheckIn,
  EarnedBadge,
  LeaderboardEntry,
  Member,
  MemberDoc,
  MemberPreferences,
  MemberProfile,
  MemberStats,
  Message,
  Notification,
  ProgressPhoto,
  SessionLog,
  StoredImage,
  ThreadId,
} from '~/data/types'

// Storage keys, one per collection, mirroring the Firestore paths.
const KEY = {
  authUser: 'auth-user',
  member: 'member',
  sessions: 'sessions',
  activeSession: 'active-session',
  checkIns: 'check-ins',
  photos: 'photos',
  notificationReads: 'notification-reads',
  messages: 'messages',
  /** The member's own reactions, keyed `<thread>:<message>`. */
  reactions: 'message-reactions',
  badges: 'badges',
  prefs: 'preferences',
} as const

const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

/**
 * The fake sign-in link this implementation understands.
 *
 * Nothing issues one any more — `sendSignInLink` signs in on the spot, because
 * mock mode has no inbox to route a link through and waiting on an email that
 * will never arrive is not a flow anybody can develop against. The parsing
 * stays so the opened-link path can still be rehearsed by hand: visit
 * `/access-code?mockSignIn=you@example.com` in a browser that never asked for
 * it and you get the other-device branch, which is the one genuinely awkward
 * corner of email-link auth.
 */
const emailFromLink = (url: string): string | null => {
  try {
    return new URL(url, 'http://localhost').searchParams.get('mockSignIn')
  } catch {
    return null
  }
}

/**
 * The account the mock Google button signs in as.
 *
 * A fixed identity rather than a random one, so a developer who signs out and
 * back in lands on the same member instead of a fresh empty account each time.
 */
const MOCK_GOOGLE = {
  email: 'demo@dpfitness.app',
  displayName: 'Demo Member',
  photoUrl: '',
} as const

export const emptyProfile = (): MemberProfile => ({
  displayName: '',
  age: null,
  sex: '',
  heightCm: null,
  weightKg: null,
  startWeightKg: null,
  activity: '',
  goal: '',
  trainingDaysPerWeek: 4,
  healthConditions: '',
  injuries: '',
  avatarUrl: '',
})

export const defaultPreferences = (): MemberPreferences => ({
  units: 'kg',
  heightUnits: 'cm',
  workoutReminders: true,
  coachMessages: true,
  weeklyCheckInReminder: true,
})

const emptyStats = (): MemberStats => ({
  sessionsLogged: 0,
  sessionsQualified: 0,
  checkInsSubmitted: 0,
  photosUploaded: 0,
  points: 0,
  streakWeeks: 0,
  lastSessionAt: null,
})

/**
 * A "stored" image, on device.
 *
 * There is no bucket here, so the data URL doubles as the download URL and the
 * storage path is a plausible-looking stand-in. Every consumer reads
 * `downloadUrl` and none of them reads `storagePath`, so the swap to real Cloud
 * Storage changes only this function.
 */
const storeImage = (image: ProcessedImage, folder: string): StoredImage => ({
  storagePath: `${folder}/${uid('img')}.jpg`,
  downloadUrl: image.dataUrl,
  width: image.width,
  height: image.height,
  bytes: image.bytes,
})

/**
 * Fold the member's own reactions into a message's counts.
 *
 * Reactions arrive from two places: the message document carries everyone
 * else's totals, and the member's own live in their storage. Keeping them apart
 * means a member's tap never has to rewrite a shared document, and Firestore
 * hands back the same two halves for the same reason.
 */
const withViewer = (message: Message, viewerUid: string, mine: string[]): ChatMessageView => {
  const counts = { ...message.reactionCounts }
  for (const emoji of mine) counts[emoji] = (counts[emoji] ?? 0) + 1

  const reactions: ChatReaction[] = Object.entries(counts).map(([emoji, count]) => ({
    emoji,
    count,
    mine: mine.includes(emoji),
  }))

  return { ...message, isSelf: message.authorUid === viewerUid, reactions }
}

/**
 * localStorage-backed implementation of the app's data contract.
 *
 * Reads and writes are synchronous underneath but the methods are async so the
 * calling code is already shaped for a network round-trip, and swapping in
 * `FirestoreDataSource` requires no changes above this layer. The document
 * shapes are the real ones: this is a different *store*, not a different
 * schema.
 */
export class LocalDataSource implements DataSource {
  // =========================================================================
  // Auth
  // =========================================================================

  /** No inbox here, so the round trip through one is skipped. See below. */
  readonly instantSignIn = true

  /**
   * Sign in, there and then.
   *
   * There is no email to send: this implementation is the whole backend, so a
   * link it "sent" could only be one it also read back, and the wait in the
   * middle would be theatre. The address is taken at face value — proving the
   * inbox is yours is exactly the part a mock cannot do — and the member lands
   * on the access-code half of the screen, which is the step that still means
   * something on device.
   */
  async sendSignInLink(email: string): Promise<AuthUser> {
    const normalised = email.trim().toLowerCase()
    if (!normalised.includes('@')) {
      throw new DataSourceError('Enter the email address you paid with.', 'invalid-code')
    }
    return this.signIn(normalised, 'email-link')
  }

  /**
   * Offered on device too, so the button is never missing while developing.
   *
   * It cannot talk to Google — there is no Firebase here — so it stands in a
   * plausible Google account instead. The point of drawing it is that the
   * screen either side of the button is the real one.
   */
  readonly googleSignIn = true

  async signInWithGoogle(): Promise<AuthUser> {
    return this.signIn(MOCK_GOOGLE.email, 'google', MOCK_GOOGLE)
  }

  /**
   * Nothing here ever leaves the page, so nothing is ever mid-flight across a
   * load. The real implementation finishes a Google redirect here.
   */
  async resumeSignIn(): Promise<null> {
    return null
  }

  async isSignInLink(url: string): Promise<boolean> {
    return emailFromLink(url) !== null
  }

  async completeSignInLink(url: string, email?: string): Promise<AuthUser> {
    const fromLink = emailFromLink(url)
    if (!fromLink) throw new DataSourceError('That sign-in link is not valid.', 'expired-link')

    // Nothing parks a pending address here, because nothing here sends a link:
    // a hand-crafted one is by definition opened on a device that never asked
    // for it, which is the case the caller has to confirm.
    const known = email?.trim().toLowerCase()
    if (!known) {
      throw new DataSourceError(
        'Confirm the email address this link was sent to.',
        'needs-email',
      )
    }

    return this.signIn(known)
  }

  /** The signed-in state every route in above converges on. */
  private signIn(
    email: string,
    provider: AuthProvider = 'email-link',
    profile: { displayName?: string; photoUrl?: string } = {},
  ): AuthUser {
    const user: AuthUser = {
      uid: uid('uid'),
      email,
      emailVerified: true,
      displayName: profile.displayName ?? '',
      photoUrl: profile.photoUrl ?? '',
      provider,
    }
    storage.write(KEY.authUser, user)
    return user
  }

  async getAuthUser(): Promise<AuthUser | null> {
    return storage.read<AuthUser | null>(KEY.authUser, null)
  }

  async signOut(): Promise<void> {
    storage.clear()
  }

  // =========================================================================
  // Membership
  // =========================================================================
  async redeemAccessCode(code: string): Promise<Member> {
    const user = await this.getAuthUser()
    if (!user) throw new DataSourceError('Sign in first.', 'unauthenticated')

    const normalised = code.trim().toUpperCase()
    if (!normalised) {
      throw new DataSourceError('Enter the access code from your confirmation email.', 'invalid-code')
    }
    if (!accessCodes.includes(normalised)) {
      throw new DataSourceError('That code isn’t valid or has already been used.', 'invalid-code')
    }

    const existing = await this.getMember()
    // Re-entering the same code resumes the account rather than wiping it.
    if (existing && existing.accessCode === normalised) return existing

    const now = trustedTimestamp()
    const member: Member = {
      id: user.uid,
      email: user.email,
      emailVerified: user.emailVerified,
      status: 'onboarding',
      previousStatus: null,
      pauseReason: null,
      pausedAt: null,
      cohortId: cohort.id,
      cohortName: cohort.name,
      programId: PROGRAM_ID,
      programVersion: PROGRAM_VERSION,
      accessCode: normalised,
      joinedAt: now,
      // Mirrors the Firestore path: whatever the provider already knew is
      // carried into the profile so setup doesn't ask for it twice.
      profile: {
        ...emptyProfile(),
        displayName: user.displayName,
        avatarUrl: user.photoUrl,
      },
      prefs: defaultPreferences(),
      stats: emptyStats(),
      createdAt: now,
      updatedAt: now,
      updatedByUid: user.uid,
      updatedByEmail: user.email,
    }
    storage.write(KEY.member, member)
    return member
  }

  async getMember(): Promise<Member | null> {
    return storage.read<Member | null>(KEY.member, null)
  }

  async updateMember(patch: Partial<MemberDoc>): Promise<Member> {
    const member = await this.requireMember()
    const next: Member = { ...member, ...patch, ...this.touch(member) }
    storage.write(KEY.member, next)
    return next
  }

  async saveProfile(patch: Partial<MemberProfile>): Promise<Member> {
    const member = await this.requireMember()
    return this.updateMember({ profile: { ...member.profile, ...patch } })
  }

  /**
   * Ends onboarding.
   *
   * In production this also appends a `member.joined` lifecycle event; there is
   * nothing on device that would ever read one back, so it is skipped here
   * rather than written and ignored.
   */
  async completeSetup(): Promise<Member> {
    return this.updateMember({ status: 'active' })
  }

  // =========================================================================
  // Uploads
  // =========================================================================
  async uploadImage(
    image: ProcessedImage,
    folder: 'proof' | 'progress' | 'chat',
  ): Promise<StoredImage> {
    return storeImage(image, folder)
  }

  async uploadAttachment(file: PendingFile): Promise<ChatAttachment> {
    return {
      id: uid('att'),
      kind: 'file',
      name: file.name,
      bytes: file.bytes,
      mimeType: file.mimeType,
      storagePath: `chat/${uid('file')}`,
      downloadUrl: file.dataUrl,
    }
  }

  // =========================================================================
  // Workout logging
  // =========================================================================
  async listSessions(): Promise<SessionLog[]> {
    return storage.read<SessionLog[]>(KEY.sessions, [])
  }

  /**
   * Resolves the fields a client is not allowed to decide, then writes.
   *
   * `weekNumber`, `qualifies` and `rewardPoints` are computed here rather than
   * accepted from the caller. On device that is only tidiness; against
   * Firestore it is the difference between a reward system and an honour
   * system, and the security rules will reject a client-supplied value.
   */
  async saveSession(log: SessionInput): Promise<SessionLog> {
    const member = await this.requireMember()
    const sessions = await this.listSessions()

    const setsPrescribed = log.exercises.reduce(
      (n, e) => n + e.sets.filter((s) => !s.added).length,
      0,
    )
    // A session made entirely of sets the member added has no prescription to
    // measure against, so it is judged on what it does have.
    const qualifies = sessionQualifies(log.setsDone, setsPrescribed || log.setsTotal)

    const record: SessionLog = {
      ...log,
      id: uid('session'),
      weekNumber: weekOf(member.joinedAt, log.completedAt),
      qualifies,
      // A session below the threshold saves in full and still reaches the
      // coach. It just earns nothing.
      rewardPoints: qualifies ? rewardValues.workout : 0,
      programId: member.programId,
      programVersion: member.programVersion,
      createdAt: trustedTimestamp(),
    }

    const next = [record, ...sessions]
    storage.write(KEY.sessions, next)
    await this.recountStats({ sessions: next })
    return record
  }

  async deleteSession(id: string): Promise<void> {
    const next = (await this.listSessions()).filter((s) => s.id !== id)
    storage.write(KEY.sessions, next)
    await this.recountStats({ sessions: next })
  }

  async getActiveSession(): Promise<ActiveSessionDoc | null> {
    return storage.read<ActiveSessionDoc | null>(KEY.activeSession, null)
  }

  async setActiveSession(session: ActiveSessionInput | null): Promise<void> {
    if (session === null) storage.remove(KEY.activeSession)
    else storage.write(KEY.activeSession, { ...session, updatedAt: trustedTimestamp() })
  }

  // =========================================================================
  // Check-ins
  // =========================================================================
  async listCheckIns(): Promise<CheckIn[]> {
    return storage.read<CheckIn[]>(KEY.checkIns, [])
  }

  async saveCheckIn(input: CheckInInput): Promise<CheckIn> {
    const member = await this.requireMember()
    const all = await this.listCheckIns()
    const submittedAt = trustedTimestamp()
    const weekNumber = weekOf(member.joinedAt, submittedAt)

    const record: CheckIn = {
      ...input,
      // The document id is the week, which is what enforces one per week.
      id: `week-${weekNumber}`,
      weekNumber,
      submittedAt,
      rewardPoints: rewardValues.checkIn,
    }
    const next = [record, ...all.filter((c) => c.weekNumber !== weekNumber)]
    storage.write(KEY.checkIns, next)
    await this.recountStats({ checkIns: next })
    return record
  }

  // =========================================================================
  // Progress photos
  // =========================================================================
  async listPhotos(): Promise<ProgressPhoto[]> {
    return storage.read<ProgressPhoto[]>(KEY.photos, [])
  }

  async savePhoto(input: PhotoInput): Promise<ProgressPhoto> {
    const member = await this.requireMember()
    const all = await this.listPhotos()
    const takenAt = trustedTimestamp()

    const record: ProgressPhoto = {
      id: uid('photo'),
      pose: input.pose,
      weekNumber: weekOf(member.joinedAt, takenAt),
      image: await this.uploadImage(input.image, 'progress'),
      takenAt,
    }
    const next = [record, ...all]
    storage.write(KEY.photos, next)
    await this.recountStats({ photos: next })
    return record
  }

  async deletePhoto(id: string): Promise<void> {
    const next = (await this.listPhotos()).filter((p) => p.id !== id)
    storage.write(KEY.photos, next)
    await this.recountStats({ photos: next })
  }

  // =========================================================================
  // Notifications
  // =========================================================================
  async listNotifications(): Promise<Notification[]> {
    return notificationSeed
  }

  async listNotificationReads(): Promise<Record<string, Timestamp>> {
    return storage.read<Record<string, Timestamp>>(KEY.notificationReads, {})
  }

  async markNotificationRead(id: string): Promise<void> {
    const reads = await this.listNotificationReads()
    if (reads[id]) return
    storage.write(KEY.notificationReads, { ...reads, [id]: trustedTimestamp() })
  }

  async markAllNotificationsRead(): Promise<void> {
    const now = trustedTimestamp()
    const reads = await this.listNotificationReads()
    storage.write(KEY.notificationReads, {
      ...Object.fromEntries(notificationSeed.map((n) => [n.id, now])),
      ...reads,
    })
  }

  // =========================================================================
  // Chat
  // =========================================================================
  async listMessages(threadId: ThreadId): Promise<ChatMessageView[]> {
    const viewer = (await this.getAuthUser())?.uid ?? 'me'
    const seed = threadId === 'cohort' ? cohortSeed : coachSeed
    const mine = storage.read<Record<string, Message[]>>(KEY.messages, {})
    const reactions = storage.read<Record<string, string[]>>(KEY.reactions, {})

    return [...seed, ...(mine[threadId] ?? [])].map((message) =>
      withViewer(message, viewer, reactions[`${threadId}:${message.id}`] ?? []),
    )
  }

  async sendMessage(
    threadId: ThreadId,
    text: string,
    attachments: ChatAttachment[] = [],
  ): Promise<ChatMessageView> {
    const [user, member] = await Promise.all([this.getAuthUser(), this.getMember()])
    const message: Message = {
      id: uid('msg'),
      authorUid: user?.uid ?? 'me',
      authorName: member?.profile.displayName || 'You',
      authorAvatarUrl: member?.profile.avatarUrl ?? '',
      isCoach: false,
      text,
      sentAt: trustedTimestamp(),
      attachments,
      reactionCounts: {},
    }
    const mine = storage.read<Record<string, Message[]>>(KEY.messages, {})
    storage.write(KEY.messages, {
      ...mine,
      [threadId]: [...(mine[threadId] ?? []), message],
    })
    return withViewer(message, message.authorUid, [])
  }

  async toggleReaction(
    threadId: ThreadId,
    messageId: string,
    emoji: string,
  ): Promise<ChatReaction[]> {
    const all = storage.read<Record<string, string[]>>(KEY.reactions, {})
    const key = `${threadId}:${messageId}`
    const current = all[key] ?? []
    const next = current.includes(emoji)
      ? current.filter((e) => e !== emoji)
      : [...current, emoji]

    // Drop the entry rather than storing an empty list, so un-reacting leaves
    // no trace and the store does not fill with `[]`.
    const updated = { ...all }
    if (next.length) updated[key] = next
    else delete updated[key]
    storage.write(KEY.reactions, updated)

    const messages = await this.listMessages(threadId)
    return messages.find((m) => m.id === messageId)?.reactions ?? []
  }

  // =========================================================================
  // Rewards
  // =========================================================================
  async listEarnedBadges(): Promise<Record<string, EarnedBadge>> {
    return storage.read<Record<string, EarnedBadge>>(KEY.badges, {})
  }

  async awardBadge(id: string): Promise<void> {
    const earned = await this.listEarnedBadges()
    if (earned[id]) return

    const def = badges.find((b) => b.id === id)
    const record: EarnedBadge = {
      id,
      badgeId: id as BadgeRuleId,
      earnedAt: trustedTimestamp(),
      rewardPoints: def ? badgeTierPoints[def.tier] : 0,
    }
    storage.write(KEY.badges, { ...earned, [id]: record })
    await this.recountStats({})
  }

  /**
   * The member's real row, padded out with the stand-in cohort.
   *
   * Only their own row can be real on device: a leaderboard is a query across
   * every member, and there is only ever one member in localStorage. The peers
   * exist so mock mode has a board to show; the Firestore implementation reads
   * every member's `stats` and never touches them.
   */
  async listLeaderboard(): Promise<LeaderboardEntry[]> {
    const [member, sessions] = await Promise.all([this.getMember(), this.listSessions()])
    const me: LeaderboardEntry = {
      memberId: member?.id ?? 'me',
      name: member?.profile.displayName?.trim() || 'You',
      avatarUrl: member?.profile.avatarUrl ?? '',
      sessions: qualifyingSessions(sessions).length,
      isSelf: true,
    }
    return [...leaderboardSeed.map((peer) => ({ ...peer, isSelf: false })), me]
  }

  // =========================================================================
  // Preferences
  // =========================================================================
  async getPreferences(): Promise<MemberPreferences> {
    const member = await this.getMember()
    return { ...defaultPreferences(), ...(member?.prefs ?? {}) }
  }

  async savePreferences(patch: Partial<MemberPreferences>): Promise<MemberPreferences> {
    const next = { ...(await this.getPreferences()), ...patch }
    await this.updateMember({ prefs: next })
    return next
  }

  async storageFull(): Promise<boolean> {
    return storage.hasOverflow()
  }

  async reset(): Promise<void> {
    storage.clear()
  }

  // =========================================================================
  // internals
  // =========================================================================
  private async requireMember(): Promise<Member> {
    const member = await this.getMember()
    if (!member) throw new DataSourceError('No member on this device.', 'unauthenticated')
    return member
  }

  /** The `updatedBy` block, stamped with whoever is signed in. */
  private touch(member: Member) {
    return {
      updatedAt: trustedTimestamp(),
      updatedByUid: member.id,
      updatedByEmail: member.email,
    }
  }

  /**
   * Recompute the denormalised counters on the member document.
   *
   * These exist so the leaderboard can be one ordered query instead of a read
   * of every member's whole history. That makes them a cache, and a cache that
   * is only written next to *some* of the events it summarises drifts, so every
   * write path through this class ends here. Firestore does the same work in
   * the transaction that writes the log.
   *
   * The collection that changed is passed in rather than re-read, because the
   * write that triggered this has usually not been read back yet.
   */
  private async recountStats(changed: {
    sessions?: SessionLog[]
    checkIns?: CheckIn[]
    photos?: ProgressPhoto[]
  }): Promise<void> {
    const member = await this.getMember()
    if (!member) return

    const [sessions, checkIns, photos, earnedBadges] = await Promise.all([
      changed.sessions ?? this.listSessions(),
      changed.checkIns ?? this.listCheckIns(),
      changed.photos ?? this.listPhotos(),
      this.listEarnedBadges(),
    ])

    const qualified = qualifyingSessions(sessions)
    const badgePoints = Object.values(earnedBadges).reduce((n, b) => n + b.rewardPoints, 0)

    const stats: MemberStats = {
      sessionsLogged: sessions.length,
      sessionsQualified: qualified.length,
      checkInsSubmitted: checkIns.length,
      photosUploaded: photos.length,
      points:
        qualified.length * rewardValues.workout +
        checkIns.length * rewardValues.checkIn +
        photos.length * rewardValues.progressPhoto +
        badgePoints,
      // Left to `rewardsSnapshot`, which is the definition. Copying the
      // consecutive-week walk here would be a second implementation of it.
      streakWeeks: member.stats.streakWeeks,
      lastSessionAt: sessions[0]?.completedAt ?? null,
    }

    storage.write(KEY.member, { ...member, stats, ...this.touch(member) })
  }
}
