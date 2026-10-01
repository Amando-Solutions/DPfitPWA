import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore'

const DAY = 86_400_000
const issued: { cohortId: string; ttlDays: number }[] = []
/** What `createAccessCode` hands back next: the held code, or a replacement. */
let nextCode = 'PAID-CODE'
mock.module('../server/utils/access-code', () => ({
  issueAccessCode: async (_buyer: unknown, options: { cohortId: string; ttlDays: number }) => {
    issued.push(options)
    return { code: nextCode, cohortId: options.cohortId, reused: false, expiresAt: new Date(Date.now() + options.ttlDays * DAY) }
  },
}))
const sent: { kind: 'code' | 'reserved'; to: string; code?: string }[] = []
let emailWorks = true
mock.module('../server/utils/email', () => ({
  sendAccessCodeEmail: async (_config: unknown, email: { to: string; code: string }) => {
    sent.push({ kind: 'code', to: email.to, code: email.code })
    return emailWorks
  },
  sendSlotReservedEmail: async (_config: unknown, email: { to: string }) => {
    sent.push({ kind: 'reserved', to: email.to })
    return emailWorks
  },
}))
const { fulfilRegistration, findRegistrationForSale } = await import('../server/utils/fulfilment')
const { releaseHeldCodes } = await import('../server/utils/release')
const sale = { reference: 'purchase', email: 'buyer@example.com', fullName: 'Buyer', saleReference: 'sale', amountMinor: 3000000, currency: 'NGN', product: null, paidAt: null, channel: null }
const brevo = { apiKey: '', senderEmail: '', senderName: '', replyTo: '', templateId: '' }
const options = { appUrl: 'https://app.example.com', brevo }
beforeEach(() => {
  issued.length = 0
  sent.length = 0
  nextCode = 'PAID-CODE'
  emailWorks = true
})

type Data = Record<string, unknown>
const ts = (ms: number) => Timestamp.fromMillis(ms)
const field = (data: Data | undefined, key: string) =>
  key.split('.').reduce<unknown>((value, k) => (value as Data | undefined)?.[k], data)
/** Firestore's update, including `FieldValue.delete()`. */
const apply = (data: Data, changes: Data) => {
  for (const [key, value] of Object.entries(changes)) {
    if (value instanceof FieldValue && value.isEqual(FieldValue.delete())) delete data[key]
    else data[key] = value
  }
}
const snapshot = (data: Data | undefined) =>
  ({ exists: data !== undefined, data: () => data, get: (key: string) => field(data, key) })

/** A cohort with no pre-order: fulfilled the way it always was. */
const plainCohort = (): Data => ({ startDate: ts(Date.now() + 30 * DAY), timezone: 'Africa/Lagos', registration: { codeTtlDays: 30 } })
/** A cohort whose pre-order opened yesterday and ends in `endsIn` ms (negative: already ended). */
const preorderCohort = (endsIn: number): Data => ({
  ...plainCohort(),
  registration: { codeTtlDays: 30, preorderStartsAt: ts(Date.now() - 10 * DAY), preorderEndsAt: ts(Date.now() + endsIn) },
})

function dbFor(data: Data, cohort: Data = plainCohort()) {
  const paths: string[] = []
  const ref = { get: async () => snapshot(data), update: async (changes: Data) => apply(data, changes) }
  return { paths, db: {
    doc(path: string) {
      paths.push(path)
      return path.startsWith('cohorts/') ? { get: async () => snapshot(cohort) } : ref
    },
    runTransaction: async (callback: (tx: unknown) => unknown) =>
      callback({ get: async () => snapshot(data), update: (_ref: unknown, changes: Data) => apply(data, changes) }),
  } as unknown as Firestore }
}

test('delayed payment issues against the saved cohort and lifetime', async () => {
  const data = { cohortId: 'previous-cohort', codeTtlDays: 45, code: null, fullName: 'Buyer', email: sale.email }
  const { db, paths } = dbFor(data)
  expect(await fulfilRegistration(db, sale, options)).toEqual({ outcome: 'issued', emailed: true })
  expect(issued).toEqual([{ cohortId: 'previous-cohort', ttlDays: 45 }])
  expect(paths).toEqual(['registrations/purchase', 'cohorts/previous-cohort'])
  expect(data.cohortId).toBe('previous-cohort')
  expect(await fulfilRegistration(db, sale, options)).toEqual({ outcome: 'already-issued', emailed: true })
  expect(issued).toHaveLength(1)
})

test('a registration without a cohort never falls back to an active cohort', async () => {
  await expect(fulfilRegistration(dbFor({ code: null, codeTtlDays: 45 }).db, sale, options)).rejects.toThrow('no valid cohort ID')
  expect(issued).toHaveLength(0)
})

