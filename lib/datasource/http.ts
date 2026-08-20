import { DataSourceError, type DataSource } from './types'
import type {
  ActiveSession,
  AppNotification,
  ChatAttachment,
  ChatMessage,
  CheckInRecord,
  MemberAccount,
  MemberProfile,
  PhotoRecord,
  SessionLog,
  Settings,
} from '~/data/types'

/**
 * HTTP implementation of the same contract.
 *
 * The routes below are the API this app expects; the backend is not built yet,
 * so this class exists to prove the seam and to be the single file that needs
 * finishing when it is. Select it by setting `NUXT_PUBLIC_USE_MOCK_DATA=false`
 * and `NUXT_PUBLIC_API_BASE=https://…` — see `.env.example`.
 *
 * Auth is assumed to be a session cookie set by `POST /session`; add a bearer
 * token here if the backend goes that way instead.
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

  // --- Membership ----------------------------------------------------------
  redeemAccessCode(code: string) {
    return this.request<MemberAccount>('/session', { method: 'POST', body: { code } })
  }

  getMember() {
    return this.request<MemberAccount | null>('/me')
  }

  updateMember(patch: Partial<MemberAccount>) {
    return this.request<MemberAccount>('/me', { method: 'PATCH', body: patch })
  }

  async signOut() {
    await this.request('/session', { method: 'DELETE' })
  }

  // --- Profile -------------------------------------------------------------
  saveProfile(patch: Partial<MemberProfile>) {
    return this.request<MemberAccount>('/me/profile', { method: 'PATCH', body: patch })
  }

  completeSetup() {
    return this.request<MemberAccount>('/me/setup-complete', { method: 'POST' })
  }

  // --- Workout logging -----------------------------------------------------
  listSessions() {
    return this.request<SessionLog[]>('/me/sessions')
  }

  saveSession(log: Omit<SessionLog, 'id'>) {
    return this.request<SessionLog>('/me/sessions', { method: 'POST', body: log })
  }

  async deleteSession(id: string) {
    await this.request(`/me/sessions/${id}`, { method: 'DELETE' })
  }

  getActiveSession() {
    return this.request<ActiveSession | null>('/me/sessions/active')
  }

  async setActiveSession(session: ActiveSession | null) {
    await this.request('/me/sessions/active', {
      method: session ? 'PUT' : 'DELETE',
      body: session ?? undefined,
    })
  }

  // --- Check-ins -----------------------------------------------------------
  listCheckIns() {
    return this.request<CheckInRecord[]>('/me/check-ins')
  }

  saveCheckIn(input: Omit<CheckInRecord, 'id'>) {
    return this.request<CheckInRecord>('/me/check-ins', { method: 'POST', body: input })
  }

  // --- Progress photos -----------------------------------------------------
  listPhotos() {
    return this.request<PhotoRecord[]>('/me/photos')
  }

  savePhoto(input: Omit<PhotoRecord, 'id'>) {
    return this.request<PhotoRecord>('/me/photos', { method: 'POST', body: input })
  }

  async deletePhoto(id: string) {
    await this.request(`/me/photos/${id}`, { method: 'DELETE' })
  }

  // --- Notifications -------------------------------------------------------
  listNotifications() {
    return this.request<AppNotification[]>('/notifications')
  }

  async markNotificationRead(id: string) {
    await this.request(`/notifications/${id}/read`, { method: 'POST' })
  }

  async markAllNotificationsRead() {
    await this.request('/notifications/read-all', { method: 'POST' })
  }

  // --- Chat ----------------------------------------------------------------
  listMessages(threadId: 'cohort' | 'coach') {
    return this.request<ChatMessage[]>(`/threads/${threadId}/messages`)
  }

  sendMessage(threadId: 'cohort' | 'coach', text: string, attachments: ChatAttachment[] = []) {
    return this.request<ChatMessage>(`/threads/${threadId}/messages`, {
      method: 'POST',
      body: { text, attachments },
    })
  }

  // --- Rewards -------------------------------------------------------------
  listEarnedBadges() {
    return this.request<Record<string, string>>('/me/badges')
  }

  async awardBadge(id: string, earnedAt: string) {
    await this.request('/me/badges', { method: 'POST', body: { id, earnedAt } })
  }

  // --- Settings ------------------------------------------------------------
  getSettings() {
    return this.request<Settings>('/me/settings')
  }

  saveSettings(patch: Partial<Settings>) {
    return this.request<Settings>('/me/settings', { method: 'PUT', body: patch })
  }

  async reset() {
    await this.request('/me', { method: 'DELETE' })
  }
}
