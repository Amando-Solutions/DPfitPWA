import { describe, expect, test } from 'bun:test'
import { reminderDue, slotLabel } from '../src/live-call-reminders.js'

const LAGOS = 'Africa/Lagos'
const NEW_YORK = 'America/New_York'
const at = (iso: string) => new Date(iso)

// Friday 9 Oct 2026, 7 PM in Lagos, for an hour.
const evening = { startsAt: at('2026-10-09T18:00:00Z'), durationMinutes: 60 }

describe('when a live call reminder is due', () => {
  test('not on the days before the call', () => {
    expect(reminderDue(evening, LAGOS, at('2026-10-07T10:00:00Z'))).toBeNull()
    expect(reminderDue(evening, LAGOS, at('2026-10-08T20:00:00Z'))).toBeNull()
  })

  test('from 8 AM on the day, in the cohort zone', () => {
    expect(reminderDue(evening, LAGOS, at('2026-10-09T06:59:00Z'))).toBeNull()
    expect(reminderDue(evening, LAGOS, at('2026-10-09T07:00:00Z'))).toBe('2026-10-09')
    expect(reminderDue(evening, LAGOS, at('2026-10-09T15:00:00Z'))).toBe('2026-10-09')
  })

  test('while the call runs, for a call added late on its own day', () => {
    expect(reminderDue(evening, LAGOS, at('2026-10-09T18:30:00Z'))).toBe('2026-10-09')
  })

  test('never once the call has ended', () => {
    expect(reminderDue(evening, LAGOS, at('2026-10-09T19:00:00Z'))).toBeNull()
  })

  test('an hour ahead of a call that starts before 9 AM', () => {
    const early = { startsAt: at('2026-10-09T06:00:00Z'), durationMinutes: 45 } // 7 AM Lagos
    expect(reminderDue(early, LAGOS, at('2026-10-09T04:59:00Z'))).toBeNull()
    expect(reminderDue(early, LAGOS, at('2026-10-09T05:00:00Z'))).toBe('2026-10-09')
  })

  test('reads the day in the cohort zone, not UTC', () => {
    // 00:30 Saturday in Lagos is still Friday in UTC.
    const midnight = { startsAt: at('2026-10-09T23:30:00Z'), durationMinutes: 60 }
    expect(reminderDue(midnight, LAGOS, at('2026-10-09T22:45:00Z'))).toBeNull()
    expect(reminderDue(midnight, LAGOS, at('2026-10-09T23:00:00Z'))).toBe('2026-10-10')

    // 8 PM Friday in New York is already Saturday in UTC.
    const nyEvening = { startsAt: at('2026-10-10T00:00:00Z'), durationMinutes: 60 }
    expect(reminderDue(nyEvening, NEW_YORK, at('2026-10-09T11:59:00Z'))).toBeNull()
    expect(reminderDue(nyEvening, NEW_YORK, at('2026-10-09T12:00:00Z'))).toBe('2026-10-09')
  })
})

describe('the slot a reminder names', () => {
  test('WAT for Lagos, which no locale prints', () => {
    expect(slotLabel(evening.startsAt, LAGOS)).toBe('7:00 PM WAT')
  })

  test("the zone's own abbreviation elsewhere", () => {
    expect(slotLabel(at('2026-10-10T00:00:00Z'), NEW_YORK)).toBe('8:00 PM EDT')
  })
})