test('a direct payment reference must match the buyer', async () => {
  const { db } = dbFor({ email: 'someone-else@example.com' })
  expect(await findRegistrationForSale(db, sale)).toBeNull()
})

test('ambiguous email-only purchases across cohorts require manual matching', async () => {
  const docs = ['old-cohort', 'new-cohort'].map((cohortId, index) => ({
    id: `purchase-${index}`, data: () => ({ cohortId, code: null }),
    get: (field: string) => ({ cohortId, amountMinor: 3000000, currency: 'NGN' })[field],
  }))
  const query = { where: () => query, limit: () => query, get: async () => ({ empty: false, size: 2, docs }) }
  const db = { collection: () => query } as unknown as Firestore
  expect(await findRegistrationForSale(db, { ...sale, reference: null })).toBeNull()
})

const HOUR = 60 * 60 * 1000
type Row = { id: string; cohortId: string; amountMinor: number; currency: string; ageMs: number; code?: string }

function lookupDb(rows: Row[]) {
  const docs = rows.map((row) => {
    const data = { ...row, code: row.code ?? null, createdAt: { toMillis: () => Date.now() - row.ageMs } }
    return { id: row.id, data: () => data, get: (field: string) => (data as Record<string, unknown>)[field] }
  })
  const query = { where: () => query, limit: () => query, get: async () => ({ empty: !docs.length, size: docs.length, docs }) }
  return { collection: () => query } as unknown as Firestore
}

const emailOnly = (amountMinor: number | null, currency: string | null) =>
  ({ ...sale, reference: null, amountMinor, currency })

test('a stale registration at another price does not block a new purchase', async () => {
  const db = lookupDb([
    { id: 'yesterday', cohortId: 'archived', amountMinor: 3000000, currency: 'NGN', ageMs: 13 * HOUR },
    { id: 'first-try', cohortId: 'active', amountMinor: 0, currency: 'NGN', ageMs: 10 * 60_000 },
    { id: 'paid-try', cohortId: 'active', amountMinor: 0, currency: 'NGN', ageMs: 2 * 60_000 },
  ])
  expect(await findRegistrationForSale(db, emailOnly(0, 'NGN'))).toBe('paid-try')
})

test('the paid amount picks the older registration when that is the one it matches', async () => {
  const db = lookupDb([
    { id: 'old-price', cohortId: 'archived', amountMinor: 3000000, currency: 'NGN', ageMs: 26 * HOUR },
    { id: 'new-price', cohortId: 'active', amountMinor: 2500000, currency: 'ngn', ageMs: 5 * 60_000 },
  ])
  expect(await findRegistrationForSale(db, emailOnly(3000000, 'NGN'))).toBe('old-price')
})

test('at the same price, the recent registration wins over an abandoned one', async () => {
  const db = lookupDb([
    { id: 'abandoned', cohortId: 'archived', amountMinor: 3000000, currency: 'NGN', ageMs: 26 * HOUR },
    { id: 'live', cohortId: 'active', amountMinor: 3000000, currency: 'NGN', ageMs: 5 * 60_000 },
  ])
  expect(await findRegistrationForSale(db, emailOnly(3000000, 'NGN'))).toBe('live')
})

test('a converted-currency sale still narrows by recency', async () => {
  const db = lookupDb([
    { id: 'abandoned', cohortId: 'archived', amountMinor: 3000000, currency: 'NGN', ageMs: 26 * HOUR },
    { id: 'live', cohortId: 'active', amountMinor: 2500000, currency: 'NGN', ageMs: 5 * 60_000 },
  ])
  expect(await findRegistrationForSale(db, emailOnly(1500, 'GBP'))).toBe('live')
})

test('two recent registrations for different offers still need a manual match', async () => {
  const db = lookupDb([
    { id: 'a', cohortId: 'archived', amountMinor: 3000000, currency: 'NGN', ageMs: 50 * 60_000 },
    { id: 'b', cohortId: 'active', amountMinor: 2500000, currency: 'NGN', ageMs: 5 * 60_000 },
  ])
  expect(await findRegistrationForSale(db, emailOnly(null, null))).toBeNull()
})

test('a sale matching no saved price and no recent registration still needs a manual match', async () => {
  const db = lookupDb([
    { id: 'a', cohortId: 'archived', amountMinor: 3000000, currency: 'NGN', ageMs: 30 * HOUR },
    { id: 'b', cohortId: 'active', amountMinor: 2500000, currency: 'NGN', ageMs: 6 * HOUR },
  ])
  expect(await findRegistrationForSale(db, emailOnly(100000, 'NGN'))).toBeNull()
})

