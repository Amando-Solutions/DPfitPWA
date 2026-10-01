import { describe, expect, test } from 'bun:test'
import { cohortWeekAt, dateKeyIn } from '../src/calendar.js'
import {
  memberDay,
  sessionGate,
  sessionId,
  switchRegion,
  type PlanWeek,
  type SessionGateInput,
  type StoredRegion,
} from '../src/day-lock.js'
import { resolveRegion } from '../src/regions.js'

const LAGOS = 'Africa/Lagos'
const at = (iso: string) => new Date(iso)
const region = (id: string, timezone: string, floor: string | null = null): StoredRegion => ({
  id,
  timezone,
  floor,
})
const NEW_YORK = region('us-eastern', 'America/New_York')

// Two weeks, Monday to Sunday, a training day on each Monday and Wednesday and
// a finisher on each Monday.
const weeks: PlanWeek[] = [1, 2].map((n) => {
  const start = n === 1 ? '2026-10-05' : '2026-10-12'
  const wed = n === 1 ? '2026-10-07' : '2026-10-14'
  return {
    weekNumber: n,
    startDate: start,
    endDate: n === 1 ? '2026-10-11' : '2026-10-18',
    days: [
      { id: 'day-1', date: start, dayNumber: 1, label: 'Lower', optional: false },
      { id: 'day-2', date: wed, dayNumber: 2, label: 'Upper', optional: false },
      { id: 'finisher', date: start, dayNumber: 3, label: 'Core', optional: true },
    ],
  }
})

const gate = (overrides: Partial<SessionGateInput>) =>
  sessionGate({
    now: at('2026-10-05T12:00:00Z'),
    region: null,
    cohortZone: LAGOS,
    opensOn: '2026-10-05',
    weeks,
    logged: [],
    dayId: 'day-1',
    planWeek: 1,
    ...overrides,
  })

describe('the Cohort Clock', () => {
  test('reads the day in the cohort zone, not the process zone', () => {
    // 23:30 UTC on Sunday is 00:30 Monday in Lagos.
    const instant = at('2026-10-11T23:30:00Z')
    expect(dateKeyIn(instant, 'UTC')).toBe('2026-10-11')
    expect(dateKeyIn(instant, LAGOS)).toBe('2026-10-12')
    expect(cohortWeekAt(weeks, instant, LAGOS)).toBe(2)
  })

  test('holds whatever the process TZ is set to', () => {
    const before = process.env.TZ
    process.env.TZ = 'America/Los_Angeles'
    try {
      expect(cohortWeekAt(weeks, at('2026-10-11T23:30:00Z'), LAGOS)).toBe(2)
    } finally {
      process.env.TZ = before
    }
  })
})

describe('the member day', () => {
  test('defaults to the cohort zone until a region is picked', () => {
    expect(memberDay(at('2026-10-11T23:30:00Z'), null, LAGOS)).toBe('2026-10-12')
  })

  test('follows the stored region, not the cohort', () => {
    // 00:30 Monday in Lagos is 19:30 Sunday in New York.
    expect(memberDay(at('2026-10-11T23:30:00Z'), NEW_YORK, LAGOS)).toBe('2026-10-11')
  })

  test('moves with daylight saving without anybody touching it', () => {
    // EDT (UTC-4) in July: New York's midnight is 04:00 UTC.
    expect(memberDay(at('2026-07-01T03:59:00Z'), NEW_YORK, LAGOS)).toBe('2026-06-30')
    expect(memberDay(at('2026-07-01T04:00:00Z'), NEW_YORK, LAGOS)).toBe('2026-07-01')
    // EST (UTC-5) in December: 05:00 UTC.
    expect(memberDay(at('2026-12-01T04:30:00Z'), NEW_YORK, LAGOS)).toBe('2026-11-30')
    expect(memberDay(at('2026-12-01T05:00:00Z'), NEW_YORK, LAGOS)).toBe('2026-12-01')
  })
})

describe('switching region', () => {
  test('moving west keeps the day the member is already in', () => {
    // 00:30 Tuesday in Lagos, 19:30 Monday in New York.
    const now = at('2026-10-05T23:30:00Z')
    const moved = switchRegion(now, null, NEW_YORK, LAGOS)
    expect(moved.floor).toBe('2026-10-06')
    expect(memberDay(now, moved, LAGOS)).toBe('2026-10-06')
    // And once New York reaches Tuesday and then Wednesday, it is New York's day.
    expect(memberDay(at('2026-10-07T04:30:00Z'), moved, LAGOS)).toBe('2026-10-07')
  })

  test('moving east takes effect at once', () => {
    // 23:00 Monday in Lagos is 07:00 Tuesday in Tokyo.
    const now = at('2026-10-05T22:00:00Z')
    const moved = switchRegion(now, null, { id: 'other', timezone: 'Asia/Tokyo' }, LAGOS)
    expect(memberDay(now, moved, LAGOS)).toBe('2026-10-06')
  })

  test('flipping back and forth never goes back a day', () => {
    const now = at('2026-10-05T22:00:00Z')
    const tokyo = switchRegion(now, null, { id: 'other', timezone: 'Asia/Tokyo' }, LAGOS)
    const lagos = switchRegion(now, tokyo, { id: 'west-africa', timezone: LAGOS }, LAGOS)
    const ny = switchRegion(now, lagos, NEW_YORK, LAGOS)
    expect(memberDay(now, lagos, LAGOS)).toBe('2026-10-06')
    expect(memberDay(now, ny, LAGOS)).toBe('2026-10-06')
  })
})

