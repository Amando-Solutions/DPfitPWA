// =============================================================================
// GET /api/payment/status — has this registration been fulfilled yet?
//
// What replaced `/api/payment/verify`, and the replacement is a demotion. That
// route asked Paystack whether a reference had been paid and fulfilled it on
// the spot, which made the buyer's return the fast path to a seat. Selar has
// nothing to ask, so this route decides nothing: it reads our own database and
// reports whether the sale notification has arrived yet.
//
// Which means "not paid" is not a thing this can say. All it knows is whether a
// code exists, and a code that does not exist yet is indistinguishable from a
// buyer who abandoned checkout — a notification is usually seconds behind the
// redirect, but nothing promises that. The confirmation page is written to that
// limit: it waits, and if the wait runs out it says the payment is still being
// confirmed rather than claiming it did not happen.
//
// The reference comes from the cookie `register.post.ts` set, because Selar's
// redirect carries nothing. The query parameter is a fallback for the day that
// changes, and for anyone testing by hand.
// =============================================================================
import { firestore } from '../../utils/firebase'

export default defineEventHandler(async (event) => {
  const fromQuery = getQuery(event).reference
  const reference =
    (typeof fromQuery === 'string' ? fromQuery.trim() : '') || getCookie(event, 'dpf_ref') || ''

  // Checked before it is used to build a document path.
  if (!reference || !/^[A-Za-z0-9._-]{6,120}$/.test(reference)) {
    return { ok: true, state: 'unknown' as const, emailed: false }
  }

  const snap = await firestore().doc(`registrations/${reference}`).get()
  if (!snap.exists) return { ok: true, state: 'unknown' as const, emailed: false }

  const data = snap.data() as { code?: string | null; emailed?: boolean }

  // `code`, not `paymentStatus`. It is the field fulfilment sets last and the
  // one it treats as the lock, so it is the only one that means a seat really
  // exists and an email has been attempted.
  return {
    ok: true,
    state: data.code ? ('paid' as const) : ('pending' as const),
    emailed: data.emailed === true,
  }
})
