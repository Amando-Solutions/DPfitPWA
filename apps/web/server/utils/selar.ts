// =============================================================================
// Selar, for the one thing this site charges for.
//
// Selar is not Paystack, and that difference decides the shape of everything
// here. Paystack has an endpoint you hand an amount and a reference to, and a
// second one you can ask afterwards whether that reference was paid. Selar has
// neither. A product is created once in the Selar dashboard, it carries its own
// price, and it is sold from a hosted page at a fixed URL. There is no
// initialise call, no verify call, and no signed webhook — the platform is
// built for creators wiring things together in Zapier, not for a server that
// wants to be told, authoritatively, whether money moved.
//
// So the flow inverts:
//
//   Paystack  we state the amount → they take the money → we ask if it landed
//   Selar     they state the amount → they take the money → they tell us
//
// Three things follow, and each one is a deliberate loss:
//
//   1. The price lives in the Selar dashboard, not in `PRICE_MINOR`. The
//      constant here is now what the page advertises and what a sale is
//      checked against — not what is charged. Keeping the two agreeing is a
//      person's job, so `describeAmount` exists to make a mismatch loud in the
//      log rather than silent.
//   2. Nothing can be verified after the fact. The sale notification IS the
//      evidence, which is why `SELAR_WEBHOOK_SECRET` is not optional: without
//      it the fulfilment endpoint is an open invitation to mint free seats.
//   3. The buyer's browser comes back knowing nothing. Selar redirects to a
//      fixed URL with no reference on it, so `/registration/complete` polls
//      our own database instead of asking anybody anything. The cookie set in
//      `register.post.ts` is what tells that page which registration to watch.
//
// What Selar does give us is a checkout URL that can be pre-filled from a query
// string, which is enough to keep the form-then-pay flow the site already has.
// =============================================================================
import { createHash, timingSafeEqual } from 'node:crypto'

/** Raised with a message safe to log, never one safe to show a buyer. */
export class SelarError extends Error {}

/**
 * A reference we choose, because nobody else will give us one.
 *
 * It is the id of the registration document, and under Paystack it doubled as
 * the transaction reference. Selar has its own purchase codes and no way to be
 * told ours, so this is now purely local: the key a sale is matched *back* to,
 * by the buyer's email address. It still carries a date, so a support
 * conversation about "the one from Tuesday" can be had without a lookup.
 */
export const newReference = () => {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const random = Math.random().toString(36).slice(2, 10).toUpperCase()
  return `dpf-${day}-${random}`
}

export interface CheckoutInput {
  /** The product's Selar link, e.g. `https://selar.co/abc123`. */
  productUrl: string
  /** Ours, echoed back only if Selar chooses to pass query strings through. */
  reference: string
  email: string
  fullName: string
  whatsapp: string
}

/**
 * The hosted checkout URL to send the buyer to.
 *
 * `add_to_cart=1` is Selar's quick-checkout switch: it drops the product
 * straight into the cart and opens the checkout form, skipping the product
 * page. It only works on a direct product link — a store-front URL ignores it
 * and the buyer lands on a listing wondering what happened — so a URL with a
 * path of just `/` is refused here rather than half-working in production.
 *
 * `email`, `fullname` and `mobile` are Selar's own pre-fill parameters. They
 * are a convenience, not a contract: the buyer can edit any of them on the
 * checkout form, which is exactly why `webhook.post.ts` matches on whatever
 * address comes back rather than on the one we sent.
 *
 * `dpf_ref` is ours and Selar knows nothing about it. It costs nothing, it is
 * read back if it ever survives the round trip, and it is deliberately not
 * called `ref` — that is the affiliate parameter, and a sale wrongly credited
 * to an affiliate is a real cost for a made-up field name.
 */
export const checkoutUrl = (input: CheckoutInput): string => {
  let url: URL
  try {
    url = new URL(input.productUrl)
  } catch {
    throw new SelarError(`NUXT_SELAR_PRODUCT_URL is not a URL: ${input.productUrl}`)
  }
  if (url.protocol !== 'https:') {
    throw new SelarError(`NUXT_SELAR_PRODUCT_URL must be https: ${input.productUrl}`)
  }
  if (url.pathname === '/' || url.pathname === '') {
    throw new SelarError(
      `NUXT_SELAR_PRODUCT_URL must be a direct product link (https://selar.co/<code>), ` +
        `not a store front: ${input.productUrl}`,
    )
  }

  // Assigned rather than appended, so a URL pasted with parameters already on
  // it — Selar's own share links sometimes carry them — cannot end up with two
  // copies of `email` and a checkout form that picks the wrong one.
  url.searchParams.set('add_to_cart', '1')
  url.searchParams.set('email', input.email)
  url.searchParams.set('fullname', input.fullName)
  url.searchParams.set('mobile', input.whatsapp)
  url.searchParams.set('dpf_ref', input.reference)
  return url.toString()
}

