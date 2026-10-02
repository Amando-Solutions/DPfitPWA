# DP Fitness · public landing site

The page people arrive on. One route, built from the "Body Recomp Challenge"
design reference: a lavender paper page in Manrope with Instrument Serif
italics, a plum countdown strip, and a rounded plum footer.

```bash
bun install                       # from the repo root
cp apps/web/.env.example apps/web/.env
bun run dev:web                   # http://localhost:3001
```

Everything on the page renders without a `.env`. The one thing that does not is
the registration form, which needs a Firebase service account to issue an access
code — see [Registration](#registration-and-payment) below.

## How it is put together

```
app/data/landing.ts              every word on the page that is not per-cohort
app/composables/useCohortLabels  the cohort's dates and price, worded for the page
        ↓
app/components/landing/          one component per section
        ↓
app/pages/index.vue              the order of the sections, and the cohort fetch
```

Sections, top to bottom: `CountdownBar`, `SiteHeader`, `HeroSection`,
`CohortBanner`, `ResultsSection`, `ManifestoSection`, `IncludedSection`,
`WeeksSection`, `FitSection`, `CoachSection`, `RegisterSection` (`#join`),
`FaqSection`, `SiteFooter`, and the phone-only `MobileCta`.

What comes from the active cohort (`/api/challenge`): the countdown target
(pre-order open/close, then the cohort's `startsAt`), duration, start date,
enrolment close, price and per-week price, and the week cards (the published
program's weeks; the design's six focuses only when it has none).

**Placeholders.** The design ships with bracketed client results, an
early-bird offer and a `[Selar logo]` chip. They are rendered as designed and
live in `data/landing.ts` under `PLACEHOLDER` comments — swap the copy there.

**Photos.** The hero banner, the coach portrait, the before / after pairs and
the app screenshots are served from `public/landing/` at web sizes, cut down
from the masters (`hero-coach-original.png`, `meet-the-coach-original.jpg`,
`public/before-and-after-images/`, `public/app-mock/`). The banner is 1800 wide
and the portrait 1080×1440. Each result photo is 352×640, cropped around the
subject to fit the card's slot, and each app screenshot is 440×1068 with the
capture's pale edge trimmed, so a new one needs the same treatment rather than
the raw upload.

The palette is declared once at the top of `app/assets/styles/main.css` as
`--lp-*` tokens (Tailwind colours `lp-paper`, `lp-ink`, `lp-accent`, the
`lp-lilac-*` ramp, …), alongside the interaction recipes from the design
(`lp-ul`, `lp-lift`, the marquee, scroll reveals).

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
   polls GET /api/payment/status │     asks apps/functions for a code │
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

**The offer comes from Firestore first.** The active cohort's `registration` map holds
`amountMinor`, `currency` and `codeTtlDays`. The checkout URL remains in
`NUXT_SELAR_PRODUCT_URL`. Missing fields fall back independently to
`NUXT_PUBLIC_PRICE`, `NUXT_PUBLIC_PRICE_CURRENCY` and
`NUXT_REGISTRATION_CODE_TTL_DAYS`. No hardcoded business values are used. Selar's dashboard
still controls the charge, so keep it aligned. Registration snapshots the cohort,
price and code lifetime; the webhook uses those saved values even after a cohort
switch. A same-currency underpayment is recorded for manual review, without issuing
a code. Cross-currency payments retain the existing Selar conversion handling.

**Sales happen in a pre-order.** The form only sells between the cohort's
`registration.preorderStartsAt` and `preorderEndsAt`. A sale in that window is
fulfilled up to the email: the code is minted and saved with `codeHeld: true`,
and the buyer gets `server/emails/slot-reserved.ts` instead of the code. When the
window closes, `POST /api/preorder/release` (called hourly by
`releasePreorderCodes` in `apps/functions`, bearer `NUXT_PREORDER_RELEASE_SECRET`)
sends each held code. It reads the window fresh every run, so moving the end
moves the release. A held code that was revoked or redeemed in the meantime is
not sent, and one whose email fails three times joins the `emailed == false`
queue. Closing the Selar product when the pre-order ends is done by hand.

**The confirmation page waits rather than knows.** Selar redirects to a fixed
URL with nothing appended, so the page identifies the buyer from the `dpf_ref`
cookie and polls `/api/payment/status` for up to a minute. It never says a
payment failed — it cannot know that, and the person reading it has usually
just been charged. If the wait runs out it says the code is still on its way.

**Email is the only way the code reaches anyone.** It is never rendered and never
returned by any route. The confirmation page says the slot is reserved and to
check the inbox, then takes itself back to the site after eight seconds — with a
real link alongside, so it is never a dead end.

**`nuxt generate` will not work.** The page needs current Firestore data. A fully static
export has no handler behind `/api/*`, and registration would 404 on submit.

## Decisions worth knowing

**Rendered from Firestore on each request.** `/api/challenge` queries for exactly
one `status: active` cohort, falling back to `NUXT_REGISTRATION_COHORT_ID` only
when none exists, and exposes only public metadata: name, dates in its
own timezone, duration, linked published program, week outline, guide descriptions
and price. Workout prescriptions, guide bodies and member details remain private.
The page also refreshes every minute and when a tab becomes visible. No active
cohort or fallback document, ambiguous active cohorts or a failed read clear
availability. Offer fields missing from both Firestore and the environment disable checkout. See [Firestore setup](../../FIREBASE.md#active-cohort-and-registration).

**Pinned to the light palette.** `data-theme="light"` is set on `<html>` in
`nuxt.config.ts`. This is one authored composition, so it does not follow the
visitor's OS the way the member app does.

**The FAQ is `<details>`.** Keyboard-operable, announced as expandable, findable
with the browser's own find-in-page, and open-able with JavaScript off. Each
entry has an id, so `#faq-refund` (the footer's "refund policy") opens it.

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
