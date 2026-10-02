import { describe, expect, test } from 'bun:test'
import { Timestamp } from 'firebase-admin/firestore'
import { cohortOver } from '../src/calendar.js'

const LAGOS = 'Africa/Lagos'
const at = (iso: string) => new Date(iso)

// The last day is Sunday 27 Sep, stored the way a date picker stores it:
// midnight at the start of that day, in Lagos.
const running = {
  status: 'active',
  endDate: at('2026-09-27T00:00:00+01:00'),
  timezone: LAGOS,
}

describe('cohortOver', () => {
  test('runs to the end of the last day, in the cohort’s zone', () => {
    expect(cohortOver(running, at('2026-09-27T00:00:00+01:00'))).toBe(false)
    expect(cohortOver(running, at('2026-09-27T23:59:59+01:00'))).toBe(false)
  })

  test('closes at the midnight after it', () => {
    expect(cohortOver(running, at('2026-09-28T00:00:00+01:00'))).toBe(true)
    // 23:30 UTC on the 27th is already the 28th in Lagos.
    expect(cohortOver(running, at('2026-09-27T23:30:00Z'))).toBe(true)
  })

  test('reads the stored instant as a day, whatever time it carries', () => {
    const lateInTheDay = { ...running, endDate: at('2026-09-27T21:00:00+01:00') }
    expect(cohortOver(lateInTheDay, at('2026-09-27T23:00:00+01:00'))).toBe(false)
    expect(cohortOver(lateInTheDay, at('2026-09-28T00:00:00+01:00'))).toBe(true)
  })

  test('an archived cohort is over before its last day', () => {
    expect(cohortOver({ ...running, status: 'archived' }, at('2026-09-01T12:00:00+01:00'))).toBe(true)
  })

  test('so is a completed one', () => {
    expect(cohortOver({ ...running, status: 'completed' }, at('2026-09-01T12:00:00+01:00'))).toBe(true)
  })

  test('no end date is no end on the calendar', () => {
    expect(cohortOver({ ...running, endDate: null }, at('2030-01-01T00:00:00Z'))).toBe(false)
    expect(cohortOver({ status: 'active' }, at('2030-01-01T00:00:00Z'))).toBe(false)
  })

  test('reads a Firestore Timestamp as stored', () => {
    const stored = { ...running, endDate: Timestamp.fromDate(running.endDate) }
    expect(cohortOver(stored, at('2026-09-27T23:59:59+01:00'))).toBe(false)
    expect(cohortOver(stored, at('2026-09-28T00:00:00+01:00'))).toBe(true)
  })

  test('an unusable zone reads as Lagos', () => {
    const noZone = { ...running, timezone: 'Lagos, WAT' }
    expect(cohortOver(noZone, at('2026-09-27T23:59:59+01:00'))).toBe(false)
    expect(cohortOver(noZone, at('2026-09-28T00:00:00+01:00'))).toBe(true)
  })
})
