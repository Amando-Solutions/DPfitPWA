// =============================================================================
// Sending the codes a pre-order held.
//
// `fulfilRegistration` mints a pre-order sale's code at payment and holds it:
// `codeHeld: true` on the registration, and a reservation email instead of the
// code. This is the other half. Run on a schedule (see
// `api/preorder/release.post.ts`), it finds held registrations whose cohort's
// pre-order has closed, asks `createAccessCode` for the code again, and emails
// it.
//
// Nothing here knows a date in advance. Each run reads every cohort's window
// as it stands, so moving the end of a pre-order is the whole of rescheduling
// the release: a run before the new end sends nothing, and the first run after
// it sends everything.
//
// Asking for the code again rather than sending the one on file does two
// things. The function extends a live code's expiry to `ttlDays` from now, so
// a code minted weeks ago still gets its full lifetime from the day it is
// sent, however far the pre-order moved. And a code that expired while held,
// because the end moved past it, comes back as a new one that replaces it.
//
// Like fulfilment, running twice does the same as running once. A registration
// is leased before it is worked on, so two overlapping runs cannot both send
// it, and `codeHeld` is cleared only once the email has gone.
// =============================================================================
import { FieldValue, Timestamp, type DocumentReference, type Firestore } from 'firebase-admin/firestore'
import { reachableOrigin } from '../emails/access-code'
import { issueAccessCode, type IssuedCode } from './access-code'
import { codeLifetime, cohortOffer, type CohortFallbacks } from './cohort'
import { sendAccessCodeEmail, type BrevoConfig } from './email'

export interface ReleaseOptions {
  /** Registrations without a saved lifetime use their cohort's, then this. */
  codeTtlDaysFallback?: unknown
  /** The pre-order window for a cohort that has none of its own in Firestore. */
  preorderFallback?: Pick<CohortFallbacks, 'preorderStartsAt' | 'preorderEndsAt'>
  brevo: BrevoConfig
  /** The member-app origin to use when a registration does not carry one worth trusting. */
  appUrl: string
  /**
   * How long to keep starting new sends. What is left is reported as
   * `remaining` for the caller to ask again; a hosting platform's request
   * limit is the reason not to do everything in one go.
   */
  budgetMs?: number
}

export interface ReleaseResult {
  /** Code emailed. */
  released: number
  /** Tried and failed this run. Retried on the next one. */
  failed: number
  /** Settled without sending: revoked, already redeemed, or being sent by another run. */
  skipped: number
  /** Held, and the pre-order has not closed (or its cohort cannot be read). */
  waiting: number
  /** Due, but not reached before the budget ran out. */
  remaining: number
}

/** Long enough to cover one slow send, short enough that a crashed run is retried by the next one. */
const LEASE_MS = 10 * 60_000
/** Email attempts before the seat is handed to the manual `emailed == false` queue. */
const MAX_EMAIL_ATTEMPTS = 3
const CONCURRENCY = 4
/** Far more than a cohort sells. A larger backlog is worked through over successive runs. */
const PAGE = 1000

type Offer = Awaited<ReturnType<typeof cohortOffer>>

interface HeldRegistration {
  code: string
  codeHeld: boolean
  cohortId: string
  codeTtlDays?: number
  fullName?: string
  email?: string
  whatsapp?: string
  timezone?: string
  appUrl?: string
  releaseAttempts?: number
  releaseLeaseUntil?: Timestamp
}

