// =============================================================================
// POST /api/register — step one: take the details, start the payment.
//
// This route no longer issues anything. It records the attempt and hands back a
// Paystack checkout URL; the access code is minted by `fulfilRegistration`,
// after Paystack has been asked directly whether money moved. That ordering is
// the point of the rewrite — the earlier version issued a live, redeemable code
// the moment the form was submitted, which meant anyone who filled it in and
// walked away held a seat.
//
// The amount is read from `PRICE_MINOR`, the same constant the page prints, so
// the sum initialised here cannot drift from the sum advertised. Nothing about
// what is charged reaches this route from the browser.
// =============================================================================
import { PRICE_MINOR, PRICE_CURRENCY } from '../../app/data/landing'
import { firestore } from '../utils/firebase'
import { initialiseTransaction, newReference, PaystackError } from '../utils/paystack'
import type { Registration } from '../utils/access-code'

/**
 * The same four checks the form makes, made again.
 *
 * Not redundant: the client-side copy in `RegisterSection.vue` is there to give
 * somebody a useful message next to the field they got wrong, and it can be
 * skipped entirely by anything that is not that form. This one decides what
 * reaches the database, so it is the one that has to be right. The messages are
 * deliberately terse — a caller that trips these is not a person reading them.
 */
const validate = (body: Record<string, unknown>): Registration => {
  const text = (key: string, max = 200) => {
    const value = typeof body[key] === 'string' ? (body[key] as string).trim() : ''
    // Length is capped as much to keep a document small as to reject anything:
    // nothing legitimate here is longer than a line.
    if (!value || value.length > max) {
      throw createError({ statusCode: 400, statusMessage: `Invalid ${key}.` })
    }
    return value
  }

  const email = text('email').toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid email.' })
  }

  const whatsapp = text('whatsapp', 32)
  if (!/^\+?[\d\s().-]{7,}$/.test(whatsapp)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid whatsapp.' })
  }

  return { fullName: text('fullName', 120), email, whatsapp, timezone: text('timezone', 120) }
}

/**
 * A speed bump, and only a speed bump.
 *
 * In-memory and therefore per-instance, which on a serverless deploy means it
 * is bypassed by anything patient enough to be spread across cold starts. It is
 * worth the fifteen lines anyway: every call here creates a document and a
 * Paystack transaction, and this stops a stuck retry loop or a single script
 * doing that in a tight cycle. Proper protection is a captcha or a WAF rule at
 * the edge, neither of which belongs in this file.
 */
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 5
const seen = new Map<string, number[]>()

const throttle = (key: string) => {
  const now = Date.now()
  const hits = (seen.get(key) ?? []).filter((at) => now - at < WINDOW_MS)
  hits.push(now)
  seen.set(key, hits)
  // Bounded so a long-lived instance cannot grow this map without limit.
  if (seen.size > 5000) {
    for (const [k, v] of seen) if (!v.some((at) => now - at < WINDOW_MS)) seen.delete(k)
  }
  if (hits.length > MAX_PER_WINDOW) {
    throw createError({ statusCode: 429, statusMessage: 'Too many attempts. Try again shortly.' })
  }
}

export default defineEventHandler(async (event) => {
  throttle(getRequestIP(event, { xForwardedFor: true }) ?? 'unknown')

  const registration = validate((await readBody(event)) ?? {})
  const config = useRuntimeConfig()

  if (!config.paystackSecretKey) {
    console.error(
      '[register] NUXT_PAYSTACK_SECRET_KEY is not set, so no payment can be started. ' +
        'Registration is blocked until it is.',
    )
    throw createError({
      statusCode: 500,
      statusMessage: 'Payment is temporarily unavailable. Please try again shortly.',
    })
  }

  // Chosen here rather than by Paystack, because it is also the id of the
  // document the payment will later be matched back to — so it has to exist
  // before the transaction does.
  const reference = newReference()

  try {
    const db = firestore()

    // Written first. A registration with no transaction behind it is an
    // abandoned form, which is readable and harmless; a transaction with no
    // registration behind it is a payment nobody can fulfil.
    await db.doc(`registrations/${reference}`).create({
      reference,
      code: null,
      ...registration,
      cohortId: config.registrationCohortId,
      source: 'landing',
      paymentStatus: 'pending',
      amountMinor: PRICE_MINOR,
      currency: PRICE_CURRENCY,
      paymentChannel: null,
      paidAt: null,
      emailed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const authorizationUrl = await initialiseTransaction(config.paystackSecretKey, {
      email: registration.email,
      amountMinor: PRICE_MINOR,
      currency: PRICE_CURRENCY,
      reference,
      // Absolute, because Paystack redirects a browser to it from its own
      // origin. `siteUrl` is this deployment; `appUrl` is the member app.
      callbackUrl: `${config.public.siteUrl.replace(/\/$/, '')}/registration/complete`,
      metadata: {
        fullName: registration.fullName,
        whatsapp: registration.whatsapp,
        timezone: registration.timezone,
        cohortId: config.registrationCohortId,
      },
    })

    // Only the URL. No reference, no amount, nothing the browser could alter
    // and nothing worth reading off a network tab.
    return { ok: true, authorizationUrl }
  } catch (cause) {
    console.error('[register] could not start the payment:', cause)
    throw createError({
      statusCode: 500,
      statusMessage:
        cause instanceof PaystackError
          ? 'We could not reach the payment provider. Please try again.'
          : 'We could not complete your registration. Please try again.',
    })
  }
})
