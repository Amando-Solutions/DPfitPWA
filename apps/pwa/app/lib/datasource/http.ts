import { Timestamp } from 'firebase/firestore'

import {
  DataSourceError,
  type ActiveSessionInput,
  type CheckInInput,
  type DataSource,
  type PendingFile,
  type PhotoInput,
  type SessionInput,
} from './types'
import type { ProcessedImage } from '~/lib/image'
import type {
  ActiveSessionDoc,
  AuthUser,
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
  Notification,
  ProgressPhoto,
  SessionLog,
  StoredImage,
  ThreadId,
} from '~/data/types'

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

  sendMessage(threadId: ThreadId, text: string, attachments: ChatAttachment[] = []) {
    return this.send<ChatMessageView>(`/threads/${threadId}/messages`, 'POST', {
      text,
      attachments,
    })
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
