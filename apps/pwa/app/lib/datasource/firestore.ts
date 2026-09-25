import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  getAdditionalUserInfo,
  getRedirectResult,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type User,
  type UserCredential,
} from 'firebase/auth'
import {
  FieldPath,
  Timestamp,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  increment,
  limit,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type CollectionReference,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
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
import {
  EDIT_WINDOW_MS,
  TYPING_REFRESH_MS,
  TYPING_TTL_MS,
  addressedUidsOf,
  typingIsFresh,
} from '~/lib/chat'
import { withShippedBadges } from '~/data/badges'
import { daysBetween, isDateKey, resolvePlanWeek, weekOf } from '~/lib/domain/challenge'
import { liveCallFrom } from '~/lib/domain/liveCall'
import { prescribedSets } from '~/lib/domain/sets'
import { storage as webStorage } from '~/lib/storage'
import { trustedNow } from '~/lib/time'
import type { ProcessedImage } from '~/lib/image'
import {
  DataSourceError,
  type ActiveSessionInput,
  type CheckInInput,
  type DataSource,
  type DeviceClaim,
  type OutgoingMessage,
  type PendingFile,
  type PhotoInput,
  type SessionInput,
  type Unsubscribe,
} from './types'
import type {
  ActiveSessionDoc,
  Announcement,
  AuthProvider,
  AuthUser,
  ChatAttachment,
  ChatMention,
  ChatMessageView,
  ChatReaction,
  ChatReplyRef,
  CheckIn,
  Cohort,
  CohortDoc,
  EarnedBadge,
  Guide,
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
  ProgramDoc,
  ProgramWeek,
  ProgressPhoto,
  RewardConfig,
  SessionLog,
  SignInDoc,
  StoredImage,
  ThreadId,
  TrainingWeek,
  TypingDoc,
  TypingPeer,
  WorkoutDay,
} from '~/data/types'

/**
 * Set while a Google sign-in is away on a full-page redirect.
 *
 * It is the only thing that survives the navigation to say the load coming
 * back was expected. See `resumeSignIn`.
 */
const REDIRECT_PENDING_KEY = 'auth-redirect-pending'

const normaliseEmail = (email: string): string => email.trim().toLowerCase()

/**
 * Enough of a check to catch a typo before it costs a round trip.
 *
 * Deliberately not a full RFC 5322 grammar: the provider validates the address
 * properly on the next line. This just stops "sarah@" reaching the network.
 */
const isEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

/** A code as it is stored. The document id is exactly this. */
const normaliseCode = (code: string): string => code.trim().toUpperCase()

/**
 * The provider's ways of saying "that email and password don't go together".
 *
 * Several, because it depends on the project: with email enumeration protection
 * on — the default for new projects — every mismatch is `invalid-credential`,
 * and without it a wrong password and an unknown address are reported apart.
 */
const CREDENTIAL_MISMATCH = new Set([
  'auth/invalid-credential',
  'auth/invalid-login-credentials',
  'auth/wrong-password',
  'auth/user-not-found',
])

const isCredentialMismatch = (cause: unknown): boolean =>
  CREDENTIAL_MISMATCH.has((cause as { code?: string }).code ?? '')

/**
 * Whether a code's document allows a claim by `uid`, or why not.
 *
 * Shared by the check made before an account exists and the claim inside
 * `redeemAccessCode`, so the screen that calls a code fine and the transaction
 * that spends it cannot disagree about it. `uid` is who is asking, and `null`
 * before sign-up, when nobody is. Resolves to whether the claim is a *reclaim*
 * — see below — and throws a user-facing error for every other answer.
 *
 * Says nothing about `issuedToEmail`. Each caller compares that against the
 * address it has on hand: the one typed at sign-up, the session's at redemption.
 */
const assessSeat = (
  code: string,
  data: DocumentData,
  uid: string | null,
): { reclaiming: boolean } => {
  // Every field the claim rule reads has to exist before anything else is
  // worth checking.
  //
  // A security rule that reads a field the document does not have does not
  // evaluate to false — it errors, and an errored rule is a denied write. So
  // `status`, `expiresAt` and `issuedToEmail` must be *present*, even where
  // their value may be null. The friendly checks below are all written as
  // `data.x && …`, which a missing field sails straight through, so without this
  // a code typed by hand into the console passes every check in this file and
  // then dies in the transaction with nothing but "permission-denied" — several
  // layers below anything that could say which field was missing. See
  // `AccessCodeDoc` for the full shape and `firestore.rules` for the rule this
  // mirrors.
  //
  // `issuedToWhatsapp` is deliberately not in this list. The list exists because
  // a *rule* that reads an absent field errors, and no rule reads that one — it
  // is only copied into the profile at redemption, where `?? ''` handles its
  // absence. Requiring it here would reject every code written before the field
  // existed, in exchange for nothing.
  const missing = (['status', 'expiresAt', 'issuedToEmail', 'cohortId'] as const).filter(
    (field) => !(field in data),
  )
  if (missing.length) {
    console.error(
      `[datasource] accessCodes/${code} is missing: ${missing.join(', ')}. ` +
        'The claim rule reads each of these, and a rule that reads an absent field ' +
        'errors, which denies the write. `issuedToEmail` may be null but must exist.',
    )
    throw new DataSourceError('That code isn’t set up correctly. Contact support.', 'invalid-code')
  }

  if (data.status === 'revoked') {
    throw new DataSourceError('That code has been revoked. Contact support.', 'invalid-code')
  }

  /**
   * This account's own claim, with no member document behind it.
   *
   * The seat is already theirs — `claimedByUid` says so — so the document that
   * seat pays for is gone: deleted, or never written because something failed
   * between the two halves of a previous transaction. Every check below is about
   * whether a *new* claim is allowed, and none of them apply to a seat that was
   * bought and claimed months ago. Answering "that code has already been used"
   * to the person who used it is the one reply that leaves them with nothing to
   * do, on the one screen they are allowed to reach.
   *
   * Only possible with somebody signed in. Before sign-up there is no uid for
   * the claim to name, and a claimed code is simply used.
   */
  const reclaiming = uid !== null && data.status === 'claimed' && data.claimedByUid === uid

  if (data.status === 'claimed' && !reclaiming) {
    throw new DataSourceError('That code has already been used.', 'code-claimed')
  }
  // Anything else is not a state the rule will claim from: it requires
  // `status == 'unused'` exactly, so a typo denies the write in silence.
  if (!reclaiming && data.status !== 'unused') {
    console.error(
      `[datasource] accessCodes/${code} has status "${data.status}". ` +
        'The claim rule requires exactly "unused".',
    )
    throw new DataSourceError('That code isn’t set up correctly. Contact support.', 'invalid-code')
  }
  // Expiry is a deadline on redeeming, not on the membership it bought. A seat
  // claimed inside the window stays claimed after it closes, so this is only
  // asked of a code being claimed now.
  if (!reclaiming && data.expiresAt.toMillis() < Date.now()) {
    throw new DataSourceError('That code has expired. Contact support.', 'code-expired')
  }

  return { reclaiming }
}

/**
 * When this device signed in, as `firestore.rules` sees it: `auth_time` from
 * the ID token, in epoch seconds. See `SignInDoc`.
 *
 * Not forced, because a refreshed token carries the same `auth_time` as the one
 * it replaced. Typed as a string by the SDK; the token holds a number, and the
 * rules compare it as one.
 */
const authTimeOf = async (user: User): Promise<number> =>
  Number((await user.getIdTokenResult()).claims.auth_time)

/** The sign-in holding the account, or `null` before any device has claimed it. */
const latestAuthTime = (snap: DocumentSnapshot<DocumentData>): number | null => {
  const authTime = (snap.data() as Partial<SignInDoc> | undefined)?.authTime
  return typeof authTime === 'number' ? authTime : null
}

/**
 * No connection, as the device claim meets it: a document that was never cached,
 * or a token that had expired and could not be refreshed.
 */
const isOffline = (cause: unknown): boolean => {
  const code = (cause as { code?: string }).code
  return code === 'unavailable' || code === 'auth/network-request-failed'
}

/** The single document under `members/{uid}/state` holding the live workout. */
const ACTIVE_SESSION_ID = 'activeSession'

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`

/** Snapshot → the shape the app handles: stored fields plus the document id. */
const withId = <T>(snap: QueryDocumentSnapshot<DocumentData>): T =>
  ({ id: snap.id, ...snap.data() }) as T

/**
 * The cohort document, with the three member-facing fields defaulted.
 *
 * They were added after cohorts were already being created, so a document
 * written before them has no `liveCall` key at all — and `undefined` reaching
 * a template is a card rendered with a dead button rather than no card. The
 * defaults here are the "not set" reading of each: no call, no board. A live
 * call the admin has only half filled in is also no call; see `liveCallFrom`.
 *
 * Shared by `getCohort` and `watchCohort`, so the boot read and the listener
 * cannot disagree about whether the board is on.
 */
const cohortFrom = (snap: DocumentSnapshot<DocumentData>): Cohort | null => {
  if (!snap.exists()) return null
  const data = snap.data() as Partial<CohortDoc>
  return {
    ...(data as CohortDoc),
    id: snap.id,
    liveCall: liveCallFrom(data.liveCall),
    leaderboardVisible: data.leaderboardVisible === true,
    leaderboardRevealWeek:
      typeof data.leaderboardRevealWeek === 'number' ? data.leaderboardRevealWeek : 1,
  }
}

/**
 * A reward economy with nothing in it.
 *
 * `rewards` is a required field on `ProgramDoc`, and a program document written
 * before it existed does not have one — which is not a hypothetical, it is what
 * is in the database. Every reward path reads through `program.rewards.values`,
 * so an absent block is not a missing number, it is a `TypeError` on the way to
 * saving a workout.
 *
 * So it is defaulted, and defaulted to zero rather than to anything plausible.
 * Zero pays nothing, awards nothing and ranks nobody, which is visibly wrong in
 * a way somebody will report; a guessed 25 RP per session would be invisibly
 * wrong, and would mint points against an economy the coach never authored.
 * `normaliseProgram` names the fix in the console when it substitutes one.
 */
const emptyRewards = (): RewardConfig => ({
  values: { workout: 0, checkIn: 0, progressPhoto: 0, core: 0, cardio: 0 },
  badgeTierPoints: { starter: 0, consistency: 0, elite: 0 },
  badgeTargets: {
    dayRepeats: 0,
    checkInWeeks: 0,
    foundationWeek: 0,
    foundationSessions: 0,
    peakWeek: 0,
    peakSessions: 0,
  },
  ranks: [],
  badges: [],
})

/**
 * Fill in the fields a program document written to an older shape lacks.
 *
 * That includes the badges the app ships (see `data/badges`), so Final Photo
 * Proof shows on every cohort's ladder, locked until earned, and `awardBadge`
 * can find it to pay out. Only onto an authored economy: the empty one pays
 * nothing, and a "+0" tile would be a plausible-looking badge against rewards
 * that were never written.
 */
const normaliseProgram = (id: string, data: Partial<ProgramDoc>): Program => {
  if (!data.rewards) {
    console.warn(
      `[datasource] programs/${id} has no \`rewards\` block, so no points, badges or ` +
        'ranks can be awarded against it. Write one with ' +
        '`bun run seed:program -- --program-id=' +
        id +
        ' --fill --apply`.',
    )
  }
  return {
    ...(data as ProgramDoc),
    id,
    rewards: data.rewards
      ? { ...data.rewards, badges: withShippedBadges(data.rewards.badges ?? []) }
      : emptyRewards(),
  }
}