test('fulfilled registrations are skipped, and all fulfilled returns the newest', async () => {
  const rows: Row[] = [
    { id: 'done', cohortId: 'archived', amountMinor: 3000000, currency: 'NGN', ageMs: 26 * HOUR, code: 'OLD-CODE' },
    { id: 'open', cohortId: 'active', amountMinor: 0, currency: 'NGN', ageMs: 5 * 60_000 },
  ]
  expect(await findRegistrationForSale(lookupDb(rows), emailOnly(0, 'NGN'))).toBe('open')
  rows[1]!.code = 'NEW-CODE'
  expect(await findRegistrationForSale(lookupDb(rows), emailOnly(0, 'NGN'))).toBe('open')
})

test('legacy registrations use environment lifetime only when their cohort lacks it', async () => {
  const { db, paths } = dbFor({ cohortId: 'original', code: null, email: sale.email }, { ...plainCohort(), registration: {} })
  await fulfilRegistration(db, sale, { ...options, codeTtlDaysFallback: '60' })
  expect(issued).toEqual([{ cohortId: 'original', ttlDays: 60 }])
  expect(paths).toEqual(['registrations/purchase', 'cohorts/original'])
})

test('legacy registrations prefer their cohort lifetime over environment fallback', async () => {
  const { db } = dbFor({ cohortId: 'original', code: null, email: sale.email }, { ...plainCohort(), registration: { codeTtlDays: 14 } })
  await fulfilRegistration(db, sale, { ...options, codeTtlDaysFallback: '60' })
  expect(issued).toEqual([{ cohortId: 'original', ttlDays: 14 }])
})

describe('A pre-order sale', () => {
  const buyer = () => ({ cohortId: 'core', codeTtlDays: 30, code: null, fullName: 'Buyer', email: sale.email } as Data)

  test('mints the code to outlast the window, holds it, and sends the reservation instead', async () => {
    const data = buyer()
    const { db } = dbFor(data, preorderCohort(5 * DAY))
    expect(await fulfilRegistration(db, sale, options)).toEqual({ outcome: 'reserved', emailed: true })
    expect(issued).toEqual([{ cohortId: 'core', ttlDays: 35 }])
    expect(data).toMatchObject({ code: 'PAID-CODE', codeHeld: true, reservationEmailed: true, paymentStatus: 'paid' })
    // Null, so it stays out of the `emailed == false` queue while held.
    expect(data.emailed).toBeNull()
    expect(sent).toEqual([{ kind: 'reserved', to: sale.email }])
    // A replayed notification finds the seat and sends nothing more.
    expect(await fulfilRegistration(db, sale, options)).toMatchObject({ outcome: 'already-issued' })
    expect(sent).toHaveLength(1)
  })

  test('whose notification lands after the window closed gets its code at once', async () => {
    const data = buyer()
    const { db } = dbFor(data, preorderCohort(-DAY))
    expect(await fulfilRegistration(db, sale, options)).toEqual({ outcome: 'issued', emailed: true })
    expect(issued).toEqual([{ cohortId: 'core', ttlDays: 30 }])
    expect(data).toMatchObject({ codeHeld: false, emailed: true })
    expect(sent).toEqual([{ kind: 'code', to: sale.email, code: 'PAID-CODE' }])
  })

  test('uses the environment window when its cohort has none', async () => {
    const data = buyer()
    const { db } = dbFor(data, plainCohort())
    const preorderFallback = {
      preorderStartsAt: new Date(Date.now() - DAY).toISOString(),
      preorderEndsAt: new Date(Date.now() + 2 * DAY).toISOString(),
    }
    expect(await fulfilRegistration(db, sale, { ...options, preorderFallback })).toMatchObject({ outcome: 'reserved' })
    expect(data.codeHeld).toBe(true)
  })
})

/** Registrations, cohorts and access codes, enough for `releaseHeldCodes`. */
function releaseDb(registrations: Record<string, Data>, cohorts: Record<string, Data>, codes: Record<string, Data>) {
  const refs = new Map<string, { id: string; update: (changes: Data) => Promise<void> }>()
  const regRef = (id: string) => {
    if (!refs.has(id)) refs.set(id, { id, update: async (changes) => apply(registrations[id]!, changes) })
    return refs.get(id)!
  }
  const query = {
    where: () => query,
    limit: () => query,
    get: async () => ({
      docs: Object.entries(registrations)
        .filter(([, data]) => data.codeHeld === true)
        .map(([id, data]) => ({ id, ref: regRef(id), get: (key: string) => field(data, key) })),
    }),
  }
  return {
    collection: () => query,
    doc(path: string) {
      const [collection, id] = path.split('/') as [string, string]
      const source = collection === 'cohorts' ? cohorts : collection === 'accessCodes' ? codes : registrations
      return { get: async () => snapshot(source[id]) }
    },
    runTransaction: async (callback: (tx: unknown) => unknown) => callback({
      get: async (ref: { id: string }) => snapshot(registrations[ref.id]),
      update: (ref: { id: string }, changes: Data) => apply(registrations[ref.id]!, changes),
    }),
  } as unknown as Firestore
}

