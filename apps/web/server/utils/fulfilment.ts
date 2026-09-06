// =============================================================================
// Turning a confirmed payment into a seat.
//
// One function, reached from two places that both fire in the normal case: the
// buyer's browser coming back through `callback_url`, and Paystack's webhook
// arriving server-to-server. Neither is reliable alone — a browser can be
// closed before it redirects, and a webhook can be delayed — so both run, and
// the interesting property of everything below is that running twice does the
// same thing as running once.
//
// Idempotency turns on `registrations/{reference}.code`. It is `null` until a
// payment is confirmed and set inside a transaction; whichever of the two
// callers gets there second reads a code already present and stops. The
// alternative — checking `paymentStatus` — has a window between the status
// write and the code write where a second caller mints a second seat.
// =============================================================================
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore'
import { issueAccessCode, readCohort, type Registration } from './access-code'
import { sendAccessCodeEmail, type BrevoConfig } from './email'
import type { VerifiedPayment } from './paystack'

export interface FulfilResult {
  /** What happened, for the log and for the confirmation screen. */
  outcome: 'issued' | 'already-issued' | 'not-paid' | 'unknown-reference'
  emailed: boolean
}

export interface FulfilOptions {
  cohortId: string
  ttlDays: number
  brevo: BrevoConfig
  appUrl: string
}

/**
 * Confirm, mint, record, send — in that order, and only once.
 *
 * The email is sent *outside* the transaction on purpose. A Firestore
 * transaction may be retried, and a retried transaction that sends email sends
 * it again; more importantly, a mail provider being slow must not hold a
 * database transaction open or roll back a seat somebody has paid for.
 */
export const fulfilRegistration = async (
  db: Firestore,
  payment: VerifiedPayment,
  options: FulfilOptions,
): Promise<FulfilResult> => {
  const ref = db.doc(`registrations/${payment.reference}`)

  // --- Everything that must happen exactly once ----------------------------
  const claim = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) return { outcome: 'unknown-reference' as const }

    const data = snap.data() as {
      code?: string | null
      fullName?: string
      email?: string
      whatsapp?: string
      timezone?: string
      emailed?: boolean
    }

    // Somebody already fulfilled this. Return what they issued so the caller
    // can still answer the buyer, but do not mint or charge anything again.
    if (data.code) {
      return {
        outcome: 'already-issued' as const,
        code: data.code,
        emailed: data.emailed === true,
        registration: null,
      }
    }

    return {
      outcome: 'claimable' as const,
      registration: {
        fullName: data.fullName ?? '',
        email: data.email ?? '',
        whatsapp: data.whatsapp ?? '',
        timezone: data.timezone ?? '',
      } satisfies Registration,
    }
  })

  if (claim.outcome === 'unknown-reference') {
    return { outcome: 'unknown-reference', emailed: false }
  }
  if (claim.outcome === 'already-issued') {
    return { outcome: 'already-issued', emailed: claim.emailed }
  }

  // --- Minting -------------------------------------------------------------
  // Outside the transaction because it reads the cohort and may retry on an id
  // collision, neither of which belongs inside a lock. The write below is what
  // closes the door: `code` is set with a precondition that it is still unset,
  // so two callers racing here cannot both record a seat.
  const cohort = await readCohort(db, options.cohortId)
  const { code } = await issueAccessCode(db, claim.registration, cohort, {
    ttlDays: options.ttlDays,
  })

  const won = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const existing = (snap.data() as { code?: string | null })?.code
    if (existing) return false
    tx.update(ref, {
      code,
      cohortId: cohort.id,
      paymentStatus: 'paid',
      paymentChannel: payment.channel,
      paidAt: payment.paidAt ? Timestamp.fromDate(new Date(payment.paidAt)) : Timestamp.now(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    return true
  })

  // Lost the race by a hair. The other caller is sending the email; this one
  // has minted a code nobody will be told about, which is a stray unused
  // document rather than a wrong outcome for the buyer. Worth a log so it can
  // be revoked if it ever happens often.
  if (!won) {
    console.warn(
      `[fulfil] ${payment.reference} was fulfilled concurrently; ${code} was minted and ` +
        'is not being delivered. It can be revoked in the console.',
    )
    return { outcome: 'already-issued', emailed: true }
  }

  // --- Delivery ------------------------------------------------------------
  const emailed = await sendAccessCodeEmail(options.brevo, {
    to: claim.registration.email,
    fullName: claim.registration.fullName,
    code,
    appUrl: options.appUrl,
  })

  // Recorded rather than retried. A send that failed against a paid seat is
  // the one case somebody has to fix by hand, and it needs to be findable:
  // `registrations` where `paymentStatus == 'paid'` and `emailed == false`.
  await ref.update({ emailed, updatedAt: FieldValue.serverTimestamp() })
  if (!emailed) {
    console.error(
      `[fulfil] ${payment.reference} is PAID but the access code email did not send. ` +
        `Code ${code} is issued and valid; it has to be sent by hand.`,
    )
  }

  return { outcome: 'issued', emailed }
}

/**
 * Records a verification that did not clear.
 *
 * `reason` rather than just the status, because "success" is a status that
 * still fails this check: a transaction can complete at Paystack for the wrong
 * amount or in the wrong currency, and a log saying `verified as "success" —
 * no code issued` reads like a bug in our own code rather than the mismatch it
 * actually is.
 */
export const recordFailedPayment = async (
  db: Firestore,
  reference: string,
  reason: string,
) => {
  try {
    await db.doc(`registrations/${reference}`).update({
      paymentStatus: 'failed',
      updatedAt: FieldValue.serverTimestamp(),
    })
  } catch {
    // An unknown reference is not worth an error: anyone can put one in a
    // query string, and there is nothing to record about a document that does
    // not exist.
  }
  console.warn(`[fulfil] ${reference} did not clear (${reason}) — no code issued.`)
}
