import { describe, expect, test } from 'bun:test'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { activeCohort, loadChallenge, registrationWithFallback, codeLifetime, preorderWindow, preorderState } from '../server/utils/cohort'
import { formatPrice, readRegistration } from '../app/data/challenge'
import { parseSaleEvent, describeAmount } from '../server/utils/selar'

const offer = { amountMinor: 3000050, currency: 'NGN', codeTtlDays: 60 }
const at = (iso: string) => Timestamp.fromDate(new Date(iso))
const window = { preorderStartsAt: at('2026-09-10T23:00:00Z'), preorderEndsAt: at('2026-09-24T23:00:00Z') }
/** Inside the pre-order above. */
const DURING = new Date('2026-09-20T12:00:00Z').getTime()
const cohort = {
  name: 'Core Experience', status: 'active', durationWeeks: 1,
  startDate: at('2026-09-29T23:00:00Z'),
  endDate: at('2026-10-06T23:00:00Z'),
  timezone: 'Africa/Lagos', programId: 'core', programVersion: 2, registration: { ...offer, ...window },
}

function database(rows = [cohort], program = { name: 'Core program', version: 2, status: 'published' }) {
  const queries: unknown[][] = []
  const db = {
    collection(name: string) {
      queries.push(['collection', name])
      return {
        where(...args: unknown[]) { queries.push(args); return this },
        limit(n: number) { expect(n).toBe(2); return this },
        async get() { return { size: rows.length, docs: rows.map((data, i) => ({ id: `cohort-${i}`, data: () => data })) } },
      }
    },
    doc(path: string) {
      expect(path).toBe('programs/core')
      return { async get() { return {
        exists: true, data: () => program,
        ref: { collection(name: string) { return { async get() { return { docs: name === 'weeks'
          ? [{ data: () => ({ weekNumber: 1, title: 'Core', subtitle: 'Build strength', secret: 'private' }) }]
          : [{ id: 'guide', data: () => ({ title: 'Nutrition', unlockWeek: 1, excerpt: 'An introduction', body: 'PAID CONTENT' }) }],
        } } } } },
      } } }
    },
  } as unknown as Firestore
  return { db, queries }
}

describe('Firestore cohort selection and public offer', () => {
  test('selects by active status without a configured ID', async () => {
    const { db, queries } = database()
    const result = await loadChallenge(db, {}, DURING)
    expect(queries).toContainEqual(['status', '==', 'active'])
    expect(result?.challenge).toMatchObject({ name: 'Core Experience', durationWeeks: 1, startsOn: '2026-09-30', endsOn: '2026-10-07', registrationOpen: true })
    expect(result?.challenge.weeks).toEqual([{ number: 1, title: 'Core', subtitle: 'Build strength' }])
    const json = JSON.stringify(result?.challenge)
    expect(json).not.toContain('PAID CONTENT')
    expect(json).not.toContain('selar.co')
    expect(json).not.toContain('secret')
  })
  test('no active cohort has no fallback', async () => {
    expect(await loadChallenge(database([]).db)).toBeNull()
  })
  test('multiple active cohorts fail instead of selecting the first', async () => {
    await expect(activeCohort(database([cohort, cohort]).db)).rejects.toThrow('Multiple active')
  })
  test('missing offer preserves details but closes registration', async () => {
    const result = await loadChallenge(database([{ ...cohort, registration: undefined } as never]).db)
    expect(result?.challenge.name).toBe('Core Experience')
    expect(result?.challenge.price).toBeNull()
    expect(result?.challenge.registrationOpen).toBe(false)
  })
  test('unpublished or mismatched program cannot be sold', async () => {
    for (const program of [{ name: 'Core', version: 2, status: 'draft' }, { name: 'Core', version: 3, status: 'published' }]) {
      const result = await loadChallenge(database([cohort], program).db, {}, DURING)
      expect(result?.challenge.registrationOpen).toBe(false)
      expect(result?.challenge.program).toBeNull()
      expect(result?.challenge.guides).toEqual([])
    }
  })
  test('invalid dates and timezone do not invent fallback dates', async () => {
    await expect(loadChallenge(database([{ ...cohort, timezone: 'not/a-zone' }]).db)).rejects.toThrow()
    await expect(loadChallenge(database([{ ...cohort, endDate: cohort.startDate }]).db)).rejects.toThrow()
  })
  test('offer validation refuses partial and malformed pricing', () => {
    for (const value of [null, {}, { ...offer, amountMinor: 1.5 }, { ...offer, currency: '' }, { ...offer, codeTtlDays: 0 }]) {
      expect(() => readRegistration(value)).toThrow()
    }
    expect(readRegistration(offer)).toEqual(offer)
  })
  test('formatting preserves minor-unit amounts and currency precision', () => {
    expect(formatPrice(3000050, 'NGN').label).toContain('30,000.50')
    expect(formatPrice(500, 'JPY').label).toContain('500')
  })
})

