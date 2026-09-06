// =============================================================================
// Paystack, for the one thing this site charges for.
//
// Server-side only, and deliberately the redirect flow rather than the inline
// popup. The popup would need a public key in the bundle and the amount
// decided in the browser; this way the transaction is initialised here — from
// `PRICE_MINOR`, the same constant the page prints — and the browser is only
// ever handed a URL to go to. Nothing about what is being charged is
// negotiable from the client.
//
// Two independent things confirm a payment, because a browser is not a
// reliable witness:
//
//   1. The callback. Paystack sends the buyer back to `callback_url` with the
//      reference, and the page verifies it. This is what makes the
//      confirmation screen possible.
//   2. The webhook. Paystack posts `charge.success` server-to-server, signed.
//      This is what covers the buyer who paid and then closed the tab, whose
//      callback never ran.
//
// Both land on the same fulfilment, which is written to be idempotent because
// in the normal case both of them fire.
// =============================================================================
import { createHmac, timingSafeEqual } from 'node:crypto'

const API = 'https://api.paystack.co'

/** Raised with a message safe to log, never one safe to show a buyer. */
export class PaystackError extends Error {}

const request = async <T>(
  secretKey: string,
  path: string,
  init?: { method: string; body: unknown },
): Promise<T> => {
  let response: Response
  try {
    response = await fetch(`${API}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        authorization: `Bearer ${secretKey}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: init ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(15_000),
    })
  } catch (cause) {
    throw new PaystackError(`could not reach Paystack (${path}): ${cause}`)
  }

  const text = await response.text()
  let payload: { status?: boolean; message?: string; data?: T }
  try {
    payload = JSON.parse(text)
  } catch {
    throw new PaystackError(`Paystack returned non-JSON from ${path}: ${text.slice(0, 300)}`)
  }

  // Paystack answers 200 with `status: false` for application-level failures,
  // so the HTTP code alone is not the answer.
  if (!response.ok || payload.status !== true || !payload.data) {
    throw new PaystackError(
      `Paystack refused ${path} (HTTP ${response.status}): ${payload.message ?? text.slice(0, 300)}`,
    )
  }
  return payload.data
}

/**
 * A reference we choose, rather than one Paystack generates.
 *
 * It is the id of the registration document, so it has to exist before the
 * transaction does. Paystack accepts letters, digits, `-`, `.` and `=`; this
 * stays inside that and carries a date so a support conversation about "the
 * one from Tuesday" can be had without a lookup.
 */
export const newReference = () => {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const random = Math.random().toString(36).slice(2, 10).toUpperCase()
  return `dpf-${day}-${random}`
}

export interface InitialiseInput {
  email: string
  amountMinor: number
  currency: string
  reference: string
  callbackUrl: string
  /** Echoed back on verify and on the webhook. Support reads this. */
  metadata: Record<string, unknown>
}

/** Returns the hosted checkout URL to send the buyer to. */
export const initialiseTransaction = async (
  secretKey: string,
  input: InitialiseInput,
): Promise<string> => {
  const data = await request<{ authorization_url: string }>(
    secretKey,
    '/transaction/initialize',
    {
      method: 'POST',
      body: {
        email: input.email,
        amount: input.amountMinor,
        currency: input.currency,
        reference: input.reference,
        callback_url: input.callbackUrl,
        metadata: input.metadata,
      },
    },
  )
  if (!data.authorization_url) {
    throw new PaystackError('Paystack initialised without an authorization_url.')
  }
  return data.authorization_url
}

export interface VerifiedPayment {
  reference: string
  status: string
  amountMinor: number
  currency: string
  paidAt: string | null
  channel: string | null
  /** The address Paystack has on the transaction, not the one we sent. */
  email: string
}

/**
 * Ask Paystack what actually happened, rather than believing the browser.
 *
 * The callback lands with a reference in the query string and nothing else —
 * anyone can type one. This is the only thing that decides whether a payment
 * happened, and the amount and currency are re-checked against what should
 * have been charged because a reference is not a receipt.
 */
export const verifyTransaction = async (
  secretKey: string,
  reference: string,
): Promise<VerifiedPayment> => {
  const data = await request<{
    reference: string
    status: string
    amount: number
    currency: string
    paid_at: string | null
    channel: string | null
    customer?: { email?: string }
  }>(secretKey, `/transaction/verify/${encodeURIComponent(reference)}`)

  return {
    reference: data.reference,
    status: data.status,
    amountMinor: data.amount,
    currency: data.currency,
    paidAt: data.paid_at,
    channel: data.channel,
    email: data.customer?.email ?? '',
  }
}

/** Whether a verified transaction is one we should act on. */
export const isPaid = (payment: VerifiedPayment, amountMinor: number, currency: string) =>
  payment.status === 'success' &&
  payment.amountMinor >= amountMinor &&
  payment.currency === currency

/**
 * Whether a webhook body really came from Paystack.
 *
 * HMAC-SHA512 of the *raw* body with the secret key, compared in constant
 * time. It has to be the raw bytes: re-serialising the parsed JSON changes key
 * order and whitespace, and the digest with it — which is the classic way a
 * webhook verifier ends up rejecting every legitimate call.
 */
export const isSignedByPaystack = (secretKey: string, rawBody: string, signature: string) => {
  if (!signature) return false
  const expected = createHmac('sha512', secretKey).update(rawBody, 'utf8').digest()
  let given: Buffer
  try {
    given = Buffer.from(signature, 'hex')
  } catch {
    return false
  }
  return expected.length === given.length && timingSafeEqual(expected, given)
}
