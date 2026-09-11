import { Timestamp } from 'firebase/firestore'

import {
  DataSourceError,
  type ActiveSessionInput,
  type CheckInInput,
  type DataSource,
  type PendingFile,
  type PhotoInput,
  type SessionInput,
  type Unsubscribe,
} from './types'
import { TYPING_REFRESH_MS, typingIsFresh } from '~/lib/chat'
import { trustedNow } from '~/lib/time'
import type { ProcessedImage } from '~/lib/image'
import type {
  ActiveSessionDoc,
  Announcement,
  AuthUser,
  ChatAttachment,
  ChatMessageView,
  ChatReaction,
  ChatReplyRef,
  CheckIn,
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
  Program,
  ProgressPhoto,
  SessionLog,
  StoredImage,
  ThreadId,
  TypingPeer,
  WorkoutDay,
} from '~/data/types'

/** How often an open chat thread is re-read. See `watchMessages`. */
const THREAD_POLL_MS = 5_000

/**
 * How often the typing markers are re-read. Faster than the thread, because an
 * indicator that arrives after the message it was announcing is worse than no
 * indicator, and the payload is a handful of names rather than 200 messages.
 */
const TYPING_POLL_MS = 2_500

/**
 * How often the unread badge re-reads the top of a thread. See
 * `watchLatestMessage`.
 *
 * Slower than the open thread, because this one is polled from every screen in
 * the app rather than from the one screen somebody is reading, and a dot that
 * appears within half a minute is a dot that works.
 */
const LATEST_POLL_MS = 30_000

/**
 * HTTP implementation of the same contract, for a REST backend in front of
 * Firestore rather than the client SDK talking to it directly.
 *
 * Which of the two ships is still open. This one keeps every credential and
 * every write rule on a server the member cannot reach, at the cost of the
 * offline persistence and live snapshots the SDK gives for free. It exists so
 * the seam stays honest — a contract with one implementation is a contract that
 * has not been tested — and so that the choice stays reversible.
 *
 * Select it with `NUXT_PUBLIC_USE_MOCK_DATA=false` and
 * `NUXT_PUBLIC_API_BASE=https://…`. See `.env.example`.
 *
 * Auth is a session cookie set by `POST /auth/session` once the backend has
 * verified the Firebase ID token from the email link.
 */
export class HttpDataSource implements DataSource {
  constructor(private readonly baseURL: string) {}

  /** When `setTyping(true)` last went out, per thread. See `setTyping`. */
  private readonly typingSentAt = new Map<string, number>()

  private request<T>(path: string, options: Parameters<typeof $fetch>[1] = {}): Promise<T> {
    return $fetch<T>(path, {
      baseURL: this.baseURL,
      credentials: 'include',
      ...options,
      onResponseError({ response }) {
        if (response.status === 401) {
          throw new DataSourceError('Your session has expired.', 'unauthenticated')
        }
        if (response.status === 404) {
          throw new DataSourceError('Not found.', 'not-found')
        }
      },
    })
  }

  /**
   * Rebuild `Timestamp`s from a JSON response.
   *
   * JSON has no instant type, so the wire format is epoch milliseconds and the
   * revival happens here rather than in every caller. Applied to whole payloads
   * by `revive`, below.
   */
  private static toTimestamp(ms: number): Timestamp {
    return Timestamp.fromMillis(ms)
  }

