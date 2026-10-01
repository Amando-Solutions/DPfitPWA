import type { MemberPreferences } from './types'

/** Defaults for a new member; saved preferences are read from Firestore. */
export const defaultPreferences = (): MemberPreferences => ({
  units: 'kg',
  heightUnits: 'cm',
  workoutReminders: true,
  coachMessages: true,
  weeklyCheckInReminder: true,
})
