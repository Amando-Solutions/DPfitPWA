import { describe, expect, test } from 'bun:test'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { ENROLLED, cohortOver, enrolmentRefusal } from '../server/utils/membership'

const at = (iso: string) => Timestamp.fromDate(new Date(iso))
const NOW = new Date('2026-10-02T12:00:00+01:00')

const running = { name: 'Cohort 1', status: 'active', timezone: 'Africa/Lagos', endDate: at('2026-10-12T00:00:00+01:00') }
const ended = { ...running, endDate: at('2026-09-27T00:00:00+01:00') }

/** One member, or none, and the cohort documents they could be in. */
const fakeDb = (member: Record<string, unknown> | null, cohorts: Record<string, Record<string, unknown>>) => {
  const snap = (data: Record<string, unknown> | undefined) => ({
    exists: data !== undefined,
    data: () => data,
    get: (field: string) => data?.[field],
  })
  const query = {
    where: () => query,
    limit: () => query,
    get: async () => ({ docs: member ? [snap(member)] : [] }),
  }
  return {
    collection: () => query,
    doc: (path: string) => ({ get: async () => snap(cohorts[path.replace('cohorts/', '')]) }),
  } as unknown as Firestore
}

describe('cohortOver', () => {
  test('runs to the end of its last day, in its own zone', () => {
    const lastDay = { ...running, endDate: at('2026-10-02T00:00:00+01:00') }
    expect(cohortOver(lastDay, new Date('2026-10-02T23:59:00+01:00'))).toBe(false)
    expect(cohortOver(lastDay, new Date('2026-10-03T00:00:00+01:00'))).toBe(true)
  })

  test('archived is over, and no end date is not', () => {
    expect(cohortOver({ ...running, status: 'archived' }, NOW)).toBe(true)
    expect(cohortOver({ status: 'active' }, NOW)).toBe(false)
  })
})

describe('enrolmentRefusal', () => {
  test('somebody who has never been a member may buy', async () => {
    expect(await enrolmentRefusal(fakeDb(null, {}), 'ada@example.com', 'cohort-2', NOW)).toBeNull()
  })

  test('a member whose cohort is over may buy the next one', async () => {
    const db = fakeDb({ cohortId: 'cohort-1', cohortName: 'Cohort 1' }, { 'cohort-1': ended })
    expect(await enrolmentRefusal(db, 'ada@example.com', 'cohort-2', NOW)).toBeNull()
  })

  test('the answer names no cohort, since anybody can type any address', () => {
    expect(ENROLLED).not.toMatch(/Cohort \d/)
  })

  test('a member whose cohort is running may not', async () => {
    const db = fakeDb({ cohortId: 'cohort-1', cohortName: 'Cohort 1' }, { 'cohort-1': running })
    expect(await enrolmentRefusal(db, 'ada@example.com', 'cohort-2', NOW)).toBe(ENROLLED)
  })

  test('nor buy the cohort they are already in', async () => {
    const db = fakeDb({ cohortId: 'cohort-2', cohortName: 'Cohort 2' }, { 'cohort-2': { ...running, name: 'Cohort 2' } })
    expect(await enrolmentRefusal(db, 'ada@example.com', 'cohort-2', NOW)).toBe(ENROLLED)
  })

  test('nor a third while their next is held', async () => {
    const db = fakeDb(
      { cohortId: 'cohort-1', cohortName: 'Cohort 1', nextCohort: { cohortName: 'Cohort 3' } },
      { 'cohort-1': ended },
    )
    expect(await enrolmentRefusal(db, 'ada@example.com', 'cohort-2', NOW)).toBe(ENROLLED)
  })
})
