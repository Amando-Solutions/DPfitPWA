import { storage } from '~/lib/storage'
import { DataSourceError, type DataSource } from './types'
import { accessCodes, cohort, notificationSeed } from '~/data/program'
import { coachSeed, cohortSeed } from '~/data/community'
import type {
  ActiveSession,
  AppNotification,
  ChatMessage,
  CheckInRecord,
  MemberAccount,
  MemberProfile,
  PhotoRecord,
  SessionLog,
  Settings,
} from '~/data/types'

// Storage keys — one per collection, mirroring the REST resources.
const KEY = {
  member: 'member',
  sessions: 'sessions',
  activeSession: 'active-session',
  checkIns: 'check-ins',
  photos: 'photos',
  notificationsRead: 'notifications-read',
  messages: 'messages',
  badges: 'badges',
  settings: 'settings',
} as const

const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

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
  allergies: '',
  injuries: '',
  callSlot: '',
  avatar: '',
})

export const defaultSettings = (): Settings => ({
  units: 'kg',
  workoutReminders: true,
  coachMessages: true,
  weeklyCheckInReminder: true,
})

/**
 * localStorage-backed implementation of the app's data contract.
 *
 * Reads and writes are synchronous underneath but the methods are async so the
 * calling code is already shaped for a network round-trip — swapping in
 * `HttpDataSource` requires no changes above this layer.
 */
export class LocalDataSource implements DataSource {
  // --- Membership ----------------------------------------------------------
  async redeemAccessCode(code: string): Promise<MemberAccount> {
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

    const member: MemberAccount = {
      id: uid('member'),
      accessCode: normalised,
      cohortId: cohort.id,
      joinedAt: new Date().toISOString(),
      setupComplete: false,
      profile: emptyProfile(),
    }
    storage.write(KEY.member, member)
    return member
  }

  async getMember(): Promise<MemberAccount | null> {
    return storage.read<MemberAccount | null>(KEY.member, null)
  }

  async updateMember(patch: Partial<MemberAccount>): Promise<MemberAccount> {
    const member = await this.requireMember()
    const next = { ...member, ...patch }
    storage.write(KEY.member, next)
    return next
  }

  async signOut(): Promise<void> {
    storage.clear()
  }

  // --- Profile -------------------------------------------------------------
  async saveProfile(patch: Partial<MemberProfile>): Promise<MemberAccount> {
    const member = await this.requireMember()
    const next: MemberAccount = {
      ...member,
      profile: { ...member.profile, ...patch },
    }
    storage.write(KEY.member, next)
    return next
  }

  async completeSetup(): Promise<MemberAccount> {
    return this.updateMember({ setupComplete: true })
  }

  // --- Workout logging -----------------------------------------------------
  async listSessions(): Promise<SessionLog[]> {
    return storage.read<SessionLog[]>(KEY.sessions, [])
  }

  async saveSession(log: Omit<SessionLog, 'id'>): Promise<SessionLog> {
    const sessions = await this.listSessions()
    const record: SessionLog = { ...log, id: uid('session') }
    storage.write(KEY.sessions, [record, ...sessions])
    return record
  }

  async deleteSession(id: string): Promise<void> {
    const sessions = await this.listSessions()
    storage.write(
      KEY.sessions,
      sessions.filter((s) => s.id !== id),
    )
  }

  async getActiveSession(): Promise<ActiveSession | null> {
    return storage.read<ActiveSession | null>(KEY.activeSession, null)
  }

  async setActiveSession(session: ActiveSession | null): Promise<void> {
    if (session === null) storage.remove(KEY.activeSession)
    else storage.write(KEY.activeSession, session)
  }

  // --- Check-ins -----------------------------------------------------------
  async listCheckIns(): Promise<CheckInRecord[]> {
    return storage.read<CheckInRecord[]>(KEY.checkIns, [])
  }

