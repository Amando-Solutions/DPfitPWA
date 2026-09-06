// =============================================================================
// POST /api/payment/webhook — Paystack telling us a charge succeeded.
//
// The backstop, and the reason a buyer who pays and immediately closes the tab
// still gets their code. The callback in `/registration/complete` covers the
// happy path and this covers everything else; both land on the same idempotent
// fulfilment, and in the ordinary case both of them run.
//
// Two things make this safe to expose:
//
//   1. The signature. HMAC-SHA512 of the RAW body with the secret key. Without
//      it this endpoint is an open invitation to issue free seats by posting a
//      made-up `charge.success`.
//   2. Verification anyway. The event body is treated as a claim, not a fact —
//      the reference is taken from it and the payment is confirmed by asking
//      Paystack, so a replayed or altered body still cannot invent a payment.
//
// Always answers 200 once the signature checks out. Paystack retries on any
// other status, and retrying will not fix a problem on our side; the log is
// where those go.
// =============================================================================
import { PRICE_MINOR, PRICE_CURRENCY } from '../../../app/data/landing'
import { firestore } from '../../utils/firebase'
import { fulfilRegistration } from '../../utils/fulfilment'
import { isPaid, isSignedByPaystack, verifyTransaction } from '../../utils/paystack'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  if (!config.paystackSecretKey) {
    throw createError({ statusCode: 503, statusMessage: 'Not configured.' })
  }

  // The raw text, not the parsed body. Re-serialising JSON changes key order
  // and whitespace, and the digest with it — which is the classic way a webhook
  // verifier ends up rejecting every legitimate call it receives.
  const raw = (await readRawBody(event, 'utf8')) ?? ''
  const signature = getHeader(event, 'x-paystack-signature') ?? ''

  if (!isSignedByPaystack(config.paystackSecretKey, raw, signature)) {
    console.warn('[webhook] rejected an unsigned or badly signed request.')
    throw createError({ statusCode: 401, statusMessage: 'Bad signature.' })
  }

  let payload: { event?: string; data?: { reference?: string } }
  try {
    payload = JSON.parse(raw)
  } catch {
    return { ok: true, ignored: 'unparseable' }
  }

  // Paystack sends a good many event types down one URL.
  if (payload.event !== 'charge.success' || !payload.data?.reference) {
    return { ok: true, ignored: payload.event ?? 'unknown' }
  }
  const reference = payload.data.reference

  try {
    // Asked rather than believed, even though the signature already proved the
    // sender. It costs one request and removes replay from the threat model.
    const payment = await verifyTransaction(config.paystackSecretKey, reference)
    if (!isPaid(payment, PRICE_MINOR, PRICE_CURRENCY)) {
      console.warn(`[webhook] ${reference} announced as paid but verified as "${payment.status}".`)
      return { ok: true, ignored: 'not-paid' }
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
    return { ok: true, outcome: result.outcome }
  } catch (cause) {
    // 200 regardless. A retry from Paystack cannot fix a cohort that does not
    // exist or a Firestore that is unreachable, and a webhook endpoint that
    // returns 500 for those gets hammered and then disabled.
    console.error(`[webhook] ${reference} could not be fulfilled:`, cause)
    return { ok: true, outcome: 'error' }
  }
})
