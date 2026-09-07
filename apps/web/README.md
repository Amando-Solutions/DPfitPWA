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

`PageContainer` and `CtaButton` are the only shared pieces in this app, and
`BrandLogo` comes from the design-system layer rather than from here — the mark
is authored once in `packages/theme` and both apps import it. Every other
component is a section, named for what it says rather than where it sits, so
re-ordering the argument is a matter of moving a line in `index.vue`.

## Registration and payment

One section on this page does more than render copy. Registering is three
things: the form, a Selar checkout, and an access code that arrives by email.

```
RegisterSection.vue              validates, POSTs, then leaves for Selar
        ↓
POST /api/register               writes registrations/{reference}, pending
        ↓                        sets the dpf_ref cookie
        ↓                        returns a pre-filled Selar checkout URL
   [ Selar checkout ]
        ↓                        ┌────────────────────────────────────┐
        ↓                        │ POST /api/payment/webhook          │
pages/registration/complete.vue  │   utils/fulfilment.ts              │
   polls GET /api/payment/status │     mints accessCodes/{CODE}       │
   until a code exists           │     marks the registration paid    │
                                 │     emails the code via Brevo      │
                                 └────────────────────────────────────┘
```

The two columns are independent: the browser's return tells us nothing, and the
sale notification is what issues the seat. That is not a design preference, it
is what Selar leaves us with.

**Selar is a storefront, not a payments API.** There is no call that starts a
transaction and none that asks whether one was paid. The product is created once
in the Selar dashboard, carries its own price, and is sold from a hosted page;
`/api/register` only pre-fills that page (`?add_to_cart=1&email=…`) and sends
the browser to it. Everything below follows from that.

**No money, no code.** The form issues nothing. An earlier version issued a live
code the moment the form was submitted, which meant anyone who filled it in and
walked away held a seat. What confirms the money now is the sale notification,
and nothing else.

**The webhook is the whole mechanism, not a backstop.** Under Paystack the
browser callback could fulfil on its own, and the webhook covered the buyer who
closed the tab. Here there is only one path: if `/api/payment/webhook` is not
wired up in Selar, every buyer pays and receives nothing. Fulfilment is still
idempotent — it turns on `registrations/{reference}.code` being `null`, set
inside a transaction — because notifications are retried and replayed by hand.

**A shared secret is all the authentication there is.** Selar signs nothing, so
`X-Selar-Token` is compared against `NUXT_SELAR_WEBHOOK_SECRET` in constant
time and that is the end of it. There is no second check behind it: Paystack's
webhook could be re-verified against the API, and this one cannot. Anybody who
learns the token can mint free seats, so it wants to be long, random, and
rotated in both places at once.

**Sales are matched to registrations by email.** Selar has no field for our
reference — the checkout URL carries `dpf_ref` on the off chance it survives,
and it is read first, but the address is what actually does the work. A buyer
who edits their email on Selar's checkout form produces a sale that matches
nothing; rather than lose it, the webhook writes it to `unmatchedSales`, which
is a short queue of people who have paid and are owed a code by hand.

**The price is advertised here and charged there.** `PRICE_MINOR` in
`app/data/landing.ts` is kobo and the `₦30,000` on the page is derived from it,
but Selar's dashboard is what actually charges. The two are kept equal by hand.
A sale that comes in under the advertised amount *in the same currency* is
logged as a mismatch and issued anyway — and it is issued anyway because Selar
converts prices into the buyer's own currency, so a member paying from London
legitimately pays in pounds, and a strict check would refuse every
international sale.

**The confirmation page waits rather than knows.** Selar redirects to a fixed
URL with nothing appended, so the page identifies the buyer from the `dpf_ref`
cookie and polls `/api/payment/status` for up to a minute. It never says a
payment failed — it cannot know that, and the person reading it has usually
just been charged. If the wait runs out it says the code is still on its way.

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
- **Nothing reconciles abandoned checkouts.** A buyer who opens Selar and
  leaves is stuck at `paymentStatus: 'pending'` forever. Harmless, but the
  collection accumulates them, and nobody is reminded to come back.
- **A missed notification is invisible.** Selar cannot be asked what it sold, so
  a Zap that was switched off, or a webhook that failed every retry, looks
  exactly like nobody buying. The only symptom is a buyer getting in touch. A
  weekly eyeball over Selar's own sales list against `registrations` where
  `paymentStatus == 'paid'` is the whole reconciliation story.
- **`unmatchedSales` has no screen.** It is written and nothing reads it. Until
  something does, it is a Firestore console job.
- **A paid seat whose email failed is only findable by query.** `fulfilment.ts`
  records `emailed: false` and logs loudly, but nothing retries and nothing
  alerts. The query is `registrations` where `paymentStatus == 'paid'` and
  `emailed == false`, and it needs a composite index to run.
- **Refunds are manual.** `RegistrationPaymentStatus` has a `refunded` value and
  nothing ever sets it. Selar has no refund notification to subscribe to, so
  both marking the registration and revoking the access code are console jobs.
- **The refund answer is placeholder copy.** The Figma frame draws the FAQ
  collapsed, so it carries the questions but no answers. Every other answer is
  written from what the page already commits to; the refund one needs the real
  policy. It is flagged as `REFUND_ANSWER_IS_PLACEHOLDER` in `data/landing.ts`.
- **The hero's start date is hard-coded** ("starts 12 August"), as it is in the
  design. It will need to come from wherever cohorts are defined.
