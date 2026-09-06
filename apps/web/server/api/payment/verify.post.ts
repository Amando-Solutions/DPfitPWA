// =============================================================================
// POST /api/payment/verify — the buyer is back from Paystack; did they pay?
//
// Called by `/registration/complete` with the reference Paystack put in the
// query string. That reference is not evidence of anything on its own — anyone
// can type one — so this asks Paystack directly and re-checks the amount and
// currency against what should have been charged.
//
// Safe to call more than once with the same reference. Fulfilment is idempotent
// and the webhook is very often here first, in which case this returns the same
// answer without minting or sending anything again.
// =============================================================================
import { PRICE_MINOR, PRICE_CURRENCY } from '../../../app/data/landing'
import { firestore } from '../../utils/firebase'
import { fulfilRegistration, recordFailedPayment } from '../../utils/fulfilment'
import { isPaid, verifyTransaction, PaystackError } from '../../utils/paystack'

export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) ?? {}
  const reference = typeof body.reference === 'string' ? body.reference.trim() : ''

  // Paystack's own character set for a reference. Checked before it is used to
  // build a document path or a URL.
  if (!reference || !/^[A-Za-z0-9._=-]{6,120}$/.test(reference)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid reference.' })
  }

  const config = useRuntimeConfig()
  if (!config.paystackSecretKey) {
    console.error('[verify] NUXT_PAYSTACK_SECRET_KEY is not set; nothing can be verified.')
    throw createError({ statusCode: 500, statusMessage: 'Could not confirm your payment.' })
  }

  try {
    const payment = await verifyTransaction(config.paystackSecretKey, reference)

    if (!isPaid(payment, PRICE_MINOR, PRICE_CURRENCY)) {
      // Includes the ordinary case of somebody who opened checkout and closed
      // it, which is why this is not an error — just an answer. The reason is
      // spelled out because a mismatched amount and an abandoned checkout are
      // very different problems and both end up here.
      const reason =
        payment.status !== 'success'
          ? `status ${payment.status}`
          : `paid ${payment.amountMinor} ${payment.currency}, expected ${PRICE_MINOR} ${PRICE_CURRENCY}`
      await recordFailedPayment(firestore(), reference, reason)
      return { ok: true, paid: false, emailed: false }
    }

    const result = await fulfilRegistration(firestore(), payment, {
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
    })

    if (result.outcome === 'unknown-reference') {
      // Paystack says this was paid, but there is no registration to attach it
      // to. Not something a buyer can fix, and not something to hide from a
      // log: it means money moved against a reference this deployment did not
      // create — a different environment sharing the Paystack account, most
      // likely, or a document deleted underneath a live checkout.
      console.error(
        `[verify] ${reference} is PAID at Paystack but has no registration document. ` +
          'Nothing has been issued. This needs looking at by hand.',
      )
      throw createError({ statusCode: 500, statusMessage: 'Could not confirm your payment.' })
    }

    // The code is never returned. Email is the delivery channel, and the page
    // only needs to know whether to point at an inbox.
    return { ok: true, paid: true, emailed: result.emailed }
  } catch (cause) {
    if (cause instanceof PaystackError) {
      console.error('[verify] Paystack:', cause.message)
      throw createError({ statusCode: 502, statusMessage: 'Could not confirm your payment.' })
    }
    if ((cause as { statusCode?: number }).statusCode) throw cause
    console.error('[verify] unexpected failure:', cause)
    throw createError({ statusCode: 500, statusMessage: 'Could not confirm your payment.' })
  }
})