  async saveCheckIn(input: Omit<CheckInRecord, 'id'>): Promise<CheckInRecord> {
    const all = await this.listCheckIns()
    const record: CheckInRecord = { ...input, id: uid('checkin') }
    // One check-in per week — a resubmit replaces the earlier one.
    const next = [record, ...all.filter((c) => c.weekNumber !== input.weekNumber)]
    storage.write(KEY.checkIns, next)
    return record
  }

  // --- Progress photos -----------------------------------------------------
  async listPhotos(): Promise<PhotoRecord[]> {
    return storage.read<PhotoRecord[]>(KEY.photos, [])
  }

  async savePhoto(input: Omit<PhotoRecord, 'id'>): Promise<PhotoRecord> {
    const all = await this.listPhotos()
    const record: PhotoRecord = { ...input, id: uid('photo') }
    storage.write(KEY.photos, [record, ...all])
    return record
  }

  async deletePhoto(id: string): Promise<void> {
    const all = await this.listPhotos()
    storage.write(
      KEY.photos,
      all.filter((p) => p.id !== id),
    )
  }

  // --- Notifications -------------------------------------------------------
  async listNotifications(): Promise<AppNotification[]> {
    const read = storage.read<string[]>(KEY.notificationsRead, [])
    return notificationSeed.map((n) => ({ ...n, read: read.includes(n.id) }))
  }

  async markNotificationRead(id: string): Promise<void> {
    const read = storage.read<string[]>(KEY.notificationsRead, [])
    if (!read.includes(id)) storage.write(KEY.notificationsRead, [...read, id])
  }

  async markAllNotificationsRead(): Promise<void> {
    storage.write(
      KEY.notificationsRead,
      notificationSeed.map((n) => n.id),
    )
  }

  // --- Chat ----------------------------------------------------------------
  async listMessages(threadId: 'cohort' | 'coach'): Promise<ChatMessage[]> {
    const seed = threadId === 'cohort' ? cohortSeed : coachSeed
    const mine = storage.read<Record<string, ChatMessage[]>>(KEY.messages, {})
    return [...seed, ...(mine[threadId] ?? [])]
  }

  async sendMessage(threadId: 'cohort' | 'coach', text: string): Promise<ChatMessage> {
    const member = await this.getMember()
    const message: ChatMessage = {
      id: uid('msg'),
      authorId: member?.id ?? 'me',
      authorName: member?.profile.displayName || 'You',
      authorAvatar: member?.profile.avatar ?? '',
      isCoach: false,
      isSelf: true,
      text,
      sentAt: new Date().toISOString(),
    }
    const mine = storage.read<Record<string, ChatMessage[]>>(KEY.messages, {})
    storage.write(KEY.messages, {
      ...mine,
      [threadId]: [...(mine[threadId] ?? []), message],
    })
    return message
  }

  // --- Rewards -------------------------------------------------------------
  async listEarnedBadges(): Promise<Record<string, string>> {
    return storage.read<Record<string, string>>(KEY.badges, {})
  }

  async awardBadge(id: string, earnedAt: string): Promise<void> {
    const earned = await this.listEarnedBadges()
    if (earned[id]) return
    storage.write(KEY.badges, { ...earned, [id]: earnedAt })
  }

  // --- Settings ------------------------------------------------------------
  async getSettings(): Promise<Settings> {
    return { ...defaultSettings(), ...storage.read<Partial<Settings>>(KEY.settings, {}) }
  }

  async saveSettings(patch: Partial<Settings>): Promise<Settings> {
    const next = { ...(await this.getSettings()), ...patch }
    storage.write(KEY.settings, next)
    return next
  }

  async reset(): Promise<void> {
    storage.clear()
  }

  // --- internals -----------------------------------------------------------
  private async requireMember(): Promise<MemberAccount> {
    const member = await this.getMember()
    if (!member) throw new DataSourceError('No member on this device.', 'unauthenticated')
    return member
  }
}
