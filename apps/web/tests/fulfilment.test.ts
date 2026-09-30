import { beforeEach, expect, mock, test } from 'bun:test'
import type { Firestore } from 'firebase-admin/firestore'

const issued: { cohortId: string; ttlDays: number }[] = []
mock.module('../server/utils/access-code', () => ({
  issueAccessCode: async (_buyer: unknown, options: { cohortId: string; ttlDays: number }) => {
    issued.push(options)
    return { code: 'PAID-CODE', cohortId: options.cohortId }
  },
}))
mock.module('../server/utils/email', () => ({ sendAccessCodeEmail: async () => true }))
const { fulfilRegistration, findRegistrationForSale } = await import('../server/utils/fulfilment')
const sale = { reference: 'purchase', email: 'buyer@example.com', fullName: 'Buyer', saleReference: 'sale', amountMinor: 3000000, currency: 'NGN', product: null, paidAt: null, channel: null }
const options = { appUrl: 'https://app.example.com', brevo: { apiKey: '', senderEmail: '', senderName: '', replyTo: '', templateId: '' } }
beforeEach(() => { issued.length = 0 })

function dbFor(data: Record<string, unknown>) {
  const paths: string[] = []
  const snapshot = () => ({ exists: true, data: () => data, get: (key: string) => data[key] })
  const ref = { get: async () => snapshot(), update: async (changes: Record<string, unknown>) => Object.assign(data, changes) }
  return { paths, db: {
    doc(path: string) { paths.push(path); return ref },
    runTransaction: async (callback: (tx: unknown) => unknown) => callback({ get: async () => snapshot(), update: (_ref: unknown, changes: Record<string, unknown>) => Object.assign(data, changes) }),
  } as unknown as Firestore }
}

test('delayed payment issues against the saved cohort and lifetime', async () => {
  const data = { cohortId: 'previous-cohort', codeTtlDays: 45, code: null, fullName: 'Buyer', email: sale.email }
  const { db, paths } = dbFor(data)
  expect(await fulfilRegistration(db, sale, options)).toEqual({ outcome: 'issued', emailed: true })
  expect(issued).toEqual([{ cohortId: 'previous-cohort', ttlDays: 45 }])
  expect(paths).toEqual(['registrations/purchase'])
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

test('legacy registrations use environment lifetime only when their cohort lacks it', async () => {
  const { db, paths } = dbFor({ cohortId: 'original', code: null, email: sale.email })
  await fulfilRegistration(db, sale, { ...options, codeTtlDaysFallback: '60' })
  expect(issued).toEqual([{ cohortId: 'original', ttlDays: 60 }])
  expect(paths).toEqual(['registrations/purchase', 'cohorts/original'])
})

test('legacy registrations prefer their cohort lifetime over environment fallback', async () => {
  const { db } = dbFor({ cohortId: 'original', code: null, email: sale.email, 'registration.codeTtlDays': 14 })
  await fulfilRegistration(db, sale, { ...options, codeTtlDaysFallback: '60' })
  expect(issued).toEqual([{ cohortId: 'original', ttlDays: 14 }])
})
