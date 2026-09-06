# DP Fitness · public landing site

The page people arrive on. One route, thirteen sections, built from the Figma
composition
[`DP Fitness · Landing Page`](https://www.figma.com/design/B931SXWG53I3zKWa2MS9pY/DP-Fitness?node-id=444-2)
(desktop frame `448:2`, with tablet and mobile artboards alongside it).

```bash
bun install                       # from the repo root
cp apps/web/.env.example apps/web/.env
bun run dev:web                   # http://localhost:3001
```

Everything on the page renders without a `.env`. The one thing that does not is
the registration form, which needs a Firebase service account to issue an access
code — see [Registration](#registration) below.

## How it is put together

```
app/data/landing.ts          every word on the page, and the types around them
        ↓
app/components/landing/      one component per section, plus three shared pieces
        ↓
app/pages/index.vue          nothing but the order of the sections
```

The same split the member app makes between `data/` and `components/`: the
components own layout and behaviour, `data/landing.ts` owns the copy. A price
change is one edit, and the three places the price appears cannot drift apart.

`PageContainer`, `CtaButton` and `BrandMark` are the only shared pieces. Every
other component is a section, named for what it says rather than where it sits,
so re-ordering the argument is a matter of moving a line in `index.vue`.

## Registration and payment

One section on this page does more than render copy. Registering is three
things: the form, a Paystack checkout, and an access code that arrives by email.

```
RegisterSection.vue              validates, POSTs, then leaves for Paystack
        ↓
POST /api/register               writes registrations/{reference}, pending
        ↓                        initialises Paystack, returns a checkout URL
   [ Paystack checkout ]
        ↓
pages/registration/complete.vue  ← callback_url, carrying ?reference=
        ↓
POST /api/payment/verify   ─┐
POST /api/payment/webhook  ─┴→   utils/fulfilment.ts
                                   mints accessCodes/{CODE}
                                   marks the registration paid
                                   emails the code via Brevo
```

**No money, no code.** The form issues nothing. `/api/register` records the
attempt and hands back a checkout URL; the code is minted only after Paystack
has been asked directly whether the money moved. An earlier version issued a
live code the moment the form was submitted, which meant anyone who filled it in
and walked away held a seat.

**The price is one number.** `PRICE_MINOR` in `app/data/landing.ts` is kobo, and
the `₦30,000` on the page is derived from it. The server imports the same
constant, so the amount charged cannot drift from the amount advertised, and
nothing about the price reaches the route from the browser.

**Two things confirm a payment, because a browser is not a witness.** The
callback fires when the buyer's browser comes back; the webhook fires
server-to-server and covers the buyer who paid and closed the tab. In the normal
case both run, which is why fulfilment is idempotent: it turns on
`registrations/{reference}.code` being `null`, set inside a transaction, so
whichever arrives second finds a code already there and stops. **The webhook is
not optional in production** — without it, a closed tab means somebody is
charged and never gets a code.

**A reference is not a receipt.** It arrives in a query string where anyone can
type one, so `/api/payment/verify` asks Paystack, and re-checks the amount and
currency: a transaction can be `success` at Paystack for the wrong sum. The
webhook verifies too, even though its signature already proved the sender, which
removes replay from the threat model.

**The webhook is signed with the Paystack secret key** — HMAC-SHA512 of the raw
body, compared in constant time. Raw, not re-serialised: changing key order or
whitespace changes the digest, which is the usual way a webhook verifier ends up
rejecting every legitimate call.

**Email is the only way the code reaches anyone.** It is never rendered and never
returned by any route. The confirmation page says the slot is reserved and to
check the inbox, then takes itself back to the site after eight seconds — with a
real link alongside, so it is never a dead end.

**`nuxt generate` will not work.** Prerendering `/` is fine, but a fully static
export has no handler behind `/api/*`, and registration would 404 on submit.

## Decisions worth knowing

**Prerendered, not client-rendered.** The opposite of the PWA's call, for the
opposite reason: every word here is known at build time and the page's whole job
is to be found and read by someone who has never heard of DP Fitness. `nitro.prerender`
crawls in-page links, so adding a route to `pages/` is enough to get it rendered
to static HTML.

**Pinned to the light palette.** `data-theme="light"` is set on `<html>` in
`nuxt.config.ts`. This is one authored composition — a warm paper page with two
deliberately dark panels — rather than a surface someone lives in, so it does not
follow the visitor's OS the way the member app does.

**Its own tokens are few and named.** Almost everything comes from
`@dpfit/theme`. What the marketing composition genuinely adds — the paper page,
the near-black panels, the heavier rules, the marketing type scale — is declared
at the top of `app/assets/styles/main.css` with a note on why each one is not
just the app's equivalent.

**The FAQ is `<details>`.** Keyboard-operable, announced as expandable, findable
with the browser's own find-in-page, and open-able with JavaScript off. The only
thing written by hand is the rotation of the `+`.

## What is not finished

- **Registration stops after step one.** The card collects and validates "About
  you", issues the access code and emails it, then emits the answers; "Your
  stats" and "Personalise" are designed in the same Figma file as separate pages
  and are not built. Nothing on the page listens to that emit yet. When those
  steps arrive they will need a handle back to the registration — and it must
  not be the access code, which is the one thing deliberately kept out of the
  browser.
- **The code is live before anyone has paid.** `POST /api/register` issues a
  redeemable code the moment the form is filled in, and there is no payment
  provider anywhere in this repository to gate it on — the section's own caption
  says "Nothing is charged yet". Binding the code to `issuedToEmail` limits it
  to the person who registered, so a forwarded code is refused, but somebody who
  registers and never pays still holds a seat. Whatever takes payment is where
  that closes; the note is repeated at the top of `register.post.ts`.
- **Nothing reconciles abandoned checkouts.** A buyer who opens Paystack and
  leaves is stuck at `paymentStatus: 'pending'` forever. Harmless, but the
  collection accumulates them, and nobody is reminded to come back.
- **A paid seat whose email failed is only findable by query.** `fulfilment.ts`
  records `emailed: false` and logs loudly, but nothing retries and nothing
  alerts. The query is `registrations` where `paymentStatus == 'paid'` and
  `emailed == false`, and it needs a composite index to run.
- **Refunds are manual.** `RegistrationPaymentStatus` has a `refunded` value and
  nothing ever sets it; Paystack's `refund.processed` webhook event is not
  handled, and revoking the access code that went with it is a console job.
- **The refund answer is placeholder copy.** The Figma frame draws the FAQ
  collapsed, so it carries the questions but no answers. Every other answer is
  written from what the page already commits to; the refund one needs the real
  policy. It is flagged as `REFUND_ANSWER_IS_PLACEHOLDER` in `data/landing.ts`.
- **The hero's start date is hard-coded** ("starts 12 August"), as it is in the
  design. It will need to come from wherever cohorts are defined.
