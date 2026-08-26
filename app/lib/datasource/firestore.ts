import {
  isSignInWithEmailLink,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import {
  FieldPath,
  Timestamp,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
  uploadString,
} from 'firebase/storage'

import {
  authRestored,
  currentUser,
  firebaseAuth,
  firebaseDb,
  firebaseStorage,
} from '~/lib/firebase/app'
import { weekOf } from '~/lib/domain/challenge'
import { storage as webStorage } from '~/lib/storage'
import type { ProcessedImage } from '~/lib/image'
import {
  DataSourceError,
  type ActiveSessionInput,
  type CheckInInput,
  type DataSource,
  type PendingFile,
  type PhotoInput,
  type SessionInput,
} from './types'
import type {
  ActiveSessionDoc,
  AuthUser,
  ChatAttachment,
  ChatMessageView,
  ChatReaction,
  CheckIn,
  EarnedBadge,
  LeaderboardEntry,
  LeaderboardEntryDoc,
  Member,
  MemberDoc,
  MemberPreferences,
  MemberProfile,
  MemberStats,
  Message,
  Notification,
  Program,
  ProgressPhoto,
  SessionLog,
  StoredImage,
  ThreadId,
} from '~/data/types'

/** Where the pending sign-in address is parked between the two halves of the flow. */
const PENDING_EMAIL_KEY = 'auth-pending-email'

/** The single document under `members/{uid}/state` holding the live workout. */
const ACTIVE_SESSION_ID = 'activeSession'

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`

/** Snapshot → the shape the app handles: stored fields plus the document id. */
const withId = <T>(snap: QueryDocumentSnapshot<DocumentData>): T =>
  ({ id: snap.id, ...snap.data() }) as T

const toAuthUser = (user: User): AuthUser => ({
  uid: user.uid,
  email: user.email ?? '',
  emailVerified: user.emailVerified,
})

// A member's starting state is a property of the schema rather than of wherever
// it happens to be stored, so these match `local.ts` field for field.
const emptyProfile = (): MemberProfile => ({
  displayName: '',
  age: null,
  sex: '',
  heightCm: null,
  weightKg: null,
  startWeightKg: null,
  activity: '',
  goal: '',
  trainingDaysPerWeek: 4,
  allergies: '',
  injuries: '',
  callSlot: '',
  avatarUrl: '',
})

const defaultPreferences = (): MemberPreferences => ({
  units: 'kg',
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
 * Firestore implementation of the app's data contract.
 *
 * Three things are true of every method here and worth stating once.
 *
 * **Server-resolved fields are resolved here.** `weekNumber`, `qualifies` and
 * `rewardPoints` are computed against the member's own join date and their
 * program's threshold, never taken from the caller — see `SessionInput`, which
 * omits them.
 *
 * **Counters are incremented, not recounted.** `MemberStats` exists so the
 * leaderboard is one ordered query rather than a read of every member's whole
 * history. Keeping it honest means every write that changes a count updates it
 * in the same batch as the document it summarises, so the two can never
 * disagree.
 *
 * **The trust boundary is real but not yet closed.** These writes run as client
 * transactions, guarded by rules that check ownership and shape. Rules cannot
 * re-derive `qualifies` from a set count, so a determined member could still
 * write a session claiming more sets than they did. Moving `saveSession`,
 * `saveCheckIn`, `awardBadge` and `redeemAccessCode` behind Callable Functions
 * closes it, and each is shaped to become a one-line `httpsCallable` when it
 * does. See the header of `firestore.rules`.
 */
export class FirestoreDataSource implements DataSource {
  private memberCache: Member | null = null
  private programCache: Program | null = null

  // =========================================================================
  // Auth — email link
  // =========================================================================
  /**
   * Where Firebase sends people back to.
   *
   * It has to be the screen that knows how to finish the flow: the link
   * carries its credentials in the query string and they are consumed on
   * arrival. See `pages/access-code.vue`.
   */
  private actionCodeSettings() {
    return { url: `${window.location.origin}/access-code`, handleCodeInApp: true }
  }

  async sendSignInLink(email: string): Promise<void> {
    const normalised = email.trim().toLowerCase()
    if (!normalised.includes('@')) {
      throw new DataSourceError('Enter the email address you paid with.', 'invalid-code')
    }
    try {
      await sendSignInLinkToEmail(firebaseAuth(), normalised, this.actionCodeSettings())
    } catch (cause) {
      throw new DataSourceError(this.authMessage(cause), 'unknown')
    }
    // Parked so the same browser can finish without asking again. Another
    // device has no such record, which is what `needs-email` is for.
    webStorage.write(PENDING_EMAIL_KEY, normalised)
  }

  async isSignInLink(url: string): Promise<boolean> {
    return isSignInWithEmailLink(firebaseAuth(), url)
  }

  async completeSignInLink(url: string, email?: string): Promise<AuthUser> {
    const known =
      email?.trim().toLowerCase() ?? webStorage.read<string | null>(PENDING_EMAIL_KEY, null)
    if (!known) {
      throw new DataSourceError(
        'Confirm the email address this link was sent to.',
        'needs-email',
      )
    }

    try {
      const credential = await signInWithEmailLink(firebaseAuth(), known, url)
      webStorage.remove(PENDING_EMAIL_KEY)
      this.memberCache = null
      return toAuthUser(credential.user)
    } catch (cause) {
      const code = (cause as { code?: string }).code
      if (code === 'auth/invalid-action-code' || code === 'auth/expired-action-code') {
        throw new DataSourceError(
          'That sign-in link has expired. Ask for a new one.',
          'expired-link',
        )
      }
      throw new DataSourceError(this.authMessage(cause), 'unknown')
    }
  }

  async getAuthUser(): Promise<AuthUser | null> {
    const user = await currentUser()
    return user ? toAuthUser(user) : null
  }

  async signOut(): Promise<void> {
    await firebaseSignOut(firebaseAuth())
    this.memberCache = null
    this.programCache = null
    webStorage.clear()
  }

  // =========================================================================
  // Membership
  // =========================================================================
  /**
   * Claim a code and create the member document, together or not at all.
   *
   * A transaction rather than two writes: a code marked claimed with no member
   * behind it is a seat nobody can ever use, and a member with no claimed code
   * is a free seat in a paid cohort. Both halves land or neither does.
   */
  async redeemAccessCode(code: string): Promise<Member> {
    const user = await this.requireUser()
    const normalised = code.trim().toUpperCase()
    if (!normalised) {
      throw new DataSourceError(
        'Enter the access code from your confirmation email.',
        'invalid-code',
      )
    }

    const db = firebaseDb()
    const codeRef = doc(db, 'accessCodes', normalised)
    const memberRef = doc(db, 'members', user.uid)

    const member = await runTransaction(db, async (tx) => {
      const [codeSnap, memberSnap] = await Promise.all([tx.get(codeRef), tx.get(memberRef)])

      // Re-entering the same code resumes the account rather than wiping it.
      const existing = memberSnap.exists()
        ? ({ id: memberSnap.id, ...memberSnap.data() } as Member)
        : null
      if (existing && existing.accessCode === normalised) return existing

      if (!codeSnap.exists()) {
        throw new DataSourceError(
          'That code isn’t valid or has already been used.',
          'invalid-code',
        )
      }
      const codeData = codeSnap.data()

      if (codeData.status === 'revoked') {
        throw new DataSourceError('That code has been revoked. Contact support.', 'invalid-code')
      }
      if (codeData.status === 'claimed') {
        throw new DataSourceError('That code has already been used.', 'code-claimed')
      }
      if (codeData.expiresAt && codeData.expiresAt.toMillis() < Date.now()) {
        throw new DataSourceError('That code has expired. Contact support.', 'code-expired')
      }
      // A code issued against a purchase can only be redeemed by that buyer,
      // which is the whole reason both flows turn on an email address.
      if (codeData.issuedToEmail && codeData.issuedToEmail !== user.email) {
        throw new DataSourceError(
          'That code was issued to a different email address.',
          'code-wrong-email',
        )
      }

      const now = Timestamp.now()
      const created: MemberDoc = {
        email: user.email ?? '',
        emailVerified: user.emailVerified,
        status: 'onboarding',
        previousStatus: null,
        pauseReason: null,
        pausedAt: null,
        cohortId: codeData.cohortId,
        cohortName: codeData.cohortName,
        programId: codeData.programId ?? '',
        programVersion: codeData.programVersion ?? 1,
        accessCode: normalised,
        joinedAt: now,
        profile: emptyProfile(),
        prefs: defaultPreferences(),
        stats: emptyStats(),
        createdAt: now,
        updatedAt: now,
        updatedByUid: user.uid,
        updatedByEmail: user.email ?? '',
      }

      tx.set(memberRef, created)
      tx.update(codeRef, {
        status: 'claimed',
        claimedByUid: user.uid,
        claimedByName: user.email ?? '',
        claimedAt: now,
        updatedAt: now,
        updatedByUid: user.uid,
        updatedByEmail: user.email ?? '',
      })

      return { id: user.uid, ...created }
    })

    this.memberCache = member
    await this.writeLifecycleEvent('member.joined', null, 'onboarding', 'Redeemed access code')
    return member
  }

  async getMember(): Promise<Member | null> {
    const user = await currentUser()
    if (!user) return null
    const snap = await getDoc(doc(firebaseDb(), 'members', user.uid))
    this.memberCache = snap.exists() ? ({ id: snap.id, ...snap.data() } as Member) : null
    return this.memberCache
  }

  async updateMember(patch: Partial<MemberDoc>): Promise<Member> {
    const member = await this.requireMember()
    await updateDoc(doc(firebaseDb(), 'members', member.id), {
      ...patch,
      ...this.touch(member),
    })
    // `serverTimestamp()` is a sentinel until it lands, so the local copy takes
    // a real instant rather than something no screen could render.
    this.memberCache = { ...member, ...patch, updatedAt: Timestamp.now() } as Member
    return this.memberCache
  }

  async saveProfile(patch: Partial<MemberProfile>): Promise<Member> {
    const member = await this.requireMember()
    const profile = { ...member.profile, ...patch }
    const updated = await this.updateMember({ profile })

    // The board shows a name and a face, so a rename has to reach the
    // projection too or the row keeps the old one until the next session.
    if (patch.displayName !== undefined || patch.avatarUrl !== undefined) {
      await setDoc(
        this.leaderboardRef(member.cohortId, member.id),
        {
          name: profile.displayName || 'Member',
          avatarUrl: profile.avatarUrl || '',
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
    }
    return updated
  }

  async completeSetup(): Promise<Member> {
    const member = await this.updateMember({ status: 'active' })
    await this.writeLifecycleEvent('member.joined', 'onboarding', 'active', 'Finished setup')
    return member
  }

  // =========================================================================
  // Uploads
  // =========================================================================
  async uploadImage(
    image: ProcessedImage,
    folder: 'proof' | 'progress' | 'chat',
  ): Promise<StoredImage> {
    const member = await this.requireMember()
    // Chat images are readable by their thread; the other two are the member's
    // alone. The path is what the storage rules key off, so it decides both.
    const path =
      folder === 'chat'
        ? `chat/${member.cohortId}/${member.id}/${uid()}.jpg`
        : `members/${member.id}/${folder}/${uid()}.jpg`

    const ref = storageRef(firebaseStorage(), path)
    await uploadString(ref, image.dataUrl, 'data_url', { contentType: 'image/jpeg' })

    return {
      storagePath: path,
      downloadUrl: await getDownloadURL(ref),
      width: image.width,
      height: image.height,
      bytes: image.bytes,
    }
  }

  async uploadAttachment(file: PendingFile): Promise<ChatAttachment> {
    const member = await this.requireMember()
    const path = `chat/${member.cohortId}/${member.id}/${uid()}`
    const ref = storageRef(firebaseStorage(), path)
    await uploadString(ref, file.dataUrl, 'data_url', { contentType: file.mimeType })

    return {
      id: path,
      kind: 'file',
      name: file.name,
      bytes: file.bytes,
      mimeType: file.mimeType,
      storagePath: path,
      downloadUrl: await getDownloadURL(ref),
    }
  }

  // =========================================================================
  // Workout logging
  // =========================================================================
  async listSessions(): Promise<SessionLog[]> {
    const member = await this.requireMember()
    const snap = await getDocs(
      query(
        collection(firebaseDb(), 'members', member.id, 'sessions'),
        orderBy('completedAt', 'desc'),
      ),
    )
    return snap.docs.map((d) => withId<SessionLog>(d))
  }

  async saveSession(log: SessionInput): Promise<SessionLog> {
    const member = await this.requireMember()
    const program = await this.program()

    // Judged against what the plan asked for, so sets the member added
    // themselves can only ever help. The fallback covers a session made
    // entirely of added sets, which has no prescription to measure against.
    const setsPrescribed = log.exercises.reduce(
      (n, e) => n + e.sets.filter((s) => !s.added).length,
      0,
    )
    const denominator = setsPrescribed || log.setsTotal
    const qualifies =
      denominator > 0 && (log.setsDone / denominator) * 100 >= program.qualifyingSetPercent

    const rewardPoints = qualifies ? program.rewards.values.workout : 0
    const record: Omit<SessionLog, 'id'> = {
      ...log,
      weekNumber: weekOf(member.joinedAt, log.completedAt),
      qualifies,
      rewardPoints,
      programId: member.programId,
      programVersion: member.programVersion,
      createdAt: Timestamp.now(),
    }

    const db = firebaseDb()
    const ref = doc(collection(db, 'members', member.id, 'sessions'))
    const batch = writeBatch(db)
    batch.set(ref, record)
    // The counters and the log they summarise land together, so the board can
    // never show a total the sessions behind it do not support.
    batch.update(doc(db, 'members', member.id), {
      'stats.sessionsLogged': increment(1),
      'stats.sessionsQualified': increment(qualifies ? 1 : 0),
      'stats.points': increment(rewardPoints),
      'stats.lastSessionAt': record.completedAt,
      updatedAt: serverTimestamp(),
    })
    if (qualifies) {
      batch.set(
        this.leaderboardRef(member.cohortId, member.id),
        {
          name: member.profile.displayName || 'Member',
          avatarUrl: member.profile.avatarUrl || '',
          sessions: increment(1),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
    }
    await batch.commit()

    this.memberCache = null
    return { id: ref.id, ...record }
  }

  async deleteSession(id: string): Promise<void> {
    const member = await this.requireMember()
    const db = firebaseDb()
    const ref = doc(db, 'members', member.id, 'sessions', id)
    const snap = await getDoc(ref)
    if (!snap.exists()) return
    const session = snap.data() as SessionLog

    const batch = writeBatch(db)
    batch.delete(ref)
    batch.update(doc(db, 'members', member.id), {
      'stats.sessionsLogged': increment(-1),
      'stats.sessionsQualified': increment(session.qualifies ? -1 : 0),
      'stats.points': increment(-session.rewardPoints),
      updatedAt: serverTimestamp(),
    })
    if (session.qualifies) {
      batch.set(
        this.leaderboardRef(member.cohortId, member.id),
        { sessions: increment(-1), updatedAt: serverTimestamp() },
        { merge: true },
      )
    }
    await batch.commit()
    this.memberCache = null
  }

  async getActiveSession(): Promise<ActiveSessionDoc | null> {
    const member = await this.requireMember()
    const snap = await getDoc(
      doc(firebaseDb(), 'members', member.id, 'state', ACTIVE_SESSION_ID),
    )
    return snap.exists() ? (snap.data() as ActiveSessionDoc) : null
  }

  async setActiveSession(session: ActiveSessionInput | null): Promise<void> {
    const member = await this.requireMember()
    const ref = doc(firebaseDb(), 'members', member.id, 'state', ACTIVE_SESSION_ID)
    if (session === null) await deleteDoc(ref)
    else await setDoc(ref, { ...session, updatedAt: serverTimestamp() })
  }

  // =========================================================================
  // Check-ins
  // =========================================================================
  async listCheckIns(): Promise<CheckIn[]> {
    const member = await this.requireMember()
    const snap = await getDocs(
      query(
        collection(firebaseDb(), 'members', member.id, 'checkIns'),
        orderBy('weekNumber', 'desc'),
      ),
    )
    return snap.docs.map((d) => withId<CheckIn>(d))
  }

  async saveCheckIn(input: CheckInInput): Promise<CheckIn> {
    const member = await this.requireMember()
    const program = await this.program()
    const submittedAt = Timestamp.now()
    const weekNumber = weekOf(member.joinedAt, submittedAt)

    const record = {
      ...input,
      weekNumber,
      submittedAt,
      rewardPoints: program.rewards.values.checkIn,
    }

    const db = firebaseDb()
    // The week is the document id, so one check-in per week is enforced by the
    // key rather than by a query, and a resubmit is a natural overwrite.
    const id = `week-${weekNumber}`
    const ref = doc(db, 'members', member.id, 'checkIns', id)
    const existed = (await getDoc(ref)).exists()

    const batch = writeBatch(db)
    batch.set(ref, record)
    batch.update(doc(db, 'members', member.id), {
      // A resubmit replaces the earlier answer rather than paying out twice.
      'stats.checkInsSubmitted': increment(existed ? 0 : 1),
      'stats.points': increment(existed ? 0 : record.rewardPoints),
      updatedAt: serverTimestamp(),
    })
    await batch.commit()

    this.memberCache = null
    return { id, ...record }
  }

  // =========================================================================
  // Progress photos
  // =========================================================================
  async listPhotos(): Promise<ProgressPhoto[]> {
    const member = await this.requireMember()
    const snap = await getDocs(
      query(
        collection(firebaseDb(), 'members', member.id, 'photos'),
        orderBy('takenAt', 'desc'),
      ),
    )
    return snap.docs.map((d) => withId<ProgressPhoto>(d))
  }

  async savePhoto(input: PhotoInput): Promise<ProgressPhoto> {
    const member = await this.requireMember()
    const program = await this.program()
    const takenAt = Timestamp.now()

    // Upload first: a document pointing at a file that failed to upload renders
    // as a broken tile, whereas an orphaned upload is only wasted bytes.
    const image = await this.uploadImage(input.image, 'progress')

    const record = {
      pose: input.pose,
      weekNumber: weekOf(member.joinedAt, takenAt),
      image,
      takenAt,
    }

    const db = firebaseDb()
    const ref = doc(collection(db, 'members', member.id, 'photos'))
    const batch = writeBatch(db)
    batch.set(ref, record)
    batch.update(doc(db, 'members', member.id), {
      'stats.photosUploaded': increment(1),
      'stats.points': increment(program.rewards.values.progressPhoto),
      updatedAt: serverTimestamp(),
    })
    await batch.commit()

    this.memberCache = null
    return { id: ref.id, ...record }
  }

  async deletePhoto(id: string): Promise<void> {
    const member = await this.requireMember()
    const program = await this.program()
    const db = firebaseDb()
    const ref = doc(db, 'members', member.id, 'photos', id)
    const snap = await getDoc(ref)
    if (!snap.exists()) return
    const photo = snap.data() as ProgressPhoto

    const batch = writeBatch(db)
    batch.delete(ref)
    batch.update(doc(db, 'members', member.id), {
      'stats.photosUploaded': increment(-1),
      'stats.points': increment(-program.rewards.values.progressPhoto),
      updatedAt: serverTimestamp(),
    })
    await batch.commit()

    // The bucket object goes last and its failure is swallowed: the photo has
    // already left the member's view, and a leftover file is a cleanup job
    // rather than a reason to fail the delete they asked for.
    try {
      await deleteObject(storageRef(firebaseStorage(), photo.image.storagePath))
    } catch {
      // Already gone, or not ours to remove.
    }
    this.memberCache = null
  }

  // =========================================================================
  // Notifications
  // =========================================================================
  async listNotifications(): Promise<Notification[]> {
    const member = await this.requireMember()
    const snap = await getDocs(
      query(
        collection(firebaseDb(), 'cohorts', member.cohortId, 'notifications'),
        orderBy('pinned', 'desc'),
        orderBy('publishedAt', 'desc'),
        limit(50),
      ),
    )
    return snap.docs.map((d) => withId<Notification>(d))
  }

  async listNotificationReads(): Promise<Record<string, Timestamp>> {
    const member = await this.requireMember()
    const snap = await getDocs(
      collection(firebaseDb(), 'members', member.id, 'notificationState'),
    )
    return Object.fromEntries(
      snap.docs.map((d) => [d.id, (d.data() as { readAt: Timestamp }).readAt]),
    )
  }

  async markNotificationRead(id: string): Promise<void> {
    const member = await this.requireMember()
    await setDoc(
      doc(firebaseDb(), 'members', member.id, 'notificationState', id),
      { readAt: serverTimestamp() },
      { merge: true },
    )
  }

  async markAllNotificationsRead(): Promise<void> {
    const member = await this.requireMember()
    const notifications = await this.listNotifications()
    const db = firebaseDb()
    const batch = writeBatch(db)
    for (const n of notifications) {
      batch.set(
        doc(db, 'members', member.id, 'notificationState', n.id),
        { readAt: serverTimestamp() },
        { merge: true },
      )
    }
    await batch.commit()
  }

  // =========================================================================
  // Chat
  // =========================================================================
  /**
   * The thread id as Firestore stores it.
   *
   * The app says `'coach'` for "my private thread with the coach", which is the
   * right word on a screen and the wrong key in a database: every member's DM
   * would collide on one document. Keying it by the member's uid gives each one
   * their own thread and lets the rules say "yours, or the cohort's" in a
   * single expression.
   */
  private async resolveThread(threadId: ThreadId): Promise<string> {
    if (threadId === 'cohort') return 'cohort'
    const member = await this.requireMember()
    return threadId === 'coach' ? member.id : threadId
  }

  private async messagesRef(threadId: ThreadId) {
    const member = await this.requireMember()
    const resolved = await this.resolveThread(threadId)
    return collection(
      firebaseDb(),
      'cohorts',
      member.cohortId,
      'threads',
      resolved,
      'messages',
    )
  }

  async listMessages(threadId: ThreadId): Promise<ChatMessageView[]> {
    const member = await this.requireMember()
    const ref = await this.messagesRef(threadId)
    const snap = await getDocs(query(ref, orderBy('sentAt', 'asc'), limit(200)))

    // The member's own reactions live one document below each message, so they
    // arrive separately and are folded in here — the same two halves the
    // on-device implementation keeps apart, for the same reason.
    const messages = snap.docs.map((d) => withId<Message>(d))
    const mine = await Promise.all(
      snap.docs.map((d) =>
        getDoc(doc(d.ref, 'reactions', member.id)).then((r) =>
          r.exists() ? ((r.data() as { emojis: string[] }).emojis ?? []) : [],
        ),
      ),
    )

    return messages.map((message, i) => this.viewOf(message, member.id, mine[i] ?? []))
  }

  async sendMessage(
    threadId: ThreadId,
    text: string,
    attachments: ChatAttachment[] = [],
  ): Promise<ChatMessageView> {
    const member = await this.requireMember()
    const ref = await this.messagesRef(threadId)

    const message: Omit<Message, 'id'> = {
      authorUid: member.id,
      authorName: member.profile.displayName || 'You',
      authorAvatarUrl: member.profile.avatarUrl || '',
      isCoach: false,
      text,
      sentAt: Timestamp.now(),
      attachments,
      reactionCounts: {},
    }

    const created = doc(ref)
    await setDoc(created, message)
    return this.viewOf({ id: created.id, ...message }, member.id, [])
  }

  async toggleReaction(
    threadId: ThreadId,
    messageId: string,
    emoji: string,
  ): Promise<ChatReaction[]> {
    const member = await this.requireMember()
    const messages = await this.messagesRef(threadId)
    const messageRef = doc(messages, messageId)
    const mineRef = doc(messageRef, 'reactions', member.id)

    const mine = await runTransaction(firebaseDb(), async (tx) => {
      const [messageSnap, mineSnap] = await Promise.all([tx.get(messageRef), tx.get(mineRef)])
      if (!messageSnap.exists()) throw new DataSourceError('Message not found.', 'not-found')

      const current: string[] = mineSnap.exists()
        ? ((mineSnap.data() as { emojis: string[] }).emojis ?? [])
        : []
      const on = current.includes(emoji)
      const next = on ? current.filter((e) => e !== emoji) : [...current, emoji]

      tx.set(mineRef, { emojis: next, updatedAt: serverTimestamp() })

      // An increment on one field rather than a rewrite of the whole map, so
      // two members reacting in the same instant do not overwrite each other.
      // `FieldPath` rather than a dotted string because an emoji is not a
      // field name anyone should be parsing.
      const path = new FieldPath('reactionCounts', emoji)
      const counts = (messageSnap.data() as Message).reactionCounts ?? {}
      const after = (counts[emoji] ?? 0) + (on ? -1 : 1)
      // A zero count is an absent key, not a stored zero: otherwise every
      // emoji anyone ever tried accumulates on the document forever.
      if (after <= 0) tx.update(messageRef, path, deleteField())
      else tx.update(messageRef, path, increment(on ? -1 : 1))

      return next
    })

    const after = await getDoc(messageRef)
    const message = { id: after.id, ...after.data() } as Message
    return this.viewOf(message, member.id, mine).reactions
  }

  // =========================================================================
  // Rewards
  // =========================================================================
  async listEarnedBadges(): Promise<Record<string, EarnedBadge>> {
    const member = await this.requireMember()
    const snap = await getDocs(collection(firebaseDb(), 'members', member.id, 'badges'))
    return Object.fromEntries(snap.docs.map((d) => [d.id, withId<EarnedBadge>(d)]))
  }

  async awardBadge(id: string): Promise<void> {
    const member = await this.requireMember()
    const program = await this.program()
    const def = program.rewards.badges.find((b) => b.id === id)
    if (!def) return

    const db = firebaseDb()
    const ref = doc(db, 'members', member.id, 'badges', id)

    // Keyed by badge id, so awarding twice is a no-op rather than a duplicate.
    // The existence check sits inside the transaction because two screens can
    // both notice the same unlock in the same tick.
    await runTransaction(db, async (tx) => {
      if ((await tx.get(ref)).exists()) return
      const rewardPoints = program.rewards.badgeTierPoints[def.tier]
      tx.set(ref, { badgeId: id, earnedAt: Timestamp.now(), rewardPoints })
      tx.update(doc(db, 'members', member.id), {
        'stats.points': increment(rewardPoints),
        updatedAt: serverTimestamp(),
      })
    })
    this.memberCache = null
  }

  /**
   * The cohort board, read from the projection rather than from `members`.
   *
   * Answering it from `members` would mean granting every member of the cohort
   * read access to everyone's email, weight, injuries and allergies, in order
   * to render a name and a number. `cohorts/{id}/leaderboard` carries only the
   * three fields the board shows. See `LeaderboardEntryDoc`.
   */
  async listLeaderboard(): Promise<LeaderboardEntry[]> {
    const member = await this.requireMember()
    const snap = await getDocs(
      query(
        collection(firebaseDb(), 'cohorts', member.cohortId, 'leaderboard'),
        orderBy('sessions', 'desc'),
        limit(200),
      ),
    )

    const rows: LeaderboardEntry[] = snap.docs.map((d) => {
      const data = d.data() as LeaderboardEntryDoc
      return {
        memberId: d.id,
        name: data.name,
        avatarUrl: data.avatarUrl,
        sessions: data.sessions ?? 0,
        isSelf: d.id === member.id,
      }
    })

    // A member with no qualifying session yet has no projection document, so
    // they would be missing from their own board. Theirs is the one row that
    // always has to be there.
    if (!rows.some((row) => row.isSelf)) {
      rows.push({
        memberId: member.id,
        name: member.profile.displayName || 'You',
        avatarUrl: member.profile.avatarUrl || '',
        sessions: member.stats.sessionsQualified,
        isSelf: true,
      })
    }
    return rows
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

  /** Uploads land in a bucket, so there is no device budget to run out of. */
  async storageFull(): Promise<boolean> {
    return false
  }

  /**
   * Best effort, and deliberately not advertised as more than that.
   *
   * A client cannot delete a document's subcollections — recursive delete lives
   * in the Admin SDK — so this clears what it can address and signs out. A real
   * erasure request has to run server-side; the `members/{uid}` document going
   * away is what a cleanup job keys off.
   */
  async reset(): Promise<void> {
    const member = await this.getMember()
    if (member) {
      const db = firebaseDb()
      const batch = writeBatch(db)
      batch.delete(doc(db, 'members', member.id))
      batch.delete(this.leaderboardRef(member.cohortId, member.id))
      await batch.commit()
    }
    await this.signOut()
  }

  // =========================================================================
  // internals
  // =========================================================================
  private leaderboardRef(cohortId: string, memberId: string) {
    return doc(firebaseDb(), 'cohorts', cohortId, 'leaderboard', memberId)
  }

  private viewOf(message: Message, viewerUid: string, mine: string[]): ChatMessageView {
    const reactions: ChatReaction[] = Object.entries(message.reactionCounts ?? {})
      .filter(([, count]) => count > 0)
      .map(([emoji, count]) => ({ emoji, count, mine: mine.includes(emoji) }))

    return { ...message, isSelf: message.authorUid === viewerUid, reactions }
  }

  private async requireUser(): Promise<User> {
    await authRestored()
    const user = firebaseAuth().currentUser
    if (!user) throw new DataSourceError('You need to sign in first.', 'unauthenticated')
    return user
  }

  private async requireMember(): Promise<Member> {
    if (this.memberCache) return this.memberCache
    const member = await this.getMember()
    if (!member) {
      throw new DataSourceError('No membership on this account yet.', 'unauthenticated')
    }
    return member
  }

  /**
   * The member's program, read once per session.
   *
   * Every write that resolves a reward needs the threshold and the point
   * values, and they cannot change under a running cohort: the version is
   * pinned on the member document, so one read covers the whole session.
   */
  private async program(): Promise<Program> {
    if (this.programCache) return this.programCache
    const member = await this.requireMember()
    const snap = await getDoc(doc(firebaseDb(), 'programs', member.programId))
    if (!snap.exists()) {
      throw new DataSourceError('This cohort has no program attached.', 'not-found')
    }
    this.programCache = { id: snap.id, ...snap.data() } as Program
    return this.programCache
  }

  private touch(member: Member) {
    return {
      updatedAt: serverTimestamp(),
      updatedByUid: member.id,
      updatedByEmail: member.email,
    }
  }

  /**
   * Append-only history, written beside the status change it describes.
   *
   * Nothing reads these to decide anything. They exist so a coach can answer
   * "why has she not logged since week 2" without guessing, which is exactly
   * why a failure here must never take the status change down with it.
   */
  private async writeLifecycleEvent(
    type: 'member.joined' | 'member.paused' | 'member.resumed' | 'member.completed',
    fromStatus: Member['status'] | null,
    toStatus: Member['status'],
    reason: string,
  ): Promise<void> {
    try {
      const member = await this.requireMember()
      const db = firebaseDb()
      await setDoc(doc(collection(db, 'members', member.id, 'lifecycleEvents')), {
        memberId: member.id,
        type,
        fromStatus,
        toStatus,
        reason,
        createdAt: serverTimestamp(),
        createdByUid: member.id,
        createdByEmail: member.email,
      })
    } catch (cause) {
      console.warn('[datasource] could not write lifecycle event', cause)
    }
  }

  private authMessage(cause: unknown): string {
    const code = (cause as { code?: string }).code ?? ''
    if (code === 'auth/invalid-email') return 'That email address doesn’t look right.'
    if (code === 'auth/too-many-requests') return 'Too many attempts. Try again in a few minutes.'
    if (code === 'auth/network-request-failed') return 'No connection. Check your network.'
    return 'Something went wrong. Try again.'
  }
}
