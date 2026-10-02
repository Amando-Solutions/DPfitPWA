import { describe, expect, test } from 'bun:test'
import { Timestamp } from 'firebase-admin/firestore'
import { dueToComplete } from '../src/cohort-status.js'
import { ofCohort } from '../src/member-writes.js'
import { assessJoin, issueRefusal, setAsideId, type Joiner } from '../src/memberships.js'

const now = new Date('2026-10-02T12:00:00+01:00')
const later = Timestamp.fromDate(new Date('2026-11-01T00:00:00+01:00'))
const earlier = Timestamp.fromDate(new Date('2026-09-01T00:00:00+01:00'))

/** In cohort 1 by its code, never in another. */
const ada: Joiner = {
  uid: 'ada',
  email: 'ada@example.com',
  cohortId: 'cohort-1',
  accessCode: 'DPF-FRST-0001',
  previousCohortIds: [],
}

/** An unused code for cohort 2, issued to Ada. */
const fresh = {
  status: 'unused',
  cohortId: 'cohort-2',
  cohortName: 'Cohort 2',
  programId: 'program-a',
  programVersion: 1,
  issuedToEmail: 'ada@example.com',
  expiresAt: later,
  claimedByUid: null,
}

describe('assessJoin', () => {
  test('a fresh code for another cohort is claimed', () => {
    expect(assessJoin('DPF-AAAA-BBBB', fresh, ada, now)).toBe('claim')
  })

  test('the address is compared without case', () => {
    expect(assessJoin('DPF-AAAA-BBBB', { ...fresh, issuedToEmail: 'Ada@Example.com' }, ada, now)).toBe('claim')
  })

  test('a code nobody issued, or one revoked, is not a seat', () => {
    expect(assessJoin('DPF-AAAA-BBBB', undefined, ada, now)).toMatchObject({ reason: 'invalid-code' })
    expect(assessJoin('DPF-AAAA-BBBB', { ...fresh, status: 'revoked' }, ada, now)).toMatchObject({
      reason: 'invalid-code',
    })
  })

  test('somebody else’s address is refused', () => {
    expect(assessJoin('DPF-AAAA-BBBB', { ...fresh, issuedToEmail: 'bea@example.com' }, ada, now)).toMatchObject({
      reason: 'code-wrong-email',
    })
  })

  test('an expired code is refused', () => {
    expect(assessJoin('DPF-AAAA-BBBB', { ...fresh, expiresAt: earlier }, ada, now)).toMatchObject({
      reason: 'code-expired',
    })
  })

  test('a code claimed by somebody else is used', () => {
    const claimed = { ...fresh, status: 'claimed', claimedByUid: 'bea' }
    expect(assessJoin('DPF-AAAA-BBBB', claimed, ada, now)).toMatchObject({ reason: 'code-claimed' })
  })

  test('a code for the cohort they are in is refused, by name', () => {
    expect(assessJoin('DPF-AAAA-BBBB', { ...fresh, cohortId: 'cohort-1', cohortName: 'Cohort 1' }, ada, now)).toEqual({
      reason: 'already-member',
      message: 'You’re already in Cohort 1.',
    })
  })

  test('their own first code, typed again, is not a second join', () => {
    const own = { ...fresh, status: 'claimed', claimedByUid: 'ada', cohortId: 'cohort-1', cohortName: 'Cohort 1' }
    expect(assessJoin('DPF-FRST-0001', own, ada, now)).toMatchObject({ reason: 'already-member' })
  })

  test('a cohort they have been in before cannot be joined again', () => {
    expect(assessJoin('DPF-AAAA-BBBB', fresh, { ...ada, previousCohortIds: ['cohort-2'] }, now)).toEqual({
      reason: 'already-member',
      message: 'You’ve already been in Cohort 2.',
    })
  })

  test('a code with no program, or a cohort id that cannot be a prefix, is refused', () => {
    expect(assessJoin('DPF-AAAA-BBBB', { ...fresh, programId: '' }, ada, now)).toMatchObject({ reason: 'invalid-code' })
    expect(assessJoin('DPF-AAAA-BBBB', { ...fresh, cohortId: 'a~b' }, ada, now)).toMatchObject({ reason: 'invalid-code' })
  })
})