  /**
   * Walk a decoded response and turn every tagged instant back into a
   * `Timestamp`.
   *
   * The backend is expected to encode them as `{ "$ts": <epoch ms> }`. Anything
   * else passes through untouched, so a response with no instants in it costs
   * one traversal and nothing more.
   */
  private static revive<T>(value: unknown): T {
    if (Array.isArray(value)) return value.map((v) => HttpDataSource.revive(v)) as T
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>
      if (typeof record.$ts === 'number') return HttpDataSource.toTimestamp(record.$ts) as T
      return Object.fromEntries(
        Object.entries(record).map(([k, v]) => [k, HttpDataSource.revive(v)]),
      ) as T
    }
    return value as T
  }

  private async get<T>(path: string): Promise<T> {
    return HttpDataSource.revive<T>(await this.request<unknown>(path))
  }

  private async send<T>(
    path: string,
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    body?: unknown,
  ): Promise<T> {
    return HttpDataSource.revive<T>(
      await this.request<unknown>(path, { method, body: body as Record<string, unknown> }),
    )
  }

  // --- Auth ----------------------------------------------------------------
  /** A backend sends a real email, so the wait for it is real too. */
  readonly instantSignIn = false

  /**
   * Off, because Google sign-in is a client-SDK flow and this implementation
   * has no client SDK behind it.
   *
   * The popup and the redirect both settle against Firebase directly and hand
   * back a credential the browser holds; there is nothing here for a REST
   * backend to stand in for. A deployment that wants Google runs the Firestore
   * implementation, which is the one that has it.
   */
  readonly googleSignIn = false

  async signInWithGoogle(): Promise<never> {
    throw new DataSourceError(
      'Google sign-in isn’t available on this backend.',
      'provider-disabled',
    )
  }

  async resumeSignIn(): Promise<null> {
    return null
  }

  async sendSignInLink(email: string) {
    await this.send('/auth/sign-in-link', 'POST', { email })
    return null
  }

  async isSignInLink(url: string) {
    return new URL(url, this.baseURL).searchParams.has('oobCode')
  }

  completeSignInLink(url: string, email?: string) {
    return this.send<AuthUser>('/auth/session', 'POST', { url, email })
  }

  getAuthUser() {
    return this.get<AuthUser | null>('/auth/me')
  }

  async signOut() {
    await this.send('/auth/session', 'DELETE')
  }

  // --- Membership ----------------------------------------------------------
  redeemAccessCode(code: string) {
    return this.send<Member>('/me/access-code', 'POST', { code })
  }

  getMember() {
    return this.get<Member | null>('/me')
  }

  updateMember(patch: Partial<MemberDoc>) {
    return this.send<Member>('/me', 'PATCH', patch)
  }

  saveProfile(patch: Partial<MemberProfile>) {
    return this.send<Member>('/me/profile', 'PATCH', patch)
  }

  completeSetup() {
    return this.send<Member>('/me/setup-complete', 'POST')
  }

  // --- Authored content ----------------------------------------------------
  //
  // Scoped to the caller rather than addressed by id: which program and which
  // cohort is a fact about the member's own document, and a client that could
  // name the program it wanted could read another cohort's plan.
  getProgram() {
    return this.get<Program>('/me/program')
  }

  listWorkoutDays() {
    return this.get<WorkoutDay[]>('/me/program/workout-days')
  }

  listGuides() {
    return this.get<Guide[]>('/me/program/guides')
  }

  getCohort() {
    return this.get<Cohort | null>('/me/cohort')
  }

  listAnnouncements() {
    return this.get<Announcement[]>('/me/cohort/announcements')
  }

  // --- Uploads -------------------------------------------------------------
  uploadImage(image: ProcessedImage, folder: 'proof' | 'progress' | 'chat') {
    return this.send<StoredImage>('/uploads/image', 'POST', { ...image, folder })
  }

  uploadAttachment(file: PendingFile) {
    return this.send<ChatAttachment>('/uploads/attachment', 'POST', file)
  }

  // --- Workout logging -----------------------------------------------------
  listSessions() {
    return this.get<SessionLog[]>('/me/sessions')
  }

  saveSession(log: SessionInput) {
    return this.send<SessionLog>('/me/sessions', 'POST', log)
  }

  async deleteSession(id: string) {
    await this.send(`/me/sessions/${id}`, 'DELETE')
  }

  getActiveSession() {
    return this.get<ActiveSessionDoc | null>('/me/sessions/active')
  }

  async setActiveSession(session: ActiveSessionInput | null) {
    if (session === null) await this.send('/me/sessions/active', 'DELETE')
    else await this.send('/me/sessions/active', 'PUT', session)
  }

  // --- Check-ins -----------------------------------------------------------
  listCheckIns() {
    return this.get<CheckIn[]>('/me/check-ins')
  }

  saveCheckIn(input: CheckInInput) {
    return this.send<CheckIn>('/me/check-ins', 'POST', input)
  }

  // --- Progress photos -----------------------------------------------------
  listPhotos() {
    return this.get<ProgressPhoto[]>('/me/photos')
  }

  savePhoto(input: PhotoInput) {
    return this.send<ProgressPhoto>('/me/photos', 'POST', input)
  }

  async deletePhoto(id: string) {
    await this.send(`/me/photos/${id}`, 'DELETE')
  }

  // --- Notifications -------------------------------------------------------
  listNotifications() {
    return this.get<Notification[]>('/notifications')
  }

  listNotificationReads() {
    return this.get<Record<string, Timestamp>>('/me/notification-reads')
  }

  async markNotificationRead(id: string) {
    await this.send(`/notifications/${id}/read`, 'POST')
  }

  async markAllNotificationsRead() {
    await this.send('/notifications/read-all', 'POST')
  }

  // --- Chat ----------------------------------------------------------------
  listMessages(threadId: ThreadId) {
    return this.get<ChatMessageView[]>(`/threads/${threadId}/messages`)
  }

  /**
   * Polled, because REST has nothing to push down.
   *
   * The other two implementations get this for free — Firestore holds a stream
   * open, the on-device one is the writer — and a plain HTTP backend has
   * neither, so the thread is re-read on a timer. Five seconds is the
   * compromise: slow enough that an idle chat screen is not hammering an
   * endpoint, fast enough that a reply does not feel lost. A backend that
   * grows a socket or an event stream should replace the body of this method
   * and nothing else.
   *
   * A failed poll is reported once and the timer keeps running: the usual
   * cause is a phone between cells, and the next tick is five seconds away.
   */
  async watchMessages(
    threadId: ThreadId,
    onMessages: (messages: ChatMessageView[]) => void,
    onError?: (error: unknown) => void,
  ): Promise<Unsubscribe> {
    let stopped = false
    let reportedError = false

    const poll = async () => {
      try {
        const messages = await this.listMessages(threadId)
        reportedError = false
        if (!stopped) onMessages(messages)
      } catch (error) {
        if (stopped || reportedError) return
        reportedError = true
        onError?.(error)
      }
    }

    await poll()
    const timer = setInterval(poll, THREAD_POLL_MS)

    return () => {
      stopped = true
      clearInterval(timer)
    }
  }

  /**
   * Polled like `watchMessages`, on its own slower timer.
   *
   * The endpoint hands back the newest message in the thread, or `null` for a
   * thread nobody has written in — the one document the badge needs, rather
   * than the 200 `listMessages` returns, because this poll runs on every
   * screen in the app and not only on the chat one.
   *
   * A failed poll is reported once and the timer keeps running, for the same
   * reason as the thread poll: the usual cause is a phone between cells.
   */
  async watchLatestMessage(
    threadId: ThreadId,
    onMessage: (message: Message | null) => void,
    onError?: (error: unknown) => void,
  ): Promise<Unsubscribe> {
    let stopped = false
    let reportedError = false

    const poll = async () => {
      try {
        const latest = await this.get<Message | null>(`/threads/${threadId}/messages/latest`)
        reportedError = false
        if (!stopped) onMessage(latest ?? null)
      } catch (error) {
        if (stopped || reportedError) return
        reportedError = true
        onError?.(error)
      }
    }

    await poll()
    const timer = setInterval(poll, LATEST_POLL_MS)

    return () => {
      stopped = true
      clearInterval(timer)
    }
  }

  sendMessage(
    threadId: ThreadId,
    text: string,
    attachments: ChatAttachment[] = [],
    replyTo: ChatReplyRef | null = null,
  ) {
    return this.send<ChatMessageView>(`/threads/${threadId}/messages`, 'POST', {
      text,
      attachments,
      replyTo,
    })
  }

  /**
   * Rate-limited here, like the Firestore implementation, and for the same
   * reason: the composer calls this on every keystroke and a backend should not
   * be asked to absorb that. `false` is never limited — it is the half that
   * must always get through.
   */
  async setTyping(threadId: ThreadId, typing: boolean): Promise<void> {
    try {
      if (!typing) {
        this.typingSentAt.delete(threadId)
        await this.send(`/threads/${threadId}/typing`, 'DELETE')
        return
      }
      const last = this.typingSentAt.get(threadId) ?? 0
      if (Date.now() - last < TYPING_REFRESH_MS) return
      this.typingSentAt.set(threadId, Date.now())
      await this.send(`/threads/${threadId}/typing`, 'POST')
    } catch (cause) {
      console.error('[chat] typing marker failed', cause)
    }
  }

  /**
   * Polled, like `watchMessages` and for the same reason — but on its own,
   * faster timer. A typing indicator that lags five seconds behind is worse
   * than none: it appears after the message it was announcing.
   *
   * The backend is expected to have applied `TYPING_TTL_MS` already; the filter
   * here is the client refusing to render a marker it can see is stale, which
   * is what covers a poll that arrives late.
   */
  async watchTyping(
    threadId: ThreadId,
    onTyping: (peers: TypingPeer[]) => void,
    onError?: (error: unknown) => void,
  ): Promise<Unsubscribe> {
    let stopped = false
    let reportedError = false

    const poll = async () => {
      try {
        const peers = await this.get<TypingPeer[]>(`/threads/${threadId}/typing`)
        reportedError = false
        if (stopped) return
        const now = trustedNow().getTime()
        onTyping(peers.filter((peer) => typingIsFresh(peer.at, now)))
      } catch (error) {
        if (stopped || reportedError) return
        reportedError = true
        onError?.(error)
      }
    }

    await poll()
    const timer = setInterval(poll, TYPING_POLL_MS)

    return () => {
      stopped = true
      clearInterval(timer)
    }
  }

  /**
   * A PATCH, because an edit changes one field of a message that already
   * exists. The window and the authorship are the backend's to enforce; this
   * sends the correction and surfaces whatever it says about it — see `send`,
   * which turns a refusal into a `DataSourceError` with the server's sentence.
   */
  editMessage(threadId: ThreadId, messageId: string, text: string) {
    return this.send<ChatMessageView>(
      `/threads/${threadId}/messages/${messageId}`,
      'PATCH',
      { text },
    )
  }

  toggleReaction(threadId: ThreadId, messageId: string, emoji: string) {
    return this.send<ChatReaction[]>(
      `/threads/${threadId}/messages/${messageId}/reactions`,
      'POST',
      { emoji },
    )
  }

  // --- Rewards -------------------------------------------------------------
  listEarnedBadges() {
    return this.get<Record<string, EarnedBadge>>('/me/badges')
  }

  async awardBadge(id: string) {
    await this.send('/me/badges', 'POST', { id })
  }

  /** Real counts across the cohort, refreshed on load. No placeholder rows. */
  listLeaderboard() {
    return this.get<LeaderboardEntry[]>('/cohort/leaderboard')
  }

  /**
   * One number, its own endpoint.
   *
   * The board is paginated and this is not a `length` the client can take from
   * it — see the contract. A backend answering this should count the roster,
   * not serialise it.
   */
  async countCohortMembers() {
    const { count } = await this.get<{ count: number }>('/cohort/member-count')
    return Math.max(count, 1)
  }

  /** Uploads land in a bucket, so there is no device budget to run out of. */
  async storageFull() {
    return false
  }

  // --- Preferences ---------------------------------------------------------
  getPreferences() {
    return this.get<MemberPreferences>('/me/preferences')
  }

  savePreferences(patch: Partial<MemberPreferences>) {
    return this.send<MemberPreferences>('/me/preferences', 'PUT', patch)
  }

  async reset() {
    await this.send('/me', 'DELETE')
  }
}
