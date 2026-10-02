import { describe, expect, test } from 'bun:test'
import { Timestamp } from 'firebase-admin/firestore'
import { assessJoin, filesIn, issueRefusal, pendingOf, type Joiner, type PendingCohort } from '../src/memberships.js'

const now = new Date('2026-10-02T12:00:00+01:00')
const later = Timestamp.fromDate(new Date('2026-11-01T00:00:00+01:00'))
const earlier = Timestamp.fromDate(new Date('2026-09-01T00:00:00+01:00'))

const held: PendingCohort = {
  accessCode: 'DPF-NEXT-0002',
  cohortId: 'cohort-3',
  cohortName: 'Cohort 3',
  programId: 'program-a',
  programVersion: 1,
  claimedAt: earlier,
}

/** In cohort 1 by its code, nothing held. */
const ada: Joiner = {
  uid: 'ada',
  email: 'ada@example.com',
  cohortId: 'cohort-1',
  accessCode: 'DPF-FRST-0001',
  pending: null,
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

  test('a code for the cohort they are already in is refused, by name', () => {
    expect(assessJoin('DPF-AAAA-BBBB', { ...fresh, cohortId: 'cohort-1', cohortName: 'Cohort 1' }, ada, now)).toEqual({
      reason: 'already-member',
      message: 'You’re already in Cohort 1.',
    })
  })

  test('their own first code, typed again, is not a second join', () => {
    const own = { ...fresh, status: 'claimed', claimedByUid: 'ada', cohortId: 'cohort-1', cohortName: 'Cohort 1' }
    expect(assessJoin('DPF-FRST-0001', own, ada, now)).toMatchObject({ reason: 'already-member' })
  })

  test('a second code while one is held is refused', () => {
    expect(assessJoin('DPF-AAAA-BBBB', fresh, { ...ada, pending: held }, now)).toEqual({
      reason: 'already-registered',
      message: 'You’re already registered for Cohort 3.',
    })
  })

  test('the held code, sent again, resumes the join rather than refusing it', () => {
    const claimed = { ...fresh, status: 'claimed', claimedByUid: 'ada', cohortId: 'cohort-3' }
    expect(assessJoin('DPF-NEXT-0002', claimed, { ...ada, pending: held }, now)).toBe('resume')
  })

  test('a code with no program is refused before anybody moves on it', () => {
    expect(assessJoin('DPF-AAAA-BBBB', { ...fresh, programId: '' }, ada, now)).toMatchObject({
      reason: 'invalid-code',
    })
  })
})

describe('issueRefusal', () => {
  const member = { cohortId: 'cohort-1', cohortName: 'Cohort 1', pending: null }
  const running = { name: 'Cohort 1', status: 'active', endDate: later, timezone: 'Africa/Lagos' }
  const ended = { ...running, endDate: earlier }

  test('nothing stops a code once their cohort is over', () => {
    expect(issueRefusal('ada@example.com', 'cohort-2', member, ended, now)).toBeNull()
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

  test('a code for the cohort they are in is refused, running or not', () => {
    expect(issueRefusal('ada@example.com', 'cohort-1', member, ended, now)).toBe(
      'ada@example.com is already a member of Cohort 1.',
    )
  })

  test('a member holding their next cohort is refused a third', () => {
    expect(issueRefusal('ada@example.com', 'cohort-2', { ...member, pending: held }, ended, now)).toBe(
      'ada@example.com is already registered for Cohort 3.',
    )
  })
})

describe('pendingOf', () => {
  test('reads a held cohort as stored', () => {
    expect(pendingOf(held)).toEqual(held)
  })

  test('nothing, or half of one, is no held cohort', () => {
    expect(pendingOf(undefined)).toBeNull()
    expect(pendingOf(null)).toBeNull()
    expect(pendingOf({ cohortId: 'cohort-3' })).toBeNull()
    expect(pendingOf({ accessCode: 'DPF-NEXT-0002' })).toBeNull()
  })

  test('an id that would be a path is no held cohort', () => {
    expect(pendingOf({ ...held, accessCode: 'accessCodes/DPF-NEXT-0002' })).toBeNull()
    expect(pendingOf({ ...held, cohortId: 'cohorts/cohort-3' })).toBeNull()
  })
})

describe('filesIn', () => {
  const url = (bucket: string, path: string) =>
    `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=t`
  const photo = (path: string, bucket = 'recomp-48b7b-staging') => ({ storagePath: path, downloadUrl: url(bucket, path) })

  test('a progress photo, and the proof on a session, in the bucket they were uploaded to', () => {
    expect(filesIn({ image: photo('members/ada/progress/1.jpg') }, 'ada')).toEqual([
      { bucket: 'recomp-48b7b-staging', path: 'members/ada/progress/1.jpg' },
    ])
    expect(
      filesIn({ proofPhoto: photo('members/ada/proof/2.jpg', 'recomp-48b7b.firebasestorage.app') }, 'ada'),
    ).toEqual([{ bucket: 'recomp-48b7b.firebasestorage.app', path: 'members/ada/proof/2.jpg' }])
  })

  test('nothing to delete on a log with no upload', () => {
    expect(filesIn({ proofPhoto: null, weekNumber: 1 }, 'ada')).toEqual([])
  })

  test('never a file outside the member’s own folder', () => {
    expect(filesIn({ image: photo('members/bea/progress/1.jpg') }, 'ada')).toEqual([])
    expect(filesIn({ image: photo('members/ada/../bea/progress/1.jpg') }, 'ada')).toEqual([])
    expect(filesIn({ image: photo('chat/cohort-1/ada/1.jpg') }, 'ada')).toEqual([])
  })

  test('a download URL that names no bucket is left alone', () => {
    expect(filesIn({ image: { storagePath: 'members/ada/progress/1.jpg', downloadUrl: 'not a url' } }, 'ada')).toEqual([])
  })
})