describe('setAsideId', () => {
  test('a log with no cohort is the cohort being left’s', () => {
    expect(setAsideId('w1-day1', undefined, 'cohort-1')).toBe('cohort-1~w1-day1')
    expect(setAsideId('week-3', undefined, 'cohort-1')).toBe('cohort-1~week-3')
  })

  test('a tagged log keeps its own cohort', () => {
    expect(setAsideId('w1-day1', 'cohort-1', 'cohort-1')).toBe('cohort-1~w1-day1')
  })

  test('one set aside by an earlier move is left where it is', () => {
    expect(setAsideId('cohort-0~w1-day1', 'cohort-0', 'cohort-1')).toBeNull()
  })
})

describe('ofCohort', () => {
  const log = (data: Record<string, unknown>) => ({ get: (field: string) => data[field] })

  test('a log tagged with the active cohort, or with none, is the active cohort’s', () => {
    expect(ofCohort(log({ cohortId: 'cohort-2' }), 'cohort-2')).toBe(true)
    expect(ofCohort(log({}), 'cohort-2')).toBe(true)
  })

  test('one from a cohort they were in before is not', () => {
    expect(ofCohort(log({ cohortId: 'cohort-1' }), 'cohort-2')).toBe(false)
  })
})

describe('issueRefusal', () => {
  const member = { cohortId: 'cohort-1', cohortName: 'Cohort 1', previousCohortIds: [] }
  const running = { name: 'Cohort 1', status: 'active', endDate: later, timezone: 'Africa/Lagos' }
  const ended = { ...running, endDate: earlier }

  test('nothing stops a code once their cohort is over', () => {
    expect(issueRefusal('ada@example.com', 'cohort-2', member, ended, now)).toBeNull()
    expect(issueRefusal('ada@example.com', 'cohort-2', member, { ...running, status: 'completed' }, now)).toBeNull()
    expect(issueRefusal('ada@example.com', 'cohort-2', member, { ...running, status: 'archived' }, now)).toBeNull()
  })

  test('a cohort that is gone holds nobody', () => {
    expect(issueRefusal('ada@example.com', 'cohort-2', member, null, now)).toBeNull()
  })

  test('a running cohort refuses a code for another one', () => {
    expect(issueRefusal('ada@example.com', 'cohort-2', member, running, now)).toBe(
      'ada@example.com is in Cohort 1, which is still running. They can be issued a code for another cohort once it ends.',
    )
  })

  test('a code for the cohort they are in, or were, is refused', () => {
    expect(issueRefusal('ada@example.com', 'cohort-1', member, ended, now)).toBe(
      'ada@example.com is already a member of Cohort 1.',
    )
    expect(
      issueRefusal('ada@example.com', 'cohort-0', { ...member, previousCohortIds: ['cohort-0'] }, ended, now),
    ).toBe('ada@example.com has already been a member of that cohort.')
  })
})

describe('dueToComplete', () => {
  const cohort = { status: 'active', timezone: 'Africa/Lagos', endDate: Timestamp.fromDate(new Date('2026-10-02T00:00:00+01:00')) }

  test('an active cohort completes at the midnight after its last day', () => {
    expect(dueToComplete(cohort, new Date('2026-10-02T23:59:00+01:00'))).toBe(false)
    expect(dueToComplete(cohort, new Date('2026-10-03T00:00:00+01:00'))).toBe(true)
  })

  test('a draft that never ran, or one already closed, is left as it is', () => {
    const after = new Date('2026-10-10T00:00:00+01:00')
    expect(dueToComplete({ ...cohort, status: 'draft' }, after)).toBe(false)
    expect(dueToComplete({ ...cohort, status: 'archived' }, after)).toBe(false)
    expect(dueToComplete({ ...cohort, status: 'completed' }, after)).toBe(false)
  })
})