describe('Releasing held codes', () => {
  const held = (extra: Data = {}): Data => ({
    code: 'HELD-1', codeHeld: true, cohortId: 'core', codeTtlDays: 30,
    fullName: 'Buyer', email: sale.email, paymentStatus: 'paid', ...extra,
  })
  const release = (db: Firestore, extra = {}) => releaseHeldCodes(db, { ...options, ...extra })

  test('follows the end date as it stands at each run', async () => {
    const registrations = { r1: held() }
    const cohorts = { core: preorderCohort(3 * DAY) }
    const db = releaseDb(registrations, cohorts, { 'HELD-1': { status: 'unused' } })
    nextCode = 'HELD-1'

    expect(await release(db)).toMatchObject({ waiting: 1, released: 0 })
    expect(sent).toEqual([])

    // The admin moves the end earlier; the next run sends.
    cohorts.core = preorderCohort(-60_000)
    expect(await release(db)).toMatchObject({ waiting: 0, released: 1, remaining: 0 })
    expect(issued).toEqual([{ cohortId: 'core', ttlDays: 30 }])
    expect(sent).toEqual([{ kind: 'code', to: sale.email, code: 'HELD-1' }])
    expect(registrations.r1).toMatchObject({ codeHeld: false, emailed: true, releaseAttempts: 1 })
    expect(registrations.r1.releaseLeaseUntil).toBeUndefined()

    // Running again sends nothing.
    expect(await release(db)).toMatchObject({ released: 0, waiting: 0 })
    expect(sent).toHaveLength(1)
  })

  test('a window taken off the cohort releases what it held', async () => {
    const registrations = { r1: held() }
    nextCode = 'HELD-1'
    const db = releaseDb(registrations, { core: plainCohort() }, { 'HELD-1': { status: 'unused' } })
    expect(await release(db)).toMatchObject({ released: 1 })
  })

  test('a code that expired while held is replaced by the new one', async () => {
    const registrations = { r1: held() }
    nextCode = 'NEW-1'
    const db = releaseDb(registrations, { core: preorderCohort(-DAY) }, { 'HELD-1': { status: 'unused' } })
    expect(await release(db)).toMatchObject({ released: 1 })
    expect(registrations.r1.code).toBe('NEW-1')
    expect(sent).toEqual([{ kind: 'code', to: sale.email, code: 'NEW-1' }])
  })

  test('a revoked or already-redeemed code is never replaced or sent', async () => {
    const registrations = { revoked: held(), redeemed: held({ code: 'HELD-2' }) }
    const codes = { 'HELD-1': { status: 'revoked' }, 'HELD-2': { status: 'claimed' } }
    const db = releaseDb(registrations, { core: preorderCohort(-DAY) }, codes)
    expect(await release(db)).toMatchObject({ skipped: 2, released: 0 })
    expect(issued).toEqual([])
    expect(sent).toEqual([])
    expect(registrations.revoked.codeHeld).toBe(false)
    expect(registrations.redeemed.codeHeld).toBe(false)
  })

  test('a registration another run has leased is left to it', async () => {
    const registrations = { r1: held({ releaseLeaseUntil: ts(Date.now() + 5 * 60_000) }) }
    const db = releaseDb(registrations, { core: preorderCohort(-DAY) }, { 'HELD-1': { status: 'unused' } })
    expect(await release(db)).toMatchObject({ skipped: 1 })
    expect(issued).toEqual([])
  })

  test('failed emails are retried, then handed to the manual queue', async () => {
    const registrations = { r1: held() }
    nextCode = 'HELD-1'
    emailWorks = false
    const db = releaseDb(registrations, { core: preorderCohort(-DAY) }, { 'HELD-1': { status: 'unused' } })
    expect(await release(db)).toMatchObject({ failed: 1 })
    expect(registrations.r1).toMatchObject({ codeHeld: true, emailed: null, releaseAttempts: 1 })
    await release(db)
    await release(db)
    expect(registrations.r1).toMatchObject({ codeHeld: false, emailed: false, releaseAttempts: 3 })
    expect(await release(db)).toMatchObject({ failed: 0, released: 0 })
  })

  test('what the time budget does not reach is reported, not dropped', async () => {
    const registrations = { r1: held(), r2: held({ code: 'HELD-2' }) }
    const db = releaseDb(registrations, { core: preorderCohort(-DAY) }, {})
    expect(await release(db, { budgetMs: 0 })).toMatchObject({ remaining: 2, released: 0 })
    expect(registrations.r1.codeHeld).toBe(true)
  })
})
