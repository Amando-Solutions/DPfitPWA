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
 * The one contract every screen reads and writes through.
 *
 * Every method is async and takes/returns plain serialisable objects, so the
 * localStorage implementation and a future HTTP one are interchangeable — see
 * `local.ts` and `http.ts`. Nothing in `components/` or `pages/` may import a
 * storage or fetch primitive directly.
 *
 * Method names map 1:1 onto the REST routes the backend is expected to expose,
 * listed beside each group.
 */
export interface DataSource {
  // --- Membership -------------------------------- POST /session, GET /me ---
  /** Exchange a cohort access code for a member record. Throws on a bad code. */
  redeemAccessCode(code: string): Promise<MemberAccount>
  getMember(): Promise<MemberAccount | null>
  updateMember(patch: Partial<MemberAccount>): Promise<MemberAccount>
  signOut(): Promise<void>

  // --- Profile ------------------------------------------ PATCH /me/profile -
  saveProfile(patch: Partial<MemberProfile>): Promise<MemberAccount>
  completeSetup(): Promise<MemberAccount>

  // --- Workout logging ----------------------- GET/POST /me/sessions, /active
  listSessions(): Promise<SessionLog[]>
  saveSession(log: Omit<SessionLog, 'id'>): Promise<SessionLog>
  deleteSession(id: string): Promise<void>
  getActiveSession(): Promise<ActiveSession | null>
  setActiveSession(session: ActiveSession | null): Promise<void>

  // --- Check-ins ------------------------------------ GET/POST /me/check-ins
  listCheckIns(): Promise<CheckInRecord[]>
  saveCheckIn(input: Omit<CheckInRecord, 'id'>): Promise<CheckInRecord>

  // --- Progress photos --------------------------------- GET/POST /me/photos
  listPhotos(): Promise<PhotoRecord[]>
  savePhoto(input: Omit<PhotoRecord, 'id'>): Promise<PhotoRecord>
  deletePhoto(id: string): Promise<void>

  // --- Notifications ------------------------------------ GET /notifications
  listNotifications(): Promise<AppNotification[]>
  markNotificationRead(id: string): Promise<void>
  markAllNotificationsRead(): Promise<void>

  // --- Chat ------------------------------- GET/POST /threads/:id/messages --
  listMessages(threadId: 'cohort' | 'coach'): Promise<ChatMessage[]>
  /** `text` may be empty when the member is only sharing photos or files. */
  sendMessage(
    threadId: 'cohort' | 'coach',
    text: string,
    attachments?: ChatAttachment[],
  ): Promise<ChatMessage>

  // --- Rewards ------------------------------------------- GET /me/rewards --
  /** Badge ids the member has already been awarded, with the award timestamp. */
  listEarnedBadges(): Promise<Record<string, string>>
  awardBadge(id: string, earnedAt: string): Promise<void>

  // --- Settings ----------------------------------------- GET/PUT /me/prefs -
  getSettings(): Promise<Settings>
  saveSettings(patch: Partial<Settings>): Promise<Settings>

  /** Remove every trace of this member from the device (or the account). */
  reset(): Promise<void>
}

/** Thrown for expected, user-facing failures (bad access code, etc.). */
export class DataSourceError extends Error {
  constructor(
    message: string,
    readonly code: 'invalid-code' | 'not-found' | 'unauthenticated' | 'unknown' = 'unknown',
  ) {
    super(message)
    this.name = 'DataSourceError'
  }
}