// -----------------------------------------------------------------------------
// The sale notification
// -----------------------------------------------------------------------------

/**
 * One sale, as far as we can tell from a body we do not control.
 *
 * Every field except `email` is optional, because the payload shape depends on
 * how the sale reaches us — Selar's own hook, a Zap with a hand-built field
 * mapping, or a Zap forwarding the trigger wholesale. `email` is the exception
 * because it is the only thing that matches a sale to a registration, and a
 * notification without one is not actionable at all.
 */
export interface SaleEvent {
  email: string
  fullName: string | null
  /** Ours, if it somehow made the round trip. Almost never present. */
  reference: string | null
  /** Selar's, for the support conversation. Whatever it chose to send. */
  saleReference: string | null
  amountMinor: number | null
  currency: string | null
  /** Product name, code or URL — whichever the payload happened to carry. */
  product: string | null
  paidAt: string | null
  channel: string | null
}

/** What fulfilment acts on: a sale matched to a registration we know about. */
export interface ConfirmedSale extends SaleEvent {
  /** The registration document id. Resolved before fulfilment, never guessed. */
  reference: string
}

/**
 * Every scalar in the body, keyed by name, shallowest first.
 *
 * A field-name lookup rather than a schema, because there is no schema to
 * write against. Zapier's Webhooks action sends exactly the keys somebody
 * typed into a form; Selar's own payload nests differently again. Flattening
 * breadth-first and keying on the last path segment means `customer.email`,
 * `data.customer.email` and a bare `email` all answer to the same lookup, and
 * the shallowest wins when more than one does — a top-level `email` beats
 * `data.affiliate.email`, which is the right way round.
 *
 * Every scalar is recorded twice: under its own name and under its name
 * prefixed by its parent's. So a lookup can ask for the precise
 * `customeremail` and fall back to the bare `email` a flat payload would have
 * used, which is what lets one list of candidate names handle both.
 */
const flatten = (payload: unknown): Map<string, string> => {
  const flat = new Map<string, string>()
  const queue: Array<{ parent: string; key: string; value: unknown }> = [
    { parent: '', key: '', value: payload },
  ]
  // Bounded: a hostile or merely enormous body must not turn into an unbounded
  // walk. Nothing legitimate here is anywhere near this size.
  let visited = 0

  const set = (key: string, value: string) => {
    if (key && !flat.has(key)) flat.set(key, value)
  }

  while (queue.length && visited < 2000) {
    const { parent, key, value } = queue.shift()!
    visited++

    if (value === null || value === undefined) continue

    if (Array.isArray(value)) {
      // The parent carries through rather than the index-suffixed key, so a
      // line item's `name` is still reachable as `productsname`. The index
      // stays on the key itself so the first item of an order does not
      // silently overwrite the second.
      value
        .slice(0, 20)
        .forEach((item, i) => queue.push({ parent, key: `${key}${i}`, value: item }))
      continue
    }

    if (typeof value === 'object') {
      // The index is stripped off the parent so a line item's fields qualify
      // as `productsname` rather than `products0name` — the caller is asking
      // what kind of thing it is, not which one.
      const qualifier = key.replace(/\d+$/, '')
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        queue.push({ parent: qualifier, key: normalise(k), value: v })
      }
      continue
    }

    // Both the bare name and the name qualified by its parent, so a lookup can
    // ask for either. `customer.email` answers to `email` — which is what a
    // flat payload would have called it — and to `customeremail`, which is
    // what distinguishes it from `affiliate.email` when both are present.
    set(key, String(value))
    set(`${parent}${key}`, String(value))
  }

  return flat
}

/** `Customer_Email` and `customeremail` are the same key as far as we care. */
const normalise = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '')

const field = (flat: Map<string, string>, ...names: string[]): string | null => {
  for (const name of names) {
    const value = flat.get(normalise(name))?.trim()
    if (value) return value
  }
  return null
}

const SYMBOLS: Record<string, string> = { '₦': 'NGN', $: 'USD', '£': 'GBP', '€': 'EUR' }

/**
 * A displayed amount turned into minor units.
 *
 * Sale notifications carry the amount the way a human reads it — `30,000`,
 * `₦30,000.00`, `NGN 30000` — never the integer kobo Paystack deals in. So the
 * currency is taken from whatever symbol or code rides along with it, and the
 * number is read as major units and multiplied. Anything that does not parse
 * cleanly returns nulls rather than a guess: a wrong amount recorded against a
 * paid seat is worse than no amount at all.
 */