const fallback = { price: '30000', currency: 'NGN', codeTtlDays: '60', cohortId: 'legacy' }

describe('Firestore-first environment fallbacks', () => {
  test('a complete Firestore offer wins over every environment value', () => {
    expect(registrationWithFallback(offer, fallback)).toEqual(offer)
    expect(registrationWithFallback({ ...offer, amountMinor: 0 }, fallback).amountMinor).toBe(0)
  })
  test('an absent map uses explicitly configured environment values', () => {
    expect(registrationWithFallback(undefined, fallback)).toEqual({ amountMinor: 3000000, currency: 'NGN', codeTtlDays: 60 })
  })
  test('fallback applies independently to missing fields', () => {
    expect(registrationWithFallback({ amountMinor: 4500000, codeTtlDays: 15 }, fallback)).toEqual({ amountMinor: 4500000, currency: 'NGN', codeTtlDays: 15 })
    expect(registrationWithFallback({ currency: 'JPY' }, fallback)).toEqual({ amountMinor: 30000, currency: 'JPY', codeTtlDays: 60 })
  })
  test('empty or null fields use fallback, but invalid authored values do not', () => {
    expect(registrationWithFallback({ amountMinor: null, currency: '', codeTtlDays: null }, fallback).amountMinor).toBe(3000000)
    expect(() => registrationWithFallback({ ...offer, amountMinor: -1 }, fallback)).toThrow()
    expect(() => registrationWithFallback({ ...offer, codeTtlDays: 0 }, fallback)).toThrow()
    expect(() => registrationWithFallback('broken', fallback)).toThrow()
  })
  test('without Firestore or environment values there are no invented defaults', () => {
    expect(() => registrationWithFallback(undefined)).toThrow()
    expect(() => codeLifetime(undefined)).toThrow()
    expect(codeLifetime(undefined, '45')).toBe(45)
    expect(codeLifetime(20, '45')).toBe(20)
  })
  test('an active cohort wins over the environment ID', async () => {
    expect((await activeCohort(database().db, 'legacy'))?.id).toBe('cohort-0')
  })
  test('only no active cohort uses a real non-archived fallback document', async () => {
    let status = 'draft'
    const paths: string[] = []
    const query = { where: () => query, limit: () => query, get: async () => ({ size: 0, docs: [] }) }
    const db = { collection: () => query, doc: (path: string) => {
      paths.push(path)
      return { get: async () => ({ id: 'legacy', exists: true, get: () => status }) }
    } } as unknown as Firestore
    expect((await activeCohort(db, 'legacy'))?.id).toBe('legacy')
    expect(paths).toEqual(['cohorts/legacy'])
    status = 'archived'
    expect(await activeCohort(db, 'legacy')).toBeNull()
  })
  test('Firestore failures do not silently use a stale environment ID', async () => {
    let fallbackRead = false
    const query = { where: () => query, limit: () => query, get: async () => { throw new Error('offline') } }
    const db = { collection: () => query, doc: () => { fallbackRead = true } } as unknown as Firestore
    await expect(activeCohort(db, 'legacy')).rejects.toThrow('offline')
    expect(fallbackRead).toBe(false)
  })
})