describe('the session gate', () => {
  test('opens a training day at midnight in the member region', () => {
    // 01:00 Monday in Lagos is 20:00 Sunday in New York: not yet.
    const early = gate({ now: at('2026-10-05T00:00:00Z'), region: NEW_YORK })
    expect(early).toMatchObject({ ok: false, reason: 'before-start' })

    // 00:30 Monday in New York.
    const open = gate({ now: at('2026-10-05T04:30:00Z'), region: NEW_YORK })
    expect(open).toMatchObject({ ok: true, dayKey: '2026-10-05', weekNumber: 1, planWeek: 1 })
  })

  test('does not open a day ahead of the member calendar', () => {
    expect(gate({ dayId: 'day-2' })).toMatchObject({ ok: false, reason: 'not-open-yet' })
  })

  test('files under the WAT week even when the member is still in the last one', () => {
    // 20:00 Sunday 11 Oct in New York is 01:00 Monday in Lagos: week 2 on the
    // Cohort Clock, while week 1's Wednesday is still open to catch up.
    const result = gate({ now: at('2026-10-12T00:00:00Z'), region: NEW_YORK, dayId: 'day-2' })
    expect(result).toMatchObject({ ok: true, dayKey: '2026-10-11', weekNumber: 2, planWeek: 1 })
  })

  test('lets a member east of WAT start their Monday before Lagos reaches it', () => {
    // 00:30 Monday in Nairobi is 22:30 Sunday in Lagos.
    const nairobi = region('other-africa', 'Africa/Nairobi')
    const result = gate({ now: at('2026-10-11T21:30:00Z'), region: nairobi, planWeek: 2 })
    expect(result).toMatchObject({ ok: true, dayKey: '2026-10-12', weekNumber: 1, planWeek: 2 })
  })

  test('a logged day stays locked whatever region is picked afterwards', () => {
    const logged = [{ dayId: 'day-1', weekNumber: 1, planWeek: 1, dayKey: '2026-10-05', completedAtMs: 0 }]
    const later = at('2026-10-06T12:00:00Z')
    for (const r of [null, NEW_YORK, region('other', 'Pacific/Kiritimati')]) {
      expect(gate({ now: later, region: r, logged })).toMatchObject({ ok: false, reason: 'already-logged' })
    }
  })

  test('the finisher is once a day, and a switch west cannot buy a second one', () => {
    // Logged at 00:10 Tuesday in Lagos.
    const logged = [{ dayId: 'finisher', weekNumber: 1, planWeek: 1, dayKey: '2026-10-06', completedAtMs: 0 }]
    const now = at('2026-10-05T23:30:00Z')
    expect(gate({ now, logged, dayId: 'finisher' })).toMatchObject({ ok: false, reason: 'already-logged' })

    // Switch to New York, where it is still Monday evening. Without the floor
    // this would be Monday again, and Monday's finisher was never done.
    const moved = switchRegion(now, null, NEW_YORK, LAGOS)
    expect(gate({ now, region: moved, logged, dayId: 'finisher' })).toMatchObject({
      ok: false,
      reason: 'already-logged',
    })
  })

  test('the finisher opens again on the next member day', () => {
    const logged = [{ dayId: 'finisher', weekNumber: 1, planWeek: 1, dayKey: '2026-10-05', completedAtMs: 0 }]
    expect(gate({ now: at('2026-10-06T08:00:00Z'), logged, dayId: 'finisher' })).toMatchObject({ ok: true })
  })

  test('reads the day of a session logged before dayKey existed', () => {
    // 22:00 UTC on the 5th was 23:00 Monday in Lagos.
    const logged = [{ dayId: 'finisher', weekNumber: 1, completedAtMs: Date.parse('2026-10-05T22:00:00Z') }]
    expect(gate({ now: at('2026-10-05T22:30:00Z'), logged, dayId: 'finisher' })).toMatchObject({
      ok: false,
      reason: 'already-logged',
    })
  })

  test('stable ids make a double finish collide', () => {
    const first = gate({})
    const second = gate({})
    if (!first.ok || !second.ok) throw new Error('expected both to open')
    expect(sessionId(first)).toBe('w1-day-1')
    expect(sessionId(second)).toBe(sessionId(first))
  })
})

describe('the region list', () => {
  test('a fixed option takes its own zone, whatever was sent', () => {
    expect(resolveRegion('us-eastern', 'Asia/Tokyo')).toEqual({ id: 'us-eastern', timezone: 'America/New_York' })
  })

  test('a broad option takes a zone from its own area only', () => {
    expect(resolveRegion('other-africa', 'Africa/Nairobi')).toEqual({ id: 'other-africa', timezone: 'Africa/Nairobi' })
    expect(resolveRegion('other-africa', 'Europe/Paris')).toBeNull()
    expect(resolveRegion('other', 'Asia/Tokyo')).toEqual({ id: 'other', timezone: 'Asia/Tokyo' })
  })

  test('refuses free text and unknown ids', () => {
    expect(resolveRegion('other', 'Lagos, WAT')).toBeNull()
    expect(resolveRegion('mars', 'Africa/Lagos')).toBeNull()
  })
})
