// =============================================================================
// POST /api/payment/webhook — Selar telling us somebody paid.
//
// The only thing in this deployment that issues a seat. Under Paystack this
// endpoint was a backstop for buyers who closed the tab before the callback
// ran; the callback could fulfil too, because it could ask Paystack directly
// what happened. Selar answers no such question, so this is not a backstop any
// more — it is the whole mechanism, and if it is not configured, buyers pay and
// nothing at all happens.
//
// What secures it is a shared secret, and nothing else. That is a real step
// down from what Paystack gave us and it is worth being plain about:
//
//   Paystack   HMAC-SHA512 of the raw body with the secret key, then the
//              payment re-verified against the API regardless — so a replayed
//              or altered body still could not invent a payment.
//   Selar      no signature to check and no API to re-verify against. A body
//              carrying the right token is believed.
//
// So the token has to be long, random, and known only to this server and the
// thing Selar sends through. Anyone who learns it can mint free seats by
// posting a made-up sale, and there is no second check behind it.
//
// It is read from `X-Selar-Token` in preference to `?token=`: the header stays
// out of access logs and referrers, and Zapier's Webhooks action can set one.
// The query parameter exists because Selar's own hook may not be able to.
// =============================================================================
import { PRICE_MINOR, PRICE_CURRENCY } from '../../../app/data/landing'
import { firestore } from '../../utils/firebase'
import { findRegistrationForSale, fulfilRegistration } from '../../utils/fulfilment'
import { describeAmount, isFromSelar, parseSaleEvent } from '../../utils/selar'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  if (!config.selarWebhookSecret) {
    console.error(
      '[webhook] NUXT_SELAR_WEBHOOK_SECRET is not set. Nothing can be fulfilled, which ' +
        'means every buyer who pays gets no access code. Set it and configure the same ' +
        'value on the Selar side.',
    )
    throw createError({ statusCode: 503, statusMessage: 'Not configured.' })
  }

  const token =
    getHeader(event, 'x-selar-token') ??
    getHeader(event, 'x-webhook-token') ??
    (getQuery(event).token as string | undefined)

  if (!isFromSelar(config.selarWebhookSecret, token)) {
    console.warn('[webhook] rejected a request with a missing or wrong token.')
    throw createError({ statusCode: 401, statusMessage: 'Bad token.' })
  }

  const raw = (await readRawBody(event, 'utf8')) ?? ''
  const payload = decode(raw, getHeader(event, 'content-type') ?? '')
  const sale = parseSaleEvent(payload)

  // No email means nothing can be matched, which is always a mapping mistake
  // at the sending end rather than a bad sale. 422 rather than a quiet 200 so
  // it shows up as a failed task where it can be seen and fixed, and the body
  // is logged — truncated, because it is somebody's personal data — because
  // getting the field names right is exactly what this log is for.
  if (!sale) {
    console.error(
      '[webhook] a sale notification arrived with no usable email address. The body was: ' +
        raw.slice(0, 800),
    )
    throw createError({ statusCode: 422, statusMessage: 'No email on the notification.' })
  }

  const db = firestore()
  const amount = describeAmount(sale, PRICE_MINOR, PRICE_CURRENCY)

  // Never a reason to refuse a seat, always a reason to write it down. Selar
  // prices convert into the buyer's own currency, so a mismatch here is
  // usually a Londoner paying in pounds rather than anything wrong — but an
  // underpayment in the home currency means the Selar product and the price on
  // the page have drifted apart, and that is worth finding out about.
  if (amount.matches === false) {
    console.warn(`[webhook] ${sale.email} ${amount.note} — issuing anyway, but check the price.`)
  }

  const reference = await findRegistrationForSale(db, sale)

  // Money moved and there is nothing to attach it to. Almost always a buyer
  // who changed the email address on Selar's checkout form away from the one
  // they registered with, occasionally somebody who bought from a Selar link
  // without ever filling in the form. Either way it is a person who has paid
  // and is waiting, so it is recorded somewhere a human will look rather than
  // left in a log line that scrolls away.
  if (!reference) {
    await db.collection('unmatchedSales').add({
      ...sale,
      expectedAmountMinor: PRICE_MINOR,
      expectedCurrency: PRICE_CURRENCY,
      amountNote: amount.note,
      resolved: false,
      receivedAt: new Date(),
    })
    console.error(
      `[webhook] a sale from ${sale.email} matches no registration. Nothing has been ` +
        'issued. It is recorded in `unmatchedSales` and needs a code by hand.',
    )
    return { ok: true, outcome: 'unmatched' }
  }

  try {
    const result = await fulfilRegistration(
      db,
      { ...sale, reference },
      {
        cohortId: config.registrationCohortId,
        ttlDays: Number(config.registrationCodeTtlDays) || 30,
        appUrl: config.public.appUrl,
        brevo: {
          apiKey: config.brevoApiKey,
          senderEmail: config.brevoSenderEmail,
          senderName: config.brevoSenderName,
          replyTo: config.brevoReplyTo,
          templateId: config.brevoTemplateId,
        },
      },
    )
    return { ok: true, outcome: result.outcome }
  } catch (cause) {
    // 500, and deliberately — the opposite of what this endpoint did under
    // Paystack. There, a swallowed error still left the browser callback able
    // to fulfil, so answering 200 and logging was safe. Here this is the only
    // path to a seat, so a Firestore that blinked has to look like a failure
    // to whatever sent it: Zapier shows a failed task and can replay it, and a
    // 200 would throw the sale away with a note in a log nobody is watching.
    console.error(`[webhook] ${reference} could not be fulfilled:`, cause)
    throw createError({ statusCode: 500, statusMessage: 'Could not fulfil the sale.' })
  }
})

/**
 * The body, whatever it was sent as.
 *
 * JSON is what a Zap sends by default and what Selar's own hook would send,
 * but the Webhooks action can be switched to form-encoded in one click and the
 * difference is invisible until no sale is ever matched again. Both are read,
 * and a body that is neither becomes an empty object — which fails the email
 * check a few lines later with a message that says so.
 */
const decode = (raw: string, contentType: string): unknown => {
  if (!raw) return {}
  if (contentType.includes('form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw))
  }
  try {
    return JSON.parse(raw)
  } catch {
    return Object.fromEntries(new URLSearchParams(raw))
  }
}
