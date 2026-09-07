// =============================================================================
// POST /api/register — step one: take the details, send them to Selar.
//
// This route issues nothing. It records the attempt and hands back a Selar
// checkout URL; the access code is minted by `fulfilRegistration`, and only
// when Selar's sale notification arrives. That ordering is the point — an
// earlier version issued a live, redeemable code the moment the form was
// submitted, which meant anyone who filled it in and walked away held a seat.
//
// What changed with Selar is where the amount comes from. Paystack was handed
// `PRICE_MINOR` here, so the sum charged could not drift from the sum
// advertised. Selar owns its own price: the product is created once in their
// dashboard and this route only points a browser at it. `PRICE_MINOR` is still
// written onto the registration, but now as a record of what the page promised
// rather than as an instruction — see the note on the constant itself.
//
// The cookie set at the end is the other thing Selar forces. Paystack redirected
// the buyer back with the reference in the query string; Selar redirects to a
// fixed URL and says nothing, so this is the only way the confirmation page can
// know which registration to watch.
// =============================================================================
import { PRICE_MINOR, PRICE_CURRENCY } from '../../app/data/landing'
import { firestore } from '../utils/firebase'
import { checkoutUrl, newReference, SelarError } from '../utils/selar'
import type { Registration } from '../utils/access-code'

/** How long the confirmation page has to find its registration. */
const REFERENCE_COOKIE = 'dpf_ref'
const REFERENCE_COOKIE_MAX_AGE = 3 * 60 * 60

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
 * worth the fifteen lines anyway: every call here creates a document, and this
 * stops a stuck retry loop or a single script doing that in a tight cycle.
 * Proper protection is a captcha or a WAF rule at the edge, neither of which
 * belongs in this file.
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

  if (!config.selarProductUrl) {
    console.error(
      '[register] NUXT_SELAR_PRODUCT_URL is not set, so there is nowhere to send a buyer. ' +
        'Registration is blocked until it is.',
    )
    throw createError({
      statusCode: 500,
      statusMessage: 'Payment is temporarily unavailable. Please try again shortly.',
    })
  }

  // A second thing worth failing loudly on. The form would work without it —
  // a buyer could register and pay — but no notification could ever be
  // believed, so every one of those payments would end in silence. Better to
  // stop before taking anybody's money.
  if (!config.selarWebhookSecret) {
    console.error(
      '[register] NUXT_SELAR_WEBHOOK_SECRET is not set, so no sale could be fulfilled even ' +
        'if it were paid. Registration is blocked until it is.',
    )
    throw createError({
      statusCode: 500,
      statusMessage: 'Payment is temporarily unavailable. Please try again shortly.',
    })
  }

  // Ours alone now. Under Paystack this doubled as the transaction reference;
  // Selar has no field for it, so it is the id of the document a sale is later
  // matched back to by email, and nothing else.
  const reference = newReference()

  try {
    // Written first. A registration with no payment behind it is an abandoned
    // form, which is readable and harmless; a payment with no registration
    // behind it is money nobody can fulfil.
    await firestore()
      .doc(`registrations/${reference}`)
      .create({
        reference,
        code: null,
        ...registration,
        cohortId: config.registrationCohortId,
        source: 'landing',
        provider: 'selar',
        paymentStatus: 'pending',
        // What the page advertised. `paidAmountMinor` and `paidCurrency` are
        // written beside these when the sale arrives, and the two legitimately
        // differ: Selar converts the price into the buyer's own currency.
        amountMinor: PRICE_MINOR,
        currency: PRICE_CURRENCY,
        paidAmountMinor: null,
        paidCurrency: null,
        saleReference: null,
        paymentChannel: null,
        paidAt: null,
        emailed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

    // The only thread back to this registration. Selar's redirect goes to a
    // fixed URL configured on the product with nothing appended, so without
    // this the confirmation page has no idea who just came back.
    //
    // `lax` rather than `strict`: the return is a top-level navigation from
    // selar.co, and a strict cookie is withheld on exactly that, which would
    // leave every buyer looking at a page that cannot find them.
    setCookie(event, REFERENCE_COOKIE, reference, {
      httpOnly: true,
      sameSite: 'lax',
      secure: !import.meta.dev,
      path: '/',
      maxAge: REFERENCE_COOKIE_MAX_AGE,
    })

    // Only the URL. Nothing about the amount is decided here, and there is
    // nothing else worth reading off a network tab.
    return {
      ok: true,
      checkoutUrl: checkoutUrl({
        productUrl: config.selarProductUrl,
        reference,
        email: registration.email,
        fullName: registration.fullName,
        whatsapp: registration.whatsapp,
      }),
    }
  } catch (cause) {
    console.error('[register] could not start the payment:', cause)
    throw createError({
      statusCode: 500,
      statusMessage:
        cause instanceof SelarError
          ? 'Payment is temporarily unavailable. Please try again shortly.'
          : 'We could not complete your registration. Please try again.',
    })
  }
})