/**
 * A week as the schedule can use it, or `null` with the reason logged.
 *
 * These documents are typed into the console by hand, and a week whose dates
 * are not dates cannot be placed on the calendar at all — `weekAt` compares
 * them as strings, so "16/09/2026" would sort somewhere nonsensical and quietly
 * move the whole cohort into the wrong week. Dropping it and naming it in the
 * console is the failure somebody can find.
 */
const normaliseWeek = (
  programId: string,
  snap: QueryDocumentSnapshot<DocumentData>,
): ProgramWeek | null => {
  const week = withId<ProgramWeek>(snap)
  const path = `programs/${programId}/weeks/${snap.id}`
  if (!Number.isInteger(week.weekNumber) || week.weekNumber < 1) {
    console.warn(`[datasource] ${path} has no usable \`weekNumber\`; leaving it off the schedule.`)
    return null
  }
  if (!isDateKey(week.startDate) || !isDateKey(week.endDate) || week.endDate < week.startDate) {
    console.warn(
      `[datasource] ${path} needs \`startDate\` and \`endDate\` as YYYY-MM-DD strings, ` +
        'the end on or after the start; leaving it off the schedule.',
    )
    return null
  }
  return { ...week, title: week.title ?? '', subtitle: week.subtitle ?? '' }
}

/**
 * A day, with a date that does not fall inside its week reported.
 *
 * Kept either way — the day is still readable and its id may be in somebody's
 * log — but a day dated outside its week never becomes "today" in it, so the
 * console says so rather than leaving a session that silently never opens.
 */
const normaliseDay = (
  programId: string,
  week: ProgramWeek,
  snap: QueryDocumentSnapshot<DocumentData>,
): WorkoutDay => {
  const day = withId<WorkoutDay>(snap)
  const inWeek =
    isDateKey(day.date) &&
    daysBetween(week.startDate, day.date) >= 0 &&
    daysBetween(day.date, week.endDate) >= 0
  if (!inWeek && !day.optional) {
    console.warn(
      `[datasource] programs/${programId}/weeks/${week.id}/days/${snap.id} has \`date\` ` +
        `"${String(day.date)}", which is not a YYYY-MM-DD inside ${week.startDate}…${week.endDate}. ` +
        'It will not open.',
    )
  }
  return { ...day, weekNumber: week.weekNumber }
}

/**
 * Which provider actually signed this session in.
 *
 * `providerData` is the authoritative list — an account can accumulate more
 * than one provider for the same address, and Firebase links them onto one
 * user rather than creating a second. Google is the interesting one because it
 * carries a name and an avatar; everything else here is a password, including
 * the accounts the old sign-in link made, which Firebase files the same way.
 */
const providerOf = (user: User): AuthProvider =>
  user.providerData.some((p) => p.providerId === GoogleAuthProvider.PROVIDER_ID)
    ? 'google'
    : 'password'

const toAuthUser = (user: User): AuthUser => ({
  uid: user.uid,
  email: user.email ?? '',
  // A Google account has verified the address as a condition of existing, and
  // Firebase does not always mark it so, so the provider itself is taken as the
  // proof. A password account says what Firebase says.
  emailVerified: user.emailVerified || providerOf(user) === 'google',
  displayName: user.displayName ?? '',
  photoUrl: user.photoURL ?? '',
  provider: providerOf(user),
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
  whatsapp: '',
  avatarUrl: '',
})

/**
 * The profile a brand-new member starts with.
 *
 * Google hands over a name and a picture as part of signing in, and asking for
 * them again on the very next screen is asking somebody to retype what they
 * just agreed to share. A password sign-up knows nothing but the address, so
 * that path starts empty and the setup form asks — which is what it is for.
 *
 * `whatsapp` arrives from a third place again: the access code, which carried
 * it from the landing form. It is passed in rather than read off `user`
 * because no auth provider knows it — see `issuedToWhatsapp`.
 */
const initialProfile = (user: User, whatsapp = ''): MemberProfile => ({
  ...emptyProfile(),
  displayName: user.displayName ?? '',
  avatarUrl: user.photoURL ?? '',
  whatsapp,
})

