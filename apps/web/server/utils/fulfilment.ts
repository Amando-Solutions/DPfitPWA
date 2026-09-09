// =============================================================================
// Turning a confirmed sale into a seat.
//
// One function, reached from one place: the sale notification Selar sends when
// somebody pays. Under Paystack there were two callers — the buyer's browser
// coming back through `callback_url` and the webhook — and either could fulfil,
// because either could ask Paystack directly whether money moved. Selar can be
// asked nothing, so the notification is the only evidence there is and the
// browser's return does nothing but poll for the result.
//
// Idempotency still matters, and for a plainer reason than before: notification
// delivery retries. A Zap that times out on our side is re-sent, Selar's own
// hook may repeat, and an operator re-running a failed task by hand is a normal
// Tuesday. The interesting property of everything below is that running twice
// does the same thing as running once.
//
// Idempotency turns on `registrations/{reference}.code`. It is `null` until a
// sale is fulfilled and set inside a transaction; whichever caller gets there
// second reads a code already present and stops. The alternative — checking
// `paymentStatus` — has a window between the status write and the code write
// where a second caller mints a second seat.
// =============================================================================
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore'
import { reachableOrigin } from '../emails/access-code'
import { issueAccessCode, readCohort, type Registration } from './access-code'
import { sendAccessCodeEmail, type BrevoConfig } from './email'
import type { ConfirmedSale, SaleEvent } from './selar'

export interface FulfilResult {
  /** What happened, for the log and for the confirmation screen. */
  outcome: 'issued' | 'already-issued' | 'unknown-reference'
  emailed: boolean
}

export interface FulfilOptions {
  cohortId: string
  ttlDays: number
  brevo: BrevoConfig
  /**
   * The fallback member-app origin: this deployment's own `appUrl`.
   *
   * Only used when the registration does not carry one worth trusting, which
   * is the normal case for anything written before it recorded one.
   */
  appUrl: string
}

/**
 * Which registration a sale belongs to.
 *
 * The hard part of the Selar flow, and the part Paystack made trivial. There,
 * the reference we generated *was* the transaction reference, so a payment
 * carried the answer with it. Selar has no field for it: the checkout URL
 * carries `dpf_ref`, but nothing promises it survives to the notification, so
 * that is tried first and then the real work begins.
 *
 * The real work is the email address, which is the only thing both sides
 * always have. It is pre-filled at checkout and the buyer can change it — so
 * this matches on the address that came back, and a buyer who paid under a
 * different address than they registered with is a support job, logged as
 * such, rather than a seat quietly issued to the wrong person.
 *
 * One equality filter, settled in memory, for the same reason as
 * `existingCode`: it keeps the automatic single-field index sufficient and
 * avoids a composite index for a query that returns one or two documents.
 */
export const findRegistrationForSale = async (
  db: Firestore,
  sale: SaleEvent,
): Promise<string | null> => {
  if (sale.reference) {
    const direct = await db.doc(`registrations/${sale.reference}`).get()
    if (direct.exists) return direct.id
  }

  const snap = await db
    .collection('registrations')
    .where('email', '==', sale.email)
    .limit(25)
    .get()
  if (snap.empty) return null

  const at = (doc: FirebaseFirestore.QueryDocumentSnapshot) =>
    (doc.data().createdAt as Timestamp | undefined)?.toMillis() ?? 0

  // Newest first, and an unfulfilled one in preference to a fulfilled one. A
  // buyer who has registered twice — abandoned checkout, came back, paid — has
  // two pending documents, and the seat belongs on the attempt they just paid
  // for. If every one of them already holds a code, the newest is returned
  // anyway so the caller reports `already-issued` rather than losing the sale.
  const docs = [...snap.docs].sort((a, b) => at(b) - at(a))
  return (docs.find((doc) => !doc.data().code) ?? docs[0]!).id
}

/**
 * Record, mint, send — in that order, and only once.
 *
 * The email is sent *outside* the transaction on purpose. A Firestore
 * transaction may be retried, and a retried transaction that sends email sends
 * it again; more importantly, a mail provider being slow must not hold a
 * database transaction open or roll back a seat somebody has paid for.
 */
export const fulfilRegistration = async (
  db: Firestore,
  sale: ConfirmedSale,
  options: FulfilOptions,
): Promise<FulfilResult> => {
  const ref = db.doc(`registrations/${sale.reference}`)

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
      appUrl?: string
    }

    // Somebody already fulfilled this. Return what they issued so the caller
    // can still answer, but do not mint or send anything again.
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
      // Deliberately beside the registration rather than on it: `Registration`
      // is what `issueAccessCode` writes onto the code document, and where the
      // buyer's browser was is no business of the code.
      appUrl: data.appUrl ?? '',
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
      paymentChannel: sale.channel,
      // What Selar reported, kept beside the advertised `amountMinor` rather
      // than overwriting it. Selar converts prices into the buyer's currency,
      // so these two legitimately differ and the pair is the only readable
      // record of what actually changed hands.
      paidAmountMinor: sale.amountMinor,
      paidCurrency: sale.currency,
      // Selar's own purchase code. The only handle their dashboard search
      // understands, so it is the first thing any support conversation needs.
      saleReference: sale.saleReference,
      paidAt: parsePaidAt(sale.paidAt),
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
      `[fulfil] ${sale.reference} was fulfilled concurrently; ${code} was minted and ` +
        'is not being delivered. It can be revoked in the console.',
    )
    return { outcome: 'already-issued', emailed: true }
  }

  // --- Delivery ------------------------------------------------------------
  // Off the registration, not off this deployment. The webhook that got here
  // is a single fixed URL configured once in Zapier, so `options.appUrl` is
  // whichever environment Selar happens to notify — usually production, even
  // for a buyer who registered on a preview build and expects the preview app.
  //
  // `reachableOrigin` guards the fallback rather than the preference: a
  // registration taken by a deployment with the variable unset carries
  // `http://localhost:3000`, and sending a real buyer to their own machine is
  // worse than sending them to the wrong environment.
  const appUrl = reachableOrigin(claim.appUrl) ? claim.appUrl : options.appUrl

  const emailed = await sendAccessCodeEmail(options.brevo, {
    to: claim.registration.email,
    fullName: claim.registration.fullName,
    code,
    appUrl,
  })

  // Recorded rather than retried. A send that failed against a paid seat is
  // the one case somebody has to fix by hand, and it needs to be findable:
  // `registrations` where `paymentStatus == 'paid'` and `emailed == false`.
  await ref.update({ emailed, updatedAt: FieldValue.serverTimestamp() })
  if (!emailed) {
    console.error(
      `[fulfil] ${sale.reference} is PAID but the access code email did not send. ` +
        `Code ${code} is issued and valid; it has to be sent by hand.`,
    )
  }

  return { outcome: 'issued', emailed }
}

/**
 * The sale's timestamp, or ours.
 *
 * Selar's notification dates arrive in whatever format the sending end chose —
 * ISO, `2026-09-06 14:03:11`, a human-readable string from a Zap. An
 * unparseable one becomes "now", which is off by seconds rather than wrong,
 * and is a great deal better than writing an Invalid Date into Firestore and
 * having every later read of the field throw.
 */
const parsePaidAt = (raw: string | null): Timestamp => {
  if (!raw) return Timestamp.now()
  const at = new Date(raw)
  return Number.isNaN(at.getTime()) ? Timestamp.now() : Timestamp.fromDate(at)
}