const parseAmount = (raw: string | null): { minor: number | null; currency: string | null } => {
  if (!raw) return { minor: null, currency: null }

  const code = raw.match(/\b([A-Z]{3})\b/)?.[1] ?? null
  const symbol = Object.keys(SYMBOLS).find((s) => raw.includes(s))
  const currency = code ?? (symbol ? SYMBOLS[symbol]! : null)

  const digits = raw.replace(/[^\d.,-]/g, '').replace(/,/g, '')
  const value = Number.parseFloat(digits)
  if (!Number.isFinite(value) || value < 0) return { minor: null, currency }

  return { minor: Math.round(value * 100), currency }
}

/**
 * Read a sale out of a body nobody documented.
 *
 * Returns `null` when there is no email in it, which is the one thing that
 * makes a notification usable. Everything else is best-effort and recorded for
 * the log; none of it decides whether a seat is issued.
 */
export const parseSaleEvent = (payload: unknown): SaleEvent | null => {
  const flat = flatten(payload)

  // Qualified names first, bare `email` last. A payload carrying both a buyer
  // and an affiliate has two of these, and the specific one is the answer.
  const email = field(flat, 'customerEmail', 'buyerEmail', 'customersEmail', 'userEmail', 'email')
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null

  const amount = parseAmount(
    field(flat, 'amount', 'amountPaid', 'total', 'totalAmount', 'price', 'value', 'grossAmount'),
  )

  const product = field(
    flat,
    'productCode',
    'productName',
    'productsName',
    'productsCode',
    'product',
    'productUrl',
    'productLink',
  )

  // `name` is last in the list below and generic enough to have picked up the
  // product's, which is worth catching: a buyer called "6-Week Recomp
  // Challenge" in `unmatchedSales` sends whoever is fixing it by hand looking
  // for the wrong person.
  const named = field(flat, 'fullName', 'customerName', 'customerFullName', 'buyerName', 'name')

  return {
    email: email.toLowerCase(),
    fullName: named === product ? null : named,
    reference: field(flat, 'dpfRef', 'dpfReference'),
    saleReference: field(
      flat,
      'purchaseCode',
      'saleCode',
      'orderCode',
      'reference',
      'transactionReference',
      'transactionId',
      'saleId',
      'orderId',
    ),
    amountMinor: amount.minor,
    currency: amount.currency ?? field(flat, 'currency', 'currencyCode'),
    product,
    paidAt: field(flat, 'paidAt', 'date', 'createdAt', 'transactionDate', 'purchaseDate'),
    channel: field(flat, 'channel', 'paymentMethod', 'paymentChannel', 'gateway'),
  }
}

/**
 * Whether the caller knows the shared secret.
 *
 * This is the whole of the authentication, and it is worth being clear about
 * what that means. Paystack signed its webhooks, so a body could be trusted to
 * have come from Paystack and could still be re-verified against the API
 * afterwards. Selar signs nothing and can be asked nothing, so a token we
 * generated and configured at both ends is the only thing standing between
 * this endpoint and anybody who can guess the URL. Make it long and random.
 *
 * Both sides are hashed before the comparison so that `timingSafeEqual` gets
 * two buffers of equal length — it throws on a length mismatch, and a thrown
 * comparison would leak the secret's length through the error path.
 */
export const isFromSelar = (secret: string, given: string | undefined) => {
  if (!secret || !given) return false
  const a = createHash('sha256').update(secret, 'utf8').digest()
  const b = createHash('sha256').update(given, 'utf8').digest()
  return timingSafeEqual(a, b)
}

/**
 * How the sale's amount compares to the advertised one, in words.
 *
 * Deliberately not a gate. Selar converts prices into the buyer's own currency
 * — a member paying from London pays in pounds, and the notification says so —
 * so a strict `amountMinor === PRICE_MINOR && currency === 'NGN'` check would
 * turn every international sale into a refused seat. The forged-webhook threat
 * this would have covered is covered by the shared secret instead, and what is
 * left is a bookkeeping question: did the buyer pay roughly what the page said?
 *
 * That question is answerable only when the currency matches, so anything else
 * is reported as unchecked rather than as a pass.
 */
export const describeAmount = (
  sale: SaleEvent,
  expectedMinor: number,
  expectedCurrency: string,
): { matches: boolean | null; note: string } => {
  if (sale.amountMinor === null || !sale.currency) {
    return { matches: null, note: 'no amount on the notification' }
  }
  if (sale.currency.toUpperCase() !== expectedCurrency.toUpperCase()) {
    return {
      matches: null,
      note: `paid ${sale.amountMinor / 100} ${sale.currency}, priced in ${expectedCurrency}`,
    }
  }
  return {
    matches: sale.amountMinor >= expectedMinor,
    note: `paid ${sale.amountMinor / 100} ${sale.currency}, expected ${expectedMinor / 100} ${expectedCurrency}`,
  }
}