const defaultPreferences = (): MemberPreferences => ({
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
 * Firestore implementation of the app's data contract.
 *
 * Three things are true of every method here and worth stating once.
 *
 * **Server-resolved fields are resolved here.** `weekNumber`, `qualifies` and
 * `rewardPoints` are computed against the program's dated weeks and its
 * threshold, never taken from the caller — see `SessionInput`, which
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
  private weeksCache: TrainingWeek[] | null = null

  /**
   * Which emoji this member put on a given message, keyed by its document path.
   *
   * How many reactions a message has is on the message document and arrives
   * with every snapshot; *whose* they are lives one document below it, in
   * `messages/{id}/reactions/{uid}`. A live thread that re-read those on every
   * change would spend two hundred document reads each time anybody said
   * anything, so each one is read once — when the message first arrives — and
   * moved from here on by `toggleReaction`, which is the only thing in this
   * session that can change it.
   *
   * The cost of caching rather than watching is that a reaction this member
   * adds on their *other* device shows its count here but not its highlight
   * until the thread is reopened. The alternative is a second listener per
   * message. Cleared on sign-out with the rest.
   */
  private readonly myReactions = new Map<string, string[]>()

  /**
   * When this member's typing marker was last written, by document path.
   *
   * The composer says "still typing" on every keystroke; this is what turns
   * that into one write every few seconds. Cleared on sign-out with the rest,
   * and cleared for a thread the moment typing stops, so the next first
   * keystroke is never swallowed by a limit left over from the last message.
   */
  private readonly typingWrittenAt = new Map<string, number>()

  // =========================================================================
  // Auth — email and password, and Google
  //
  // An access code makes the account and nothing else can: the code is read
  // before anybody is signed in, the email it was issued to is checked against
  // the one typed, and only then does an account exist. Google signs in to an
  // account that already does. Everything past `toAuthUser` treats the two
  // identically.
  // =========================================================================

  /** Enabled in the Firebase console under Authentication → Sign-in method. */
  readonly googleSignIn = true

  /** Real codes are sold, not printed on the screen. */
  readonly demoAccessCode = null

  // --- Google ---------------------------------------------------------------

  /**
   * A popup can't come back, so don't open one.
   *
   * On an iOS home-screen app `window.open` hands the URL to Safari, a
   * separate app with no channel back to the one that asked. The popup runs,
   * the member signs in, and the PWA sits on a promise that never settles.
   * `navigator.standalone` is the precise signal for that context — it is iOS
   * Safari's own flag and true only for an installed app — and every other
   * environment, installed Android PWAs included, keeps the popup, which is
   * the path that survives third-party storage partitioning.
   */
  private mustRedirect(): boolean {
    return (navigator as Navigator & { standalone?: boolean }).standalone === true
  }

  private googleProvider(): GoogleAuthProvider {
    const provider = new GoogleAuthProvider()
    // Without this, a browser with one Google session signs that account in
    // silently — which is wrong here, because somebody with two Google accounts
    // has a DP Fitness account behind at most one of them, and they are the only
    // one who knows which.
    provider.setCustomParameters({ prompt: 'select_account' })
    return provider
  }

  async signInWithGoogle(): Promise<AuthUser | null> {
    const auth = firebaseAuth()
    const provider = this.googleProvider()

    if (this.mustRedirect()) return this.startRedirect(provider)

    let credential: UserCredential
    try {
      credential = await signInWithPopup(auth, provider)
    } catch (cause) {
      const code = (cause as { code?: string }).code ?? ''
      // The popup never opened: a blocker, or an environment that has no such
      // thing. Neither is the member's doing, and the redirect works in both.
      if (
        code === 'auth/popup-blocked' ||
        code === 'auth/operation-not-supported-in-this-environment'
      ) {
        return this.startRedirect(provider)
      }
      throw this.authError(cause)
    }
    return this.existingAccount(credential)
  }

  /**
   * Hand the whole document over to Google and return nothing.
   *
   * The write below is what makes the return trip legible. `getRedirectResult`
   * answers `null` both for "no redirect was ever started" and for "one was
   * started and the member backed out of it", and those deserve different
   * screens: silence for the ordinary load, an explanation for the member who
   * just watched themselves get bounced somewhere and back for nothing.
   */
  private async startRedirect(provider: GoogleAuthProvider): Promise<null> {
    webStorage.write(REDIRECT_PENDING_KEY, true)
    try {
      await signInWithRedirect(firebaseAuth(), provider)
    } catch (cause) {
      webStorage.remove(REDIRECT_PENDING_KEY)
      throw this.authError(cause)
    }
    return null
  }

  async resumeSignIn(): Promise<AuthUser | null> {
    const pending = webStorage.read<boolean>(REDIRECT_PENDING_KEY, false)

    let credential
    try {
      credential = await getRedirectResult(firebaseAuth())
    } catch (cause) {
      webStorage.remove(REDIRECT_PENDING_KEY)
      throw this.authError(cause)
    }

    webStorage.remove(REDIRECT_PENDING_KEY)
    if (credential) return this.existingAccount(credential)
    if (pending) {
      throw new DataSourceError('Google sign-in didn’t complete.', 'popup-cancelled')
    }
    return null
  }

  /**
   * The account Google just signed in to, as long as it was there before.
   *
   * Firebase makes an account for any Google identity it has not seen, and
   * nothing on the client stops it doing that for one provider but not another:
   * the project's "Enable create (sign-up)" switch is all-or-nothing, and would
   * take password sign-up with it. So the account is undone here instead, in the
   * same gesture that made it. Nothing was written against it yet — no device
   * claim, no member document — so deleting it leaves nothing behind.
   *
   * If the delete itself fails, the session is ended anyway and the refusal still
   * stands. The account survives in that one case, and a second Google sign-in
   * would find it no longer new; it still has no member document, so it lands on
   * the access-code screen rather than in the app.
   */
  private async existingAccount(credential: UserCredential): Promise<AuthUser> {
    if (getAdditionalUserInfo(credential)?.isNewUser) {
      try {
        await deleteUser(credential.user)
      } catch (cause) {
        console.error('[auth] could not delete the account a Google sign-in created', cause)
        await firebaseSignOut(firebaseAuth()).catch(() => {})
      }
      throw new DataSourceError(
        'There’s no account for that Google address. New here? Start with your access code.',
        'no-account',
      )
    }
    this.memberCache = null
    return toAuthUser(credential.user)
  }

  // --- Access code and password ---------------------------------------------

  async checkAccessCode(code: string): Promise<string> {
    return (await this.readSeat(code)).code
  }

  /**
   * The code's document, checked as far as it can be before anyone signs in.
   *
   * This is the one read in the app made by nobody, and `firestore.rules`
   * allows it for exactly that reason: the code is the secret, so whoever holds
   * it may look it up by name.
   */
  private async readSeat(code: string): Promise<{ code: string; data: DocumentData }> {
    const normalised = normaliseCode(code)
    // A slash is a path separator to `doc()`, which throws on it rather than
    // finding nothing — and no code has one.
    if (!normalised || normalised.includes('/')) {
      throw new DataSourceError(
        normalised
          ? 'That code isn’t valid. Check it against your confirmation email.'
          : 'Enter the access code from your confirmation email.',
        'invalid-code',
      )
    }

    let snap
    try {
      snap = await getDoc(doc(firebaseDb(), 'accessCodes', normalised))
    } catch (cause) {
      const failure = (cause as { code?: string }).code
      if (failure === 'permission-denied') {
        console.error(
          '[datasource] Firestore refused to read an access code for a visitor who is not ' +
            'signed in. The check runs before an account exists, so `allow get` on ' +
            '`accessCodes` must not require sign-in — deploy `firestore.rules`.',
          cause,
        )
        throw new DataSourceError(
          'We couldn’t check that code just now. Contact support.',
          'unknown',
        )
      }
      if (failure === 'unavailable') {
        throw new DataSourceError(
          'We couldn’t check that code. Check your connection and try again.',
          'unknown',
        )
      }
      throw this.readError(cause)
    }

    if (!snap.exists()) {
      throw new DataSourceError(
        'That code isn’t valid. Check it against your confirmation email.',
        'invalid-code',
      )
    }
    const data = snap.data()
    assessSeat(normalised, data, null)
    return { code: normalised, data }
  }

  async createAccount(code: string, email: string, password: string): Promise<AuthUser> {
    const address = normaliseEmail(email)
    if (!isEmail(address)) {
      throw new DataSourceError(
        'Enter the email address your access code was sent to.',
        'invalid-email',
      )
    }

    const { data } = await this.readSeat(code)

    // Checked here as well as by the claim rule, and before the account rather
    // than after it: the rule would refuse the redemption, but only once an
    // account had been made for an address the code never paid for. A code with
    // no address on it — issued by hand — makes an account for whoever holds it.
    //
    // The address is never handed back. A member who typed the wrong one is told
    // so, not told which one it should have been.
    if (data.issuedToEmail && normaliseEmail(data.issuedToEmail) !== address) {
      throw new DataSourceError(
        'That isn’t the email your access code was sent to. Use the one you registered with.',
        'code-wrong-email',
      )
    }

    let credential: UserCredential
    try {
      credential = await createUserWithEmailAndPassword(firebaseAuth(), address, password)
    } catch (cause) {
      if ((cause as { code?: string }).code !== 'auth/email-already-in-use') {
        throw this.authError(cause)
      }
      credential = await this.resumeAccount(address, password)
    }

    this.memberCache = null
    return toAuthUser(credential.user)
  }

  /**
   * Back in to an account an earlier sign-up already made.
   *
   * The code above is still unused, so whoever made this account never finished
   * redeeming it — and the password they just chose is the one they chose last
   * time, if it was them. A match finishes the sign-up; a mismatch is somebody
   * whose way in is the sign-in screen.
   */
  private async resumeAccount(email: string, password: string): Promise<UserCredential> {
    try {
      return await signInWithEmailAndPassword(firebaseAuth(), email, password)
    } catch (cause) {
      if (isCredentialMismatch(cause)) {
        throw new DataSourceError(
          'There’s already an account with this email. Sign in instead.',
          'account-exists',
        )
      }
      throw this.authError(cause)
    }
  }

  async signInWithPassword(email: string, password: string): Promise<AuthUser> {
    const address = normaliseEmail(email)
    if (!isEmail(address)) {
      throw new DataSourceError('Enter the email address you signed up with.', 'invalid-email')
    }
    if (!password) {
      throw new DataSourceError('Enter your password.', 'invalid-credentials')
    }
    try {
      const credential = await signInWithEmailAndPassword(firebaseAuth(), address, password)
      this.memberCache = null
      return toAuthUser(credential.user)
    } catch (cause) {
      throw this.authError(cause)
    }
  }

  /**
   * Where the provider's reset page offers to send the member afterwards.
   *
   * On iOS that "continue" opens in Safari rather than the home-screen app, and
   * nothing is lost: the reset has already happened on the provider's page, and
   * the app only needs the new password typed into it.
   */
  async sendPasswordReset(email: string): Promise<void> {
    const address = normaliseEmail(email)
    if (!isEmail(address)) {
      throw new DataSourceError('Enter the email address you signed up with.', 'invalid-email')
    }
    try {
      await sendPasswordResetEmail(firebaseAuth(), address, {
        url: `${window.location.origin}/sign-in`,
      })
    } catch (cause) {
      // Only a project without email enumeration protection says this, and
      // repeating it would tell a stranger the address has no account.
      if ((cause as { code?: string }).code === 'auth/user-not-found') return
      throw this.authError(cause)
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
    this.weeksCache = null
    this.myReactions.clear()
    this.typingWrittenAt.clear()
    webStorage.clear()
  }

  // --- One device at a time -------------------------------------------------
  //
  // Signing out does not touch `signIns/{uid}`, on purpose. Clearing it would
  // let a device that was signed out while offline come back, find nothing
  // there, and claim the account again.

  async claimDevice(): Promise<DeviceClaim> {
    const user = await this.requireUser()
    const ref = this.signInRef(user.uid)
    try {
      const [mine, snap] = await Promise.all([authTimeOf(user), getDoc(ref)])
      // From the cache means offline. The cache cannot say whether the account
      // has signed in anywhere since, and a claim written now would not resolve
      // until there was a connection. `watchDevice` settles it once there is.
      if (snap.metadata.fromCache) return 'claimed'
      return await this.settleClaim(ref, mine, latestAuthTime(snap))
    } catch (cause) {
      if (isOffline(cause)) return 'claimed'
      throw cause
    }
  }

  async watchDevice(
    onSuperseded: () => void,
    onError?: (error: unknown) => void,
  ): Promise<Unsubscribe> {
    const user = await this.requireUser()
    const ref = this.signInRef(user.uid)

    let stopped = false

    const stop = onSnapshot(
      ref,
      // Without metadata changes, a device that loaded offline never hears
      // from the server once it reconnects if nothing changed, and never gets
      // to write the claim `claimDevice` had to skip.
      { includeMetadataChanges: true },
      (snap) => {
        // Only the server knows about a sign-in on another device. The cache
        // repeats what this device already knew, and a pending write is this
        // device's own claim on its way out.
        if (stopped || snap.metadata.fromCache || snap.metadata.hasPendingWrites) return
        authTimeOf(user)
          .then((mine) => this.settleClaim(ref, mine, latestAuthTime(snap)))
          .then((claim) => {
            if (stopped || claim !== 'superseded') return
            stopped = true
            stop()
            onSuperseded()
          })
          .catch((cause) => console.warn('[datasource] could not check this device’s sign-in', cause))
      },
      (error) => {
        if (!stopped) onError?.(error)
      },
    )

    return () => {
      stopped = true
      stop()
    }
  }

  /**
   * Decide which sign-in holds the account, and claim it if it is this one.
   *
   * A later sign-in wins. Anything else, including no claim at all, is this
   * device's to take. The rules refuse a claim older than the one there, so
   * two devices writing at once cannot end with the older one holding it.
   */
  private async settleClaim(
    ref: DocumentReference<DocumentData>,
    mine: number,
    latest: number | null,
  ): Promise<DeviceClaim> {
    if (latest !== null && latest > mine) return 'superseded'
    if (latest !== mine) {
      await setDoc(ref, { authTime: mine, signedInAt: serverTimestamp() })
    }
    return 'claimed'
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
    const normalised = normaliseCode(code)
    if (!normalised || normalised.includes('/')) {
      throw new DataSourceError(
        normalised
          ? 'That code isn’t valid or has already been used.'
          : 'Enter the access code from your confirmation email.',
        'invalid-code',
      )
    }

    const db = firebaseDb()
    const codeRef = doc(db, 'accessCodes', normalised)
    const memberRef = doc(db, 'members', user.uid)

    // Recorded on the membership, and required there by the rules: it is what
    // decides whether a later Google sign-in needs a verified address. Read off
    // the token because that is the value the rules compare it with.
    const joinedWith = (await user.getIdTokenResult()).signInProvider ?? ''

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

      // A reclaim rebuilds the member document for a seat this uid already
      // holds. Nothing is granted that the claim did not already grant: the code
      // is not re-claimed, and the document is rebuilt for the uid it names.
      const { reclaiming } = assessSeat(normalised, codeData, user.uid)

      // A code issued against a purchase can only be redeemed by that buyer.
      // `createAccount` has already checked the address typed at sign-up; this
      // is the session's, which is what the claim rule compares, and it can
      // differ — a Google account, or an account from before sign-up began with
      // the code. Compared case-insensitively: the password path lowercases what
      // the member typed, Google returns whatever case the account was created
      // with, and an admin types the address into the console by hand. Three
      // sources, one address, and a capital letter must not cost a seat.
      if (
        codeData.issuedToEmail &&
        normaliseEmail(codeData.issuedToEmail) !== normaliseEmail(user.email ?? '')
      ) {
        throw new DataSourceError(
          'That code was issued to a different email address.',
          'code-wrong-email',
        )
      }

      const now = Timestamp.now()
      // The challenge clock runs from here, and for a rebuilt document that
      // has to be the original claim rather than today — otherwise a member in
      // week six comes back to the app in week one, with their own logged
      // sessions sitting in weeks that no longer exist.
      const joinedAt = (reclaiming && codeData.claimedAt) || now
      const created: MemberDoc = {
        email: user.email ?? '',
        emailVerified: user.emailVerified,
        joinedWith,
        status: 'onboarding',
        previousStatus: null,
        pauseReason: null,
        pausedAt: null,
        cohortId: codeData.cohortId,
        cohortName: codeData.cohortName,
        programId: codeData.programId ?? '',
        programVersion: codeData.programVersion ?? 1,
        accessCode: normalised,
        joinedAt,
        // The number the landing form asked for, finally landing somewhere the
        // member owns. Empty for a code issued by hand, which never had one.
        profile: initialProfile(user, codeData.issuedToWhatsapp ?? ''),
        prefs: defaultPreferences(),
        stats: emptyStats(),
        createdAt: now,
        updatedAt: now,
        updatedByUid: user.uid,
        updatedByEmail: user.email ?? '',
      }

      tx.set(memberRef, created)

      // The roster, written the moment the seat is claimed.
      //
      // `cohorts/{id}/leaderboard` is the only collection one member may read
      // about another — member documents carry email, weight, injuries and
      // allergies, and the rules never open them to a peer. So this projection
      // is not merely the board's data source: it is the *entire* answer to
      // "who is in my cohort", and a member with no row here is invisible to
      // everyone they train alongside. They cannot be counted, listed, or named
      // with an `@` in chat.
      //
      // It used to be written first at the display-name step of setup, which
      // left every member invisible between redeeming their code and finishing
      // setup, and invisible permanently if they never finished. Writing it
      // here makes the roster complete by construction: one row per member, for
      // as long as they hold the seat, deleted with them by `deleteAccount`.
      //
      // Merged, and deliberately without `sessions`. A rebuilt member document
      // — see `reclaiming` above — may well have a row already, and a count
      // written here would reset a board position that was earned. The field
      // stays absent until `saveSession` creates it, which `listLeaderboard`
      // reads as zero.
      tx.set(
        this.leaderboardRef(codeData.cohortId, user.uid),
        {
          // Google hands over a name at sign-in; a password does not, and
          // setup is where that member picks one. Same fallback the other
          // two writers use, so the board reads consistently whoever wrote last.
          name: created.profile.displayName || 'Member',
          avatarUrl: created.profile.avatarUrl || '',
          updatedAt: now,
        },
        { merge: true },
      )

      // Only a first claim writes to the code. A rebuild has nothing to say
      // there — the seat is already marked claimed, by this uid, at the instant
      // it happened — and the rule would refuse it anyway: it allows the
      // `unused` → `claimed` transition and nothing else.
      if (!reclaiming) {
        tx.update(codeRef, {
          status: 'claimed',
          claimedByUid: user.uid,
          // The console shows this beside the claimed code, so it takes the
          // real name when the provider gave one and falls back to the address.
          claimedByName: user.displayName || user.email || '',
          claimedAt: now,
          updatedAt: now,
          updatedByUid: user.uid,
          updatedByEmail: user.email ?? '',
        })
      }

      return { id: user.uid, ...created }
    })

    this.memberCache = member
    await this.writeLifecycleEvent('member.joined', null, 'onboarding', 'Redeemed access code')
    return member
  }

  async getMember(): Promise<Member | null> {
    const user = await currentUser()
    if (!user) return null
    try {
      const snap = await getDoc(doc(firebaseDb(), 'members', user.uid))
      this.memberCache = snap.exists() ? ({ id: snap.id, ...snap.data() } as Member) : null
      return this.memberCache
    } catch (cause) {
      // This is the first Firestore read on the sign-in path, so it is where a
      // database that cannot be reached at all first shows up — and it shows up
      // *after* the provider has already succeeded, which is the confusing part.
      throw this.readError(cause)
    }
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
  // Authored content — `programs/{id}` and `cohorts/{id}`
  //
  // Read once per load and not watched. All of it is coach-authored and pinned
  // by version, so it cannot change under a member mid-session; a reload is
  // the refresh, which is the same contract the program has always had.
  // =========================================================================
  async getProgram(): Promise<Program> {
    return this.program()
  }

  async listProgramWeeks(): Promise<TrainingWeek[]> {
    return this.weeks()
  }

  /**
   * The guide library, ordered the way the screen reads it: by the week each
   * one opens, then by title inside a week.
   *
   * Sorted here rather than by Firestore. Two order-bys on one collection want
   * a composite index, and this collection is a couple of dozen documents that
   * are all being read anyway — an index to save a sort of 24 items is a
   * deploy step that buys nothing.
   */
  async listGuides(): Promise<Guide[]> {
    const program = await this.program()
    const snap = await getDocs(collection(firebaseDb(), 'programs', program.id, 'guides'))
    return snap.docs
      .map((d) => withId<Guide>(d))
      .sort((a, b) => a.unlockWeek - b.unlockWeek || a.title.localeCompare(b.title))
  }

  /** The cohort document, defaulted. See `cohortFrom`. */
  async getCohort(): Promise<Cohort | null> {
    const member = await this.requireMember()
    return cohortFrom(await getDoc(doc(firebaseDb(), 'cohorts', member.cohortId)))
  }

  /** One `onSnapshot` on the document `getCohort` reads, normalised the same way. */
  async watchCohort(
    onCohort: (cohort: Cohort | null) => void,
    onError?: (error: unknown) => void,
  ): Promise<Unsubscribe> {
    const member = await this.requireMember()

    let stopped = false

    const stop = onSnapshot(
      doc(firebaseDb(), 'cohorts', member.cohortId),
      (snap) => {
        if (!stopped) onCohort(cohortFrom(snap))
      },
      (error) => {
        if (!stopped) onError?.(error)
      },
    )

    return () => {
      stopped = true
      stop()
    }
  }

  async watchAnnouncements(
    onAnnouncements: (announcements: Announcement[]) => void,
    onError?: (error: unknown) => void,
  ): Promise<Unsubscribe> {
    const member = await this.requireMember()

    let stopped = false

    const stop = onSnapshot(
      query(
        collection(firebaseDb(), 'cohorts', member.cohortId, 'announcements'),
        orderBy('publishedAt', 'desc'),
        limit(20),
      ),
      (snap) => {
        if (stopped) return
        onAnnouncements(snap.docs.map((d) => withId<Announcement>(d)))
      },
      (error) => {
        if (!stopped) onError?.(error)
      },
    )

    return () => {
      stopped = true
      stop()
    }
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

    try {
      const ref = storageRef(firebaseStorage(), path)
      await uploadString(ref, image.dataUrl, 'data_url', { contentType: 'image/jpeg' })

      return {
        storagePath: path,
        downloadUrl: await getDownloadURL(ref),
        width: image.width,
        height: image.height,
        bytes: image.bytes,
      }
    } catch (cause) {
      throw this.uploadError(cause, path)
    }
  }

  async uploadAttachment(file: PendingFile): Promise<ChatAttachment> {
    const member = await this.requireMember()
    const path = `chat/${member.cohortId}/${member.id}/${uid()}`

    try {
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
    } catch (cause) {
      throw this.uploadError(cause, path)
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
    // themselves can only ever help, and sets they removed still count. The
    // fallback covers a session made entirely of added sets, which has no
    // prescription to measure against.
    const setsPrescribed = log.exercises.reduce((n, e) => n + prescribedSets(e), 0)
    const denominator = setsPrescribed || log.setsTotal
    const qualifies =
      denominator > 0 && (log.setsDone / denominator) * 100 >= program.qualifyingSetPercent

    const rewardPoints = qualifies ? program.rewards.values.workout : 0
    const weekNumber = weekOf(await this.weeks(), log.completedAt)
    const record: Omit<SessionLog, 'id'> = {
      ...log,
      weekNumber,
      planWeek: resolvePlanWeek(log.planWeek, weekNumber),
      qualifies,
      rewardPoints,
      // The program that actually decided the two fields above, not whatever
      // the member document says — which for a member whose code carried no
      // `programId` is the empty string. See `program()`.
      programId: program.id,
      programVersion: program.version ?? member.programVersion,
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
    const weekNumber = weekOf(await this.weeks(), submittedAt)

    const record = {
      ...input,
      weekNumber,
      submittedAt,
      rewardPoints: program.rewards.values.checkIn,
    }

    const db = firebaseDb()
    // The week is the document id, so one check-in per week is enforced by the
    // key rather than by a query. A sent check-in is final, and the rules
    // refuse the overwrite regardless. The read is here for the refusal: a
    // member who already sent this week, from this device or another, gets the
    // sentence rather than a raw `permission-denied`. Inside the transaction
    // because two devices can both find the week empty in the same moment.
    const id = `week-${weekNumber}`
    const ref = doc(db, 'members', member.id, 'checkIns', id)

    await runTransaction(db, async (tx) => {
      if ((await tx.get(ref)).exists()) {
        throw new DataSourceError(
          `Your week ${weekNumber} check-in is already in.`,
          'check-in-submitted',
        )
      }
      tx.set(ref, record)
      tx.update(doc(db, 'members', member.id), {
        'stats.checkInsSubmitted': increment(1),
        'stats.points': increment(record.rewardPoints),
        updatedAt: serverTimestamp(),
      })
    })

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
    // The trusted clock, the one a session's `completedAt` is stamped on: Final
    // Photo Proof asks whether this came after the block's last session, and
    // two clocks would let a phone set a few hours slow answer that wrongly.
    const takenAt = Timestamp.fromDate(trustedNow())

    // Upload first: a document pointing at a file that failed to upload renders
    // as a broken tile, whereas an orphaned upload is only wasted bytes.
    const image = await this.uploadImage(input.image, 'progress')

    const record = {
      pose: input.pose,
      weekNumber: weekOf(await this.weeks(), takenAt),
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
  async watchNotifications(
    onNotifications: (notifications: Notification[]) => void,
    onError?: (error: unknown) => void,
  ): Promise<Unsubscribe> {
    const member = await this.requireMember()

    let stopped = false

    const stop = onSnapshot(
      query(
        collection(firebaseDb(), 'cohorts', member.cohortId, 'notifications'),
        orderBy('pinned', 'desc'),
        orderBy('publishedAt', 'desc'),
        limit(50),
      ),
      (snap) => {
        if (stopped) return
        onNotifications(snap.docs.map((d) => withId<Notification>(d)))
      },
      (error) => {
        if (!stopped) onError?.(error)
      },
    )

    return () => {
      stopped = true
      stop()
    }
  }

  /**
   * One query over the cohort thread: `addressedUids` contains this member.
   *
   * Needs the composite index in `firestore.indexes.json` (`addressedUids`
   * array-contains, `sentAt` descending). Until that has built, the listener
   * fails with `failed-precondition` and the inbox simply has no mentions in it.
   * The rules need nothing new: a member can already read every message in the
   * cohort thread, and this reads a subset of them.
   *
   * Only the cohort thread. The coach DM is between two people, so every message
   * in it is aimed at the member, and the chat tab's dot already says so.
   */
  async watchAddressedMessages(
    onMessages: (messages: Message[]) => void,
    onError?: (error: unknown) => void,
  ): Promise<Unsubscribe> {
    const member = await this.requireMember()
    const ref = await this.messagesRef('cohort')

    let stopped = false

    const stop = onSnapshot(
      query(
        ref,
        where('addressedUids', 'array-contains', member.id),
        orderBy('sentAt', 'desc'),
        limit(50),
      ),
      (snap) => {
        if (stopped) return
        onMessages(snap.docs.map((d) => withId<Message>(d)))
      },
      (error) => {
        if (!stopped) onError?.(error)
      },
    )

    return () => {
      stopped = true
      stop()
    }
  }

  /**
   * One query over the cohort thread: this member's messages, by `reactedAt`.
   *
   * Ordering on `reactedAt` is also the filter, since Firestore leaves out any
   * document without the field, and that is every message nobody else has
   * reacted to. Needs the `authorUid` + `reactedAt` index in
   * `firestore.indexes.json`; until it has built, the inbox has no reactions in
   * it and nothing else is affected. Only the cohort thread, for the reason
   * given on `watchAddressedMessages`.
   */
  async watchReactedMessages(
    onMessages: (messages: Message[]) => void,
    onError?: (error: unknown) => void,
  ): Promise<Unsubscribe> {
    const member = await this.requireMember()
    const ref = await this.messagesRef('cohort')

    let stopped = false

    const stop = onSnapshot(
      query(
        ref,
        where('authorUid', '==', member.id),
        orderBy('reactedAt', 'desc'),
        limit(50),
      ),
      (snap) => {
        if (stopped) return
        onMessages(snap.docs.map((d) => withId<Message>(d)))
      },
      (error) => {
        if (!stopped) onError?.(error)
      },
    )

    return () => {
      stopped = true
      stop()
    }
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

  async markNotificationsRead(ids: string[]): Promise<void> {
    if (!ids.length) return
    const member = await this.requireMember()
    const db = firebaseDb()
    const batch = writeBatch(db)
    // A batch takes 500 writes, and the inbox is two lists of at most 50.
    for (const id of ids) {
      batch.set(
        doc(db, 'members', member.id, 'notificationState', id),
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

  private async typingRef(threadId: ThreadId) {
    const member = await this.requireMember()
    const resolved = await this.resolveThread(threadId)
    return collection(
      firebaseDb(),
      'cohorts',
      member.cohortId,
      'threads',
      resolved,
      'typing',
    )
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

  /**
   * The thread's last 200 messages, oldest first. Shared by both readers.
   *
   * `limitToLast`, not `limit`. With the order ascending, `limit(200)` is the
   * *first* 200 messages ever sent, so a thread froze the moment it passed two
   * hundred: nothing said after that was inside the window, and the live
   * listener never saw it — not somebody else's message, not your own. This
   * takes the 200 at the far end and still hands them back oldest first,
   * which is the order the screen draws in.
   */
  private threadQuery(ref: CollectionReference<DocumentData>) {
    return query(ref, orderBy('sentAt', 'asc'), limitToLast(200))
  }

  /**
   * This member's own reactions, read once per message and kept.
   *
   * The member's own reactions live one document below each message, so they
   * arrive separately and are folded in by `viewOf` — the same two halves the
   * on-device implementation keeps apart, for the same reason. Reading only
   * the ones missing from `myReactions` is what makes a live thread affordable:
   * on the first snapshot that is every message, and on every snapshot after
   * it, only the messages that have just been sent.
   *
   * A refused read resolves to no reactions rather than throwing. It means the
   * highlight under one message is missing; it should not take the thread down.
   */
  private async cacheMyReactions(
    docs: QueryDocumentSnapshot<DocumentData>[],
    viewerUid: string,
  ): Promise<void> {
    const fresh = docs.filter((d) => !this.myReactions.has(d.ref.path))
    if (!fresh.length) return

    await Promise.all(
      fresh.map((d) =>
        getDoc(doc(d.ref, 'reactions', viewerUid))
          .then((r) => (r.exists() ? ((r.data() as { emojis: string[] }).emojis ?? []) : []))
          .catch(() => [] as string[])
          .then((emojis) => {
            this.myReactions.set(d.ref.path, emojis)
          }),
      ),
    )
  }

  async listMessages(threadId: ThreadId): Promise<ChatMessageView[]> {
    const member = await this.requireMember()
    const ref = await this.messagesRef(threadId)
    const snap = await getDocs(this.threadQuery(ref))

    await this.cacheMyReactions(snap.docs, member.id)

    return snap.docs.map((d) =>
      this.viewOf(
        withId<Message>(d),
        member.id,
        this.myReactions.get(d.ref.path) ?? [],
        d.metadata.hasPendingWrites,
      ),
    )
  }

  /**
   * The live thread.
   *
   * One `onSnapshot` over the same query `listMessages` runs, which is what
   * makes the group chat a group chat: Firestore holds the stream open and
   * pushes each change down it, so a message someone else sends is on this
   * screen without anybody reloading or polling.
   *
   * It also covers this member's own sends, and does it before the write has
   * reached the server — the SDK replays local writes to its own listeners
   * immediately, so the bubble appears at once and is simply confirmed a moment
   * later. That is why `sendMessage`'s return value need not be appended by
   * hand.
   *
   * "Confirmed a moment later" is the tick, and it is why this listens with
   * `includeMetadataChanges`. When the server acknowledges a message nothing
   * in it changes — every field was written here — so a listener that only
   * hears about data would never hear that it landed, and the clock on it
   * would stay up for good. `hasPendingWrites` is the SDK's own answer to "has
   * the server got this yet", and it survives a reload: a message sent
   * offline sits in the persistent cache's queue, comes back from it pending,
   * and goes out when the connection does. See `ChatDelivery`.
   */
  async watchMessages(
    threadId: ThreadId,
    onMessages: (messages: ChatMessageView[]) => void,
    onError?: (error: unknown) => void,
  ): Promise<Unsubscribe> {
    const member = await this.requireMember()
    const ref = await this.messagesRef(threadId)

    let stopped = false
    let latest = 0
    let delivered = false
    let lastPending = ''

    const publish = (docs: QueryDocumentSnapshot<DocumentData>[]) => {
      onMessages(
        docs.map((d) =>
          this.viewOf(
            withId<Message>(d),
            member.id,
            this.myReactions.get(d.ref.path) ?? [],
            d.metadata.hasPendingWrites,
          ),
        ),
      )
    }

    const stop = onSnapshot(
      this.threadQuery(ref),
      { includeMetadataChanges: true },
      async (snap) => {
        if (stopped) return

        // Metadata changes include the ones nobody can see: the snapshot going
        // from cached to confirmed, the connection coming and going. Each is a
        // whole thread republished and written to disk for nothing, so the
        // only metadata change let through is the one that moves a clock to a
        // tick. Before `latest` is bumped, so a skipped snapshot does not
        // cancel a reaction lookup that a real one is still waiting on.
        const pending = snap.docs
          .filter((d) => d.metadata.hasPendingWrites)
          .map((d) => d.id)
          .join()
        if (delivered && !snap.docChanges().length && pending === lastPending) return
        delivered = true
        lastPending = pending

        const seq = (latest += 1)

        // Draw the thread out of the snapshot first, before going anywhere for
        // the reactions.
        //
        // `cacheMyReactions` is a document read per message nobody has seen
        // yet — two hundred of them on a thread being opened for the first
        // time — and this used to await all of them before publishing
        // anything. So the screen stayed empty for the length of the slowest
        // one, showing nothing, when the messages themselves had been in hand
        // since the first line of this callback.
        //
        // What the first pass is missing is which chips are the member's own.
        // That is a highlight on a reaction, not the conversation, and it
        // arrives a moment later in the second publish below.
        const complete = snap.docs.every((d) => this.myReactions.has(d.ref.path))
        publish(snap.docs)
        if (complete) return

        await this.cacheMyReactions(snap.docs, member.id)

        // A snapshot that landed while those reads were in flight has already
        // published a newer version of the thread; publishing this one now
        // would put it back the way it was a moment ago. Same reason the
        // unsubscribed check is here and not only at the top.
        if (stopped || seq !== latest) return

        publish(snap.docs)
      },
      (error) => {
        // Firestore does not retry after this: the listener is finished, and
        // the caller has to be told rather than left on a thread that has
        // quietly stopped updating.
        if (!stopped) onError?.(error)
      },
    )

    return () => {
      stopped = true
      stop()
    }
  }

  /**
   * The top of the thread, live, for the unread dot.
   *
   * One document rather than two hundred: `orderBy('sentAt', 'desc')` with
   * `limit(1)`. This listener is open on every screen in the app, so what it
   * costs on a cold load is what the badge costs, and after that Firestore
   * only sends the message that has just arrived.
   *
   * No reaction lookup. A dot does not care who reacted, and `cacheMyReactions`
   * would put a read per message behind a subscription whose whole point is
   * that it is cheap.
   */
  async watchLatestMessage(
    threadId: ThreadId,
    onMessage: (message: Message | null) => void,
    onError?: (error: unknown) => void,
  ): Promise<Unsubscribe> {
    const ref = await this.messagesRef(threadId)

    let stopped = false

    const stop = onSnapshot(
      query(ref, orderBy('sentAt', 'desc'), limit(1)),
      (snap) => {
        if (stopped) return
        const [newest] = snap.docs
        onMessage(newest ? withId<Message>(newest) : null)
      },
      (error) => {
        if (!stopped) onError?.(error)
      },
    )

    return () => {
      stopped = true
      stop()
    }
  }

  async sendMessage(
    threadId: ThreadId,
    text: string,
    attachments: ChatAttachment[] = [],
    replyTo: ChatReplyRef | null = null,
    mentions: ChatMention[] = [],
    outgoing?: OutgoingMessage,
  ): Promise<ChatMessageView> {
    const member = await this.requireMember()
    const ref = await this.messagesRef(threadId)

    const message: Omit<Message, 'id'> = {
      authorUid: member.id,
      authorName: member.profile.displayName || 'You',
      authorAvatarUrl: member.profile.avatarUrl || '',
      isCoach: false,
      text,
      sentAt: outgoing?.sentAt ?? Timestamp.now(),
      editedAt: null,
      attachments,
      replyTo,
      mentions,
      addressedUids: addressedUidsOf({ authorUid: member.id, mentions, replyTo }),
      reactionCounts: {},
    }

    // Resolves when the server has it, not when the write is queued: offline,
    // that is whenever the connection comes back, which is what keeps the
    // outbox's clock honest. The listener has shown the bubble since the line
    // above it ran.
    const created = outgoing ? doc(ref, outgoing.id) : doc(ref)
    await setDoc(created, message)
    return this.viewOf({ id: created.id, ...message }, member.id, [])
  }

  /**
   * Say, or stop saying, that this member is composing.
   *
   * Rate-limited here rather than at the call site, because the reason for the
   * limit is the cost of the write and its fan-out, and that is this layer's
   * concern. `true` writes at most once every `TYPING_REFRESH_MS`; `false`
   * always deletes, because the one thing that must never be dropped is the
   * message that somebody has stopped.
   *
   * Never throws. A refused marker means an indicator nobody sees; it must not
   * reach the composer, which is in the middle of a keystroke.
   */
  async setTyping(threadId: ThreadId, typing: boolean): Promise<void> {
    try {
      const member = await this.requireMember()
      const ref = doc(await this.typingRef(threadId), member.id)
      const key = ref.path

      if (!typing) {
        this.typingWrittenAt.delete(key)
        await deleteDoc(ref)
        return
      }

      const last = this.typingWrittenAt.get(key) ?? 0
      if (Date.now() - last < TYPING_REFRESH_MS) return
      this.typingWrittenAt.set(key, Date.now())

      const marker: TypingDoc = {
        name: member.profile.displayName || 'Someone',
        // The server's clock, not this device's. Freshness is compared across
        // phones, and a member whose clock is a minute fast would otherwise
        // appear to be typing for a minute after they stopped.
        at: serverTimestamp() as unknown as Timestamp,
      }
      await setDoc(ref, marker)
    } catch (cause) {
      console.error('[chat] typing marker failed', cause)
    }
  }

  /**
   * Who else is composing, live.
   *
   * Two things end an indicator: the writer deleting their marker, which
   * arrives as a snapshot, and the marker going stale, which does not arrive as
   * anything at all. The timer is for the second — a phone that went into a
   * tunnel mid-sentence writes nothing more and deletes nothing, and without a
   * clock on this side it would leave somebody typing forever.
   */
  async watchTyping(
    threadId: ThreadId,
    onTyping: (peers: TypingPeer[]) => void,
    onError?: (error: unknown) => void,
  ): Promise<Unsubscribe> {
    const member = await this.requireMember()
    const ref = await this.typingRef(threadId)

    let stopped = false
    let latest: TypingPeer[] = []
    let expiry: ReturnType<typeof setTimeout> | null = null

    const publish = () => {
      if (stopped) return
      if (expiry) clearTimeout(expiry)
      expiry = null

      const now = trustedNow().getTime()
      const fresh = latest.filter((peer) => typingIsFresh(peer.at, now))
      onTyping(fresh)

      // Wake once, when the oldest of them is due to expire, rather than
      // polling a list that is empty almost all of the time.
      if (!fresh.length) return
      const oldest = Math.min(...fresh.map((peer) => peer.at.toMillis()))
      expiry = setTimeout(publish, Math.max(500, oldest + TYPING_TTL_MS - now))
    }

    const stop = onSnapshot(
      ref,
      (snap) => {
        latest = snap.docs
          .filter((d) => d.id !== member.id)
          .map((d) => {
            const data = d.data() as TypingDoc
            return { uid: d.id, name: data.name ?? '', at: data.at }
          })
          // A marker written a moment ago on another device arrives before the
          // server has resolved its timestamp. Dropping it is right: it will be
          // back, with a real instant on it, on the very next snapshot.
          .filter((peer): peer is TypingPeer => Boolean(peer.at))
        publish()
      },
      (error) => {
        if (!stopped) onError?.(error)
      },
    )

    return () => {
      stopped = true
      if (expiry) clearTimeout(expiry)
      stop()
    }
  }

  /**
   * Rewrite a sent message, inside the window and not a second after it.
   *
   * A read before the write rather than a transaction, because there is nothing
   * here to lose a race over: the only field this touches is the author's own
   * `text`, nobody else may write it, and the author editing from two devices
   * at once simply gets the later of their two corrections. What the read is
   * for is the refusal — a member who has held the menu open past the window
   * deserves the sentence rather than a raw `permission-denied` from the rules.
   *
   * `serverTimestamp()` for `editedAt`, never a value from here. "Edited" is a
   * claim about when, and the client is the one party with a motive to lie
   * about it; the rule requires the field to equal `request.time`, which is
   * what a sentinel resolves to and what a number never will.
   */
  async editMessage(
    threadId: ThreadId,
    messageId: string,
    text: string,
    mentions: ChatMention[] = [],
  ): Promise<ChatMessageView> {
    const member = await this.requireMember()
    const messages = await this.messagesRef(threadId)
    const messageRef = doc(messages, messageId)

    const trimmed = text.trim()
    if (!trimmed) {
      throw new DataSourceError('An edited message still has to say something.')
    }

    const snap = await getDoc(messageRef)
    if (!snap.exists()) {
      throw new DataSourceError('That message is no longer here.', 'not-found')
    }

    const stored = withId<Message>(snap)
    if (stored.authorUid !== member.id) {
      throw new DataSourceError('You can only edit your own messages.', 'not-author')
    }
    if (trustedNow().getTime() - stored.sentAt.toMillis() >= EDIT_WINDOW_MS) {
      throw new DataSourceError(
        'That message is too old to edit now.',
        'edit-window-closed',
      )
    }

    // `mentions` moves with the text. An edit that adds or removes a name has
    // changed who the message refers to, and leaving the old list behind would
    // highlight a name that is no longer written and miss one that now is.
    // `addressedUids` moves with `mentions` for the same reason, and is what
    // takes the notification out of, or puts it into, that person's inbox.
    const addressedUids = addressedUidsOf({ ...stored, mentions })
    await updateDoc(messageRef, {
      text: trimmed,
      mentions,
      addressedUids,
      editedAt: serverTimestamp(),
    })

    // The stamp returned is this device's, not the one that committed. It is a
    // placeholder for the beat before the listener delivers the real document —
    // `watchMessages` replays the pending write immediately and then confirms
    // it — and nothing renders the value, only whether there is one.
    return this.viewOf(
      { ...stored, text: trimmed, mentions, addressedUids, editedAt: Timestamp.now() },
      member.id,
      this.myReactions.get(messageRef.path) ?? [],
    )
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

    // Move the viewer's own half of the answer before the write goes out.
    //
    // The SDK replays a pending local write to its own listeners immediately,
    // so `watchMessages` publishes the new *count* within the same gesture —
    // but `mine` is not on the document, it is this cache, and leaving it until
    // the transaction commits meant that replayed snapshot overwrote the
    // screen's optimistic chip with a lit-up count that was not marked as the
    // member's. The toggle is decided by what this cache already holds, so it
    // can be applied here and simply confirmed below. See `myReactions`.
    const cached = this.myReactions.get(messageRef.path) ?? []
    this.myReactions.set(
      messageRef.path,
      cached.includes(emoji) ? cached.filter((e) => e !== emoji) : [...cached, emoji],
    )

    const settle = () =>
      runTransaction(firebaseDb(), async (tx) => {
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
        const stored = withId<Message>(messageSnap)
        const counts = stored.reactionCounts ?? {}
        const after = (counts[emoji] ?? 0) + (on ? -1 : 1)

        // Who is reacting, for the author's inbox: an entry for this member
        // when they go from no reaction to some, and out again when they go
        // back to none. Every other toggle leaves it, and `reactedAt`, alone,
        // so a second emoji does not tell the author again. Never the author's
        // own — nobody needs telling they reacted to themselves.
        const listed = member.id in (stored.reactors ?? {})
        const reacting = next.length > 0
        const reactor: unknown[] =
          stored.authorUid === member.id || listed === reacting
            ? []
            : reacting
              ? [
                  new FieldPath('reactors', member.id),
                  { name: member.profile.displayName || 'Someone', at: serverTimestamp() },
                  'reactedAt',
                  serverTimestamp(),
                ]
              : [new FieldPath('reactors', member.id), deleteField()]

        // One update rather than one per field, so the rules judge the write
        // as a whole. A zero count is an absent key, not a stored zero:
        // otherwise every emoji anyone ever tried accumulates on the document
        // forever.
        tx.update(
          messageRef,
          path,
          after <= 0 ? deleteField() : increment(on ? -1 : 1),
          ...reactor,
        )

        // The message as this write leaves it, assembled from the read the
        // transaction already had to make. It used to be re-read afterwards,
        // which is a second round trip on a gesture the member is watching, to
        // learn a number that was worked out three lines above. Contention is
        // not a reason to keep it: a snapshot that moved under the transaction
        // is what makes the transaction retry, so what is returned here is what
        // committed.
        const reactionCounts = { ...counts }
        if (after > 0) reactionCounts[emoji] = after
        else delete reactionCounts[emoji]

        return { mine: next, message: { ...stored, reactionCounts } }
      })

    let settled: Awaited<ReturnType<typeof settle>>
    try {
      settled = await settle()
    } catch (cause) {
      // The write is off. Put the cache back, or the highlight stays on a
      // reaction the thread does not have and every later toggle of it is
      // computed from a lie.
      this.myReactions.set(messageRef.path, cached)
      throw cause
    }

    // What actually committed, which is not always what was guessed above: the
    // member may have reacted on another device since this thread was read.
    this.myReactions.set(messageRef.path, settled.mine)

    return this.viewOf(settled.message, member.id, settled.mine).reactions
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
    // No `orderBy`, deliberately, and this is the reason.
    //
    // A Firestore query ordered by a field returns only the documents that
    // *have* that field. This one used to order by `sessions`, and a member who
    // has finished setup but not yet logged a qualifying session has no such
    // field: `saveProfile` writes their row as name, avatar and `updatedAt`,
    // and `sessions` only appears the first time `saveSession` increments it.
    // So every member who had not trained yet was silently missing — from the
    // board that is supposed to list the cohort, and from anything built on it,
    // which is how a whole cohort came to have nobody to `@` in chat.
    //
    // Nothing is lost by dropping it. This method's contract is explicitly
    // unordered and `rankLeaderboard` does the sorting, so the ordering here
    // only ever decided *which* 200 came back in a cohort larger than the cap —
    // and silently excluded rows in every cohort smaller than it.
    const snap = await getDocs(
      query(
        collection(firebaseDb(), 'cohorts', member.cohortId, 'leaderboard'),
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

  /**
   * The roster size, as one aggregation rather than a read of every row.
   *
   * `cohorts/{id}/leaderboard` is the roster: a document is written there the
   * moment a member sets a display name in setup, which is a step earlier than
   * they can reach Chat, and it is deleted with them.
   *
   * This is deliberately not `listLeaderboard().length`, which is what Chat
   * used to count. That query is capped at 200 rows, so in a cohort past the
   * cap its length is the cap and not the roster.
   *
   * It used to undercount a second way, and that one was worse: the query was
   * ordered by `sessions`, and a Firestore `orderBy` returns only documents
   * that *have* the field — which a member who has set their name but not yet
   * logged a qualifying session does not. So the header was counting the people
   * who had trained and calling them the people who can read the thread. That
   * is fixed at the source now (see `listLeaderboard`), which matters well
   * beyond this count: the same query is the roster behind `@` mentions in
   * chat, and a cohort where nobody had trained yet had nobody to name. This
   * still counts the collection, because an aggregation is the honest answer to
   * "how many" and does not read two hundred documents to give it.
   *
   * The floor of 1 covers the member reading their own header: a cohort with a
   * member in it is never empty, and a count of zero here would mean their own
   * projection document has not been written yet, not that nobody is there.
   */
  async countCohortMembers(): Promise<number> {
    const member = await this.requireMember()
    const snap = await getCountFromServer(
      collection(firebaseDb(), 'cohorts', member.cohortId, 'leaderboard'),
    )
    return Math.max(snap.data().count, 1)
  }

  // =========================================================================
  // Preferences
  // =========================================================================
  /**
   * The member's preferences, off the member document.
   *
   * Reads the cached copy when there is one rather than fetching the document
   * again. Preferences are a field of `members/{uid}`, and every caller of this
   * arrives just behind a `getMember` — the load reads it, then asks for the
   * preferences on it and paid for a second identical round trip to be told the
   * same thing. `requireMember` has always trusted this cache for the cohort id
   * and the program version, which are load-bearing in a way a reminder toggle
   * is not.
   *
   * Not `requireMember`: that throws for an account with no membership, and
   * this answers with the defaults, which is what the setup screens read before
   * there is anything to have a preference about.
   */
  async getPreferences(): Promise<MemberPreferences> {
    const member = this.memberCache ?? (await this.getMember())
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
   * Signs out, and no longer claims to do more than that.
   *
   * This used to delete the member document and the leaderboard row. The rules
   * now refuse the first: a member who can delete their own document can redeem
   * their code again, and the rebuilt document comes back in `onboarding` with
   * the display name and height that setup fixes open for a second answer. So
   * the batch would fail as a whole, taking the sign-out with it.
   *
   * Deleting the board row alone is not the smaller version of this — it leaves
   * a member who is still in the cohort invisible to everyone in it. A real
   * erasure request runs server-side on the Admin SDK, which is also the only
   * thing that can reach the subcollections a client could never address.
   */
  async reset(): Promise<void> {
    await this.signOut()
  }

  // =========================================================================
  // internals
  // =========================================================================
  private leaderboardRef(cohortId: string, memberId: string) {
    return doc(firebaseDb(), 'cohorts', cohortId, 'leaderboard', memberId)
  }

  private signInRef(uid: string) {
    return doc(firebaseDb(), 'signIns', uid)
  }

  /**
   * `pending` is the snapshot's `hasPendingWrites`: this device has written to
   * the document and the server has not said so yet. On the member's own
   * message that is the clock — a send, or an edit, still on its way. On
   * anybody else's it is only ever a reaction, which is not the message being
   * sent and is not drawn as one.
   */
  private viewOf(
    message: Message,
    viewerUid: string,
    mine: string[],
    pending = false,
  ): ChatMessageView {
    const reactions: ChatReaction[] = (Object.entries(message.reactionCounts ?? {}) as [string, number][])
      .filter(([, count]) => count > 0)
      .map(([emoji, count]) => ({ emoji, count, mine: mine.includes(emoji) }))

    // Who reacted is for the author's inbox, not the thread, and the thread is
    // kept on disk. See `lib/chat-cache.ts`.
    const { reactors: _reactors, reactedAt: _reactedAt, ...rest } = message
    const isSelf = message.authorUid === viewerUid

    return {
      ...rest,
      authorName: message.isCoach ? 'Coach' : message.authorName,
      // Every message sent before replies existed is missing the field
      // entirely, and `v-if="m.replyTo"` on an absent key is fine while
      // `replyTo.authorName` on one is not. Normalised on the way out so the
      // template can trust the type.
      replyTo: message.replyTo ?? null,
      // Same story, and the same fix: every message sent before editing existed
      // has no such field, and an absent key is not a message that was edited.
      editedAt: message.editedAt ?? null,
      mentions: message.mentions ?? [],
      addressedUids: message.addressedUids ?? [],
      isSelf,
      reactions,
      ...(isSelf && { delivery: pending ? 'sending' : 'sent' }),
    }
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
   *
   * **The member's `programId` is not always there.** A code issued before the
   * landing site started copying it onto the document — or written by hand in
   * the console without it — produces a member whose `programId` is the empty
   * string, and `programs/''` is not a document path: `doc()` rejects it
   * outright for having an odd number of segments. That threw on the first
   * read rather than returning "not found", which took the whole boot with it.
   *
   * The cohort names the program too, so that is the fallback, and it is a
   * read rather than a repair on purpose: `firestore.rules` makes `programId`
   * immutable on a member update, which is right — what a member was
   * prescribed is not theirs to change — so the document is fixed on the admin
   * side (`scripts/repair-members.mjs`) and this keeps them training until it
   * is. Session logs record `program.id`, so nothing downstream inherits the
   * blank.
   */
  private async program(): Promise<Program> {
    if (this.programCache) return this.programCache
    const member = await this.requireMember()

    let programId = member.programId?.trim() ?? ''
    if (!programId) {
      const cohort = await getDoc(doc(firebaseDb(), 'cohorts', member.cohortId))
      programId = (cohort.data()?.programId as string | undefined)?.trim() ?? ''
      if (programId) {
        console.warn(
          `[datasource] members/${member.id} has no programId; falling back to ` +
            `cohorts/${member.cohortId}.programId = "${programId}". Repair it with ` +
            'scripts/repair-members.mjs.',
        )
      }
    }

    if (!programId) {
      throw new DataSourceError('This cohort has no program attached.', 'not-found')
    }

    const snap = await getDoc(doc(firebaseDb(), 'programs', programId))
    if (!snap.exists()) {
      throw new DataSourceError('This cohort has no program attached.', 'not-found')
    }
    this.programCache = normaliseProgram(snap.id, snap.data() as Partial<ProgramDoc>)
    return this.programCache
  }

  /**
   * The program's weeks with their days, read once per session.
   *
   * One query for the weeks and one per week for its days, in parallel — a
   * six-week block is seven reads. A collection-group query over `days` would
   * be one, but it would match every program's days and need a rule and an
   * index of its own to narrow back down to this one.
   *
   * Sorted here rather than with `orderBy`, because `orderBy` silently drops
   * any document missing the field: a day typed into the console without a
   * `date` would vanish from the plan instead of being reported.
   */
  private async weeks(): Promise<TrainingWeek[]> {
    if (this.weeksCache) return this.weeksCache
    const program = await this.program()
    const db = firebaseDb()

    const weekSnap = await getDocs(collection(db, 'programs', program.id, 'weeks'))
    const weeks = weekSnap.docs
      .map((snap) => normaliseWeek(program.id, snap))
      .filter((week): week is ProgramWeek => week !== null)
      .sort((a, b) => a.weekNumber - b.weekNumber)

    this.weeksCache = await Promise.all(
      weeks.map(async (week) => {
        const daySnap = await getDocs(
          collection(db, 'programs', program.id, 'weeks', week.id, 'days'),
        )
        const days = daySnap.docs
          .map((snap) => normaliseDay(program.id, week, snap))
          .sort(
            (a, b) =>
              String(a.date).localeCompare(String(b.date)) || a.dayNumber - b.dayNumber,
          )
        return { ...week, days }
      }),
    )
    return this.weeksCache
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

  /**
   * A failed Firestore read, translated.
   *
   * `unavailable` is the one worth naming. It means the SDK could not reach
   * Firestore at all, and on a developer's own machine the reason is very
   * often not the network: an ad blocker or privacy extension refusing
   * `firestore.googleapis.com`, which the browser reports as
   * ERR_BLOCKED_BY_CLIENT and the SDK reports, misleadingly, as the client
   * being offline. Somebody who has just signed in successfully and is then
   * told "something went wrong" has no route from that to the extension in
   * their own toolbar.
   */
  /**
   * A failed Cloud Storage upload, translated.
   *
   * Uploads used to throw the SDK's own error straight out of a click handler,
   * where nothing caught it: the composer had already cleared itself, so a
   * refused upload looked exactly like a sent message and the only trace was an
   * unhandled rejection in a console nobody had open. The chat composer awaits
   * the send now and shows what comes back, which is only worth anything if
   * what comes back is a sentence.
   *
   * `storage/unauthorized` gets the long console note because it is the one
   * with a cause you cannot guess from the app: the *rules on that bucket*, not
   * the rules in this repo. A project with more than one bucket deploys
   * `storage.rules` per bucket, and a bucket nobody named in `firebase.json`
   * keeps the deny-all template it was created with — which is precisely how
   * every attachment in staging came to fail while production was fine.
   */
  private uploadError(cause: unknown, path: string): DataSourceError {
    const code = (cause as { code?: string }).code ?? ''

    if (code === 'storage/unauthorized') {
      console.error(
        `[datasource] Cloud Storage refused the upload to "${path}". The rules ` +
          'that denied it are the ones deployed ON THIS BUCKET — check which bucket ' +
          'NUXT_PUBLIC_FIREBASE_STORAGE_BUCKET names, then check that `firebase.json` ' +
          'lists it under `storage` and that `firebase deploy --only storage` has run ' +
          'since. A bucket missing from that list still has the deny-all template it ' +
          'was created with, and the deploy says nothing about it.',
        cause,
      )
      return new DataSourceError(
        'Your account isn’t allowed to upload that. Contact support.',
        'unauthenticated',
      )
    }

    if (code === 'storage/unauthenticated') {
      return new DataSourceError('Your session has expired. Sign in again.', 'unauthenticated')
    }

    if (code === 'storage/quota-exceeded') {
      console.error(`[datasource] the storage bucket is out of quota (${path}).`, cause)
      return new DataSourceError('Uploads are unavailable right now. Contact support.', 'unknown')
    }

    if (code === 'storage/retry-limit-exceeded' || code === 'storage/canceled') {
      return new DataSourceError(
        'That upload didn’t finish. Check your connection and try again.',
        'unknown',
      )
    }

    // `storage/unknown` is the SDK's catch-all and most often means the request
    // never reached a bucket at all: a `storageBucket` naming one that does not
    // exist, or a network the browser refused to make the request on.
    console.error(
      `[datasource] upload to "${path}" failed (${code || 'no code'}). If this is ` +
        '`storage/unknown`, confirm NUXT_PUBLIC_FIREBASE_STORAGE_BUCKET names a bucket ' +
        'that exists in this project.',
      cause,
    )
    return new DataSourceError('Couldn’t upload that. Try again.', 'unknown')
  }

  private readError(cause: unknown): DataSourceError {
    const code = (cause as { code?: string }).code ?? ''

    if (code === 'permission-denied') {
      console.error(
        '[datasource] Firestore refused the read. Check `firestore.rules` against ' +
          'the document path, and that the signed-in uid owns it.',
        cause,
      )
      return new DataSourceError(
        'Your account isn’t allowed to read that. Contact support.',
        'unauthenticated',
      )
    }

    if (code === 'unavailable') {
      console.error(
        '[datasource] Could not reach Firestore. If the network is fine, check the ' +
          'browser console for ERR_BLOCKED_BY_CLIENT on firestore.googleapis.com — ' +
          'an ad blocker or privacy extension will block it, and the SDK reports that ' +
          'as being offline.',
        cause,
      )
      return new DataSourceError(
        'Can’t reach your account right now. Check your connection — an ad blocker or ' +
          'privacy extension can block it too.',
        'unknown',
      )
    }

    console.error('[datasource] unhandled read failure', cause)
    return new DataSourceError('Something went wrong. Try again.', 'unknown')
  }

  /**
   * A Firebase Auth failure, translated once.
   *
   * Every auth path funnels through here so the member reads one voice rather
   * than a `auth/…` string, and so the three codes that are really *our*
   * misconfiguration — a provider left disabled, a domain never authorised —
   * say so plainly instead of hiding inside "something went wrong". Those are
   * the ones that only ever appear on a deploy nobody finished setting up, and
   * the console log beside them names the fix.
   */
  private authError(cause: unknown): DataSourceError {
    const code = (cause as { code?: string }).code ?? ''

    switch (code) {
      case 'auth/invalid-email':
        return new DataSourceError('That email address doesn’t look right.', 'invalid-email')

      case 'auth/invalid-credential':
      case 'auth/invalid-login-credentials':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return new DataSourceError(
          'That email and password don’t match. Try again, or reset your password.',
          'invalid-credentials',
        )
      case 'auth/missing-password':
        return new DataSourceError('Enter your password.', 'invalid-credentials')
      case 'auth/weak-password':
      case 'auth/password-does-not-meet-requirements':
        return new DataSourceError(
          'Choose a stronger password — longer, with a mix of letters and numbers.',
          'weak-password',
        )
      case 'auth/email-already-in-use':
        return new DataSourceError(
          'There’s already an account with this email. Sign in instead.',
          'account-exists',
        )

      case 'auth/too-many-requests':
        return new DataSourceError(
          'Too many attempts. Try again in a few minutes.',
          'unknown',
        )
      case 'auth/network-request-failed':
        return new DataSourceError('No connection. Check your network.', 'unknown')
      case 'auth/user-disabled':
        return new DataSourceError(
          'That account has been disabled. Contact support.',
          'unauthenticated',
        )

      // The member shut the Google window, or opened a second one over the
      // first. Both are a decision, not a fault, so the screen says nothing.
      case 'auth/popup-closed-by-user':
      case 'auth/cancelled-popup-request':
      case 'auth/user-cancelled':
        return new DataSourceError('Google sign-in was cancelled.', 'popup-cancelled')

      // A Google account whose address already has a password account, where
      // Firebase will not link the two on Google's word alone — it does for
      // Gmail addresses, and refuses for the rest. The password is the way in.
      case 'auth/account-exists-with-different-credential':
        return new DataSourceError(
          'That email signs in with a password. Use your email and password instead.',
          'account-exists',
        )

      case 'auth/operation-not-allowed':
        console.error(
          '[auth] This sign-in provider is not enabled for the project. ' +
            'Firebase console → Authentication → Sign-in method.',
          cause,
        )
        return new DataSourceError(
          'That sign-in method isn’t available right now.',
          'provider-disabled',
        )

      // `ADMIN_ONLY_OPERATION` underneath, and it means one thing: the project
      // will not let this call create or delete an account. Worth naming the
      // setting, because it reads like a broken sign-up rather than a switch
      // somebody turned off — and it is needed both ways: sign-up creates, and a
      // Google sign-in with no account behind it deletes what it made.
      case 'auth/admin-restricted-operation':
        console.error(
          '[auth] The project is refusing to create or delete accounts from the client, ' +
            'so no access code can make an account. Firebase console → Authentication → ' +
            'Settings → User actions → tick "Enable create (sign-up)" and "Enable delete".',
          cause,
        )
        return new DataSourceError(
          'Sign-up isn’t available right now. Contact support.',
          'provider-disabled',
        )

      case 'auth/unauthorized-domain':
      case 'auth/unauthorized-continue-uri':
        console.error(
          `[auth] ${window.location.origin} is not an authorised domain for this ` +
            'Firebase project. Console → Authentication → Settings → Authorised domains.',
          cause,
        )
        return new DataSourceError(
          'Sign-in isn’t available from this address.',
          'provider-disabled',
        )

      default:
        console.error('[auth] unhandled sign-in failure', cause)
        return new DataSourceError('Something went wrong. Try again.', 'unknown')
    }
  }
}