export const releaseHeldCodes = async (db: Firestore, options: ReleaseOptions): Promise<ReleaseResult> => {
  const started = Date.now()
  const budget = options.budgetMs ?? 8_000
  const result: ReleaseResult = { released: 0, failed: 0, skipped: 0, waiting: 0, remaining: 0 }

  // One equality filter, so the automatic single-field index serves it.
  const snap = await db.collection('registrations').where('codeHeld', '==', true).limit(PAGE).get()

  // One read per cohort rather than per registration.
  const offers = new Map<string, Promise<Offer | null>>()
  const offerFor = (cohortId: string) => {
    if (!offers.has(cohortId)) {
      offers.set(cohortId, cohortOffer(db, cohortId, options.preorderFallback).catch((cause) => {
        // Not guessed at: a code held against a cohort nobody can read stays
        // held, and says so every run until the cohort is fixed.
        console.error(`[release] cohorts/${cohortId} could not be read; its held codes wait:`, cause)
        return null
      }))
    }
    return offers.get(cohortId)!
  }

  const due: { ref: DocumentReference; offer: Offer }[] = []
  for (const doc of snap.docs) {
    const cohortId = doc.get('cohortId')
    const offer = typeof cohortId === 'string' ? await offerFor(cohortId) : null
    // A window taken off the cohort altogether means it is no longer a
    // pre-order, and nothing is left to wait for.
    if (!offer || (offer.preorder && Date.now() < offer.preorder.endsAt.getTime())) {
      result.waiting++
      continue
    }
    due.push({ ref: doc.ref, offer })
  }

  let next = 0
  const worker = async () => {
    while (next < due.length && Date.now() - started < budget) {
      const { ref, offer } = due[next++]!
      result[await releaseOne(db, ref, offer, options)]++
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  result.remaining = due.length - next
  return result
}

/**
 * Send one held code. Never throws: every way it can end is an outcome, and
 * one registration failing must not stop the rest of the batch.
 */
const releaseOne = async (
  db: Firestore,
  ref: DocumentReference,
  offer: Offer,
  options: ReleaseOptions,
): Promise<'released' | 'failed' | 'skipped'> => {
  let held: HeldRegistration | null
  try {
    held = await db.runTransaction(async (tx) => {
      const data = (await tx.get(ref)).data() as HeldRegistration | undefined
      if (!data || data.codeHeld !== true || !data.code) return null
      if (data.releaseLeaseUntil && data.releaseLeaseUntil.toMillis() > Date.now()) return null
      tx.update(ref, { releaseLeaseUntil: Timestamp.fromMillis(Date.now() + LEASE_MS) })
      return data
    })
  } catch (cause) {
    console.error(`[release] ${ref.id} could not be leased:`, cause)
    return 'failed'
  }
  // Released since the query ran, or another run has it.
  if (!held) return 'skipped'

  const settle = (changes: Record<string, unknown>) =>
    ref.update({ ...changes, releaseLeaseUntil: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() })

  try {
    // Read, never written: `createAccessCode` stays the only writer of codes.
    // It has to be read because asking the function again would mint a fresh
    // seat for a code somebody revoked (a refund) or already redeemed (sent
    // by hand), and neither of those is owed another one.
    const status = (await db.doc(`accessCodes/${held.code}`).get()).get('status')
    if (status === 'revoked' || status === undefined) {
      console.warn(`[release] ${ref.id}: code ${held.code} was revoked or deleted while held; nothing sent.`)
      await settle({ codeHeld: false, releaseNote: 'The held code was revoked or deleted; nothing was sent.' })
      return 'skipped'
    }
    if (status === 'claimed') {
      await settle({ codeHeld: false, releaseNote: 'The held code was already redeemed; nothing was sent.' })
      return 'skipped'
    }

    const ttlDays = held.codeTtlDays ?? codeLifetime(offer.codeTtlDays, options.codeTtlDaysFallback)
    let issued: IssuedCode
    try {
      issued = await issueAccessCode(
        { fullName: held.fullName ?? '', email: held.email ?? '', whatsapp: held.whatsapp ?? '', timezone: held.timezone ?? '' },
        { cohortId: held.cohortId, ttlDays },
      )
    } catch (cause) {
      // Usually a cold start or a deploy in progress. Not counted against the
      // email attempts: the email was never the problem, so this is retried
      // every run until it goes through.
      console.error(`[release] ${ref.id}: createAccessCode failed; retrying next run:`, cause)
      await settle({})
      return 'failed'
    }
    if (issued.code !== held.code) {
      console.warn(`[release] ${ref.id}: the held code expired while held, so a new one replaces it.`)
    }
    // An older `createAccessCode` hands a live code back without extending it.
    if (issued.expiresAt && issued.expiresAt.getTime() < Date.now() + (ttlDays - 1) * 86_400_000) {
      console.warn(
        `[release] ${ref.id}: the code expires ${issued.expiresAt.toISOString()}, sooner than ` +
          `${ttlDays} days from now. Deploy the current createAccessCode, which extends it.`,
      )
    }

    // Off the registration first, for the reason given in `fulfilRegistration`.
    const appUrl = held.appUrl && reachableOrigin(held.appUrl) ? held.appUrl : options.appUrl
    const emailed = await sendAccessCodeEmail(options.brevo, {
      to: held.email ?? '',
      fullName: held.fullName ?? '',
      code: issued.code,
      appUrl,
    })

    const attempts = (held.releaseAttempts ?? 0) + 1
    if (emailed) {
      await settle({
        code: issued.code, codeHeld: false, emailed: true,
        releaseAttempts: attempts, releasedAt: FieldValue.serverTimestamp(),
      })
      return 'released'
    }

    // After a few tries it stops being retried and joins the seats that need
    // sending by hand: `paymentStatus == 'paid'` and `emailed == false`. Until
    // then `emailed` stays null, which keeps it out of that queue.
    const givingUp = attempts >= MAX_EMAIL_ATTEMPTS
    await settle({
      code: issued.code, codeHeld: !givingUp, emailed: givingUp ? false : null, releaseAttempts: attempts,
    })
    console.error(
      givingUp
        ? `[release] ${ref.id}: the access code email failed ${attempts} times. Code ${issued.code} ` +
            'is valid and has to be sent by hand.'
        : `[release] ${ref.id}: the access code email failed; retrying next run.`,
    )
    return 'failed'
  } catch (cause) {
    console.error(`[release] ${ref.id} could not be released:`, cause)
    await settle({}).catch(() => {})
    return 'failed'
  }
}