describe('The pre-order window', () => {
  const start = new Date('2026-09-29T23:00:00Z')
  const env = { preorderStartsAt: '2026-09-01T00:00:00+01:00', preorderEndsAt: '2026-09-20T00:00:00+01:00' }

  test('seats are sold only while the pre-order is open', async () => {
    const states = []
    for (const now of ['2026-09-05T00:00:00Z', '2026-09-20T12:00:00Z', '2026-09-25T00:00:00Z']) {
      const result = await loadChallenge(database().db, {}, new Date(now).getTime())
      states.push([result?.challenge.preorder?.state, result?.challenge.registrationOpen])
    }
    expect(states).toEqual([['upcoming', false], ['open', true], ['closed', false]])
  })
  test('the window is labelled in the cohort zone, with the zone named', async () => {
    const result = await loadChallenge(database().db, {}, DURING)
    expect(result?.challenge.preorder).toMatchObject({ startsAt: '2026-09-10T23:00:00.000Z', endsAt: '2026-09-24T23:00:00.000Z' })
    // "Sep" or "Sept", depending on the runtime's ICU.
    expect(result?.challenge.preorder?.startsLabel).toMatch(/^11 Sept? 2026 at 00:00 GMT\+1$/)
    expect(result?.challenge.preorder?.endsLabel).toMatch(/^25 Sept? 2026 at 00:00 GMT\+1$/)
  })
  test('a cohort with no window anywhere is displayed but not sold', async () => {
    const result = await loadChallenge(database([{ ...cohort, registration: offer }]).db, {}, DURING)
    expect(result?.challenge.name).toBe('Core Experience')
    expect(result?.challenge.preorder).toBeNull()
    expect(result?.challenge.registrationOpen).toBe(false)
  })
  test('a broken window is displayed but not sold', async () => {
    const reversed = { ...offer, preorderStartsAt: window.preorderEndsAt, preorderEndsAt: window.preorderStartsAt }
    const result = await loadChallenge(database([{ ...cohort, registration: reversed }]).db, {}, DURING)
    expect(result?.challenge.preorder).toBeNull()
    expect(result?.challenge.registrationOpen).toBe(false)
  })
  test('Firestore wins, and the environment fills each missing end', () => {
    expect(preorderWindow(window, start, env)).toEqual({
      startsAt: new Date('2026-09-10T23:00:00Z'), endsAt: new Date('2026-09-24T23:00:00Z'),
    })
    expect(preorderWindow({ preorderStartsAt: window.preorderStartsAt }, start, env)).toEqual({
      startsAt: new Date('2026-09-10T23:00:00Z'), endsAt: new Date('2026-09-19T23:00:00Z'),
    })
    expect(preorderWindow(undefined, start, env)?.startsAt).toEqual(new Date('2026-08-31T23:00:00Z'))
    expect(preorderWindow(undefined, start)).toBeNull()
  })
  test('a window may run past the cohort start', () => {
    expect(preorderWindow({ ...window, preorderEndsAt: at('2026-09-30T00:00:00Z') }, start)?.endsAt)
      .toEqual(new Date('2026-09-30T00:00:00Z'))
  })
  test('half-set, reversed or mistyped windows throw instead of guessing', () => {
    expect(() => preorderWindow({ preorderStartsAt: window.preorderStartsAt }, start)).toThrow('both')
    expect(() => preorderWindow({ preorderStartsAt: window.preorderEndsAt, preorderEndsAt: window.preorderStartsAt }, start)).toThrow('after it starts')
    expect(() => preorderWindow({ ...window, preorderEndsAt: '2026-09-20' }, start, env)).toThrow('must be a timestamp')
    expect(() => preorderWindow(undefined, start, { ...env, preorderEndsAt: 'soon' })).toThrow('not an ISO 8601 date')
  })
  test('the end is exclusive: the pre-order is closed at its closing instant', () => {
    const w = { startsAt: new Date('2026-09-01T00:00:00Z'), endsAt: new Date('2026-09-20T00:00:00Z') }
    expect(preorderState(w, w.endsAt.getTime() - 1)).toBe('open')
    expect(preorderState(w, w.endsAt.getTime())).toBe('closed')
    expect(preorderState(w, w.startsAt.getTime())).toBe('open')
  })
})

test('webhook amounts use the same currency precision as displayed prices', () => {
  for (const [currency, amount, minor] of [['NGN', '30000.50', 3000050], ['JPY', '500', 500], ['KWD', '2.125', 2125]] as const) {
    const sale = parseSaleEvent({ email: 'buyer@example.com', amount, currency })!
    expect(sale.amountMinor).toBe(minor)
    expect(describeAmount(sale, minor, currency).matches).toBe(true)
    expect(describeAmount(sale, minor + 1, currency).matches).toBe(false)
  }
})
