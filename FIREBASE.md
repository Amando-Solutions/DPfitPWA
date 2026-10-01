# Firebase backend

The app talks to Firestore, Auth and Cloud Storage directly from the browser.
There is no server of ours in the path, which makes `firestore.rules` and
`storage.rules` the actual access-control policy rather than documentation of
one. Read them before changing anything in `app/lib/datasource/firestore.ts`.

## Layout

| Path | What it holds |
| --- | --- |
| `accessCodes/{code}` | One seat. Keyed by the code, so redemption is a single `getDoc` and uniqueness is the database's problem, not a query's. |
| `registrations/{reference}` | One attempt to buy a seat: the form's answers plus the payment. Keyed by a reference the landing site generates before sending the buyer to Selar, because the document exists before the code does — `code` is `null` until money moves. Coach-readable; every client write is denied, since the only writer is the landing site's Admin SDK routes. |
| `unmatchedSales/{id}` | A Selar sale that matched no registration — usually a buyer who changed their email address at checkout. Money received, nothing issued, and a queue for whoever fixes it by hand. Same rule shape as `registrations`. |
| `cohorts/{cohortId}` | The cohort, with the coach denormalised onto it. Also whether the leaderboard is on. Live calls are in `liveCalls`. |
| `cohorts/{id}/notifications/{id}` | Coach-authored inbox lines. |
| `cohorts/{id}/announcements/{id}` | The card deck behind the inbox. Longer-form, and carries a call to action. |
| `cohorts/{id}/leaderboard/{uid}` | Name, avatar, qualifying-session count. A projection — see below. |
| `cohorts/{id}/threads/{threadId}/messages/{id}` | `cohort` is the group thread; every other `threadId` is a member uid, meaning that member's private thread with the coach. |
| `…/messages/{id}/reactions/{uid}` | Who reacted, one document per reactor. The message also carries `reactors` (uid → name and time, author excluded) and `reactedAt`, which is what the author's inbox reads. |
| `programs/{programId}` | Authored plan, versioned. Carries `qualifyingSetPercent` and the whole reward economy — the badge ladder, the rank ladder and every point value. |
| `programs/{id}/weeks/{weekId}` | One week of the block: its number, title and dates. `week-1`, `week-2`, … — see **The schedule**. |
| `programs/{id}/weeks/{weekId}/days/{dayId}` | One training day in that week, with the date it falls on. |
| `programs/{id}/guides/{guideId}` | The guide library. |
| `members/{uid}` | The member. Keyed by the Firebase Auth uid, so rules are `request.auth.uid == uid` with no lookup. `region` is written only by `setRegion` — see **Days and regions**. |
| `members/{uid}/sessions/{id}` | Workout logs. Written only by `logSession`. |
| `members/{uid}/state/activeSession` | The workout in progress. A fixed id, because there is only ever one. |
| `members/{uid}/checkIns/week-{n}` | One per week, enforced by the key. Written only by `submitCheckIn`. |
| `members/{uid}/photos/{id}` | Progress photos. Filed only by `logPhoto`; the member may delete one. |
| `members/{uid}/badges/{badgeId}` | Awards, keyed so a double-award is a no-op. |
| `members/{uid}/notificationState/{id}` | Read markers. Present means read. |
| `members/{uid}/pushDevices/{id}` | One browser the inbox is pushed to: its FCM token and the sign-in that registered it. See **Push notifications**. |
| `members/{uid}/lifecycleEvents/{id}` | Append-only status history. |
| `signIns/{uid}` | The account's latest sign-in, which is the one device it is signed in on. See **One device at a time**. |

## Active cohort and registration

The website selects exactly one `cohorts` document with `status: "active"`.
If none exists, `NUXT_REGISTRATION_COHORT_ID` is used to read a real,
non-archived cohort document (draft cohorts can be sold before launch). An active
Firestore cohort always wins. Missing fallback documents close registration;
multiple active cohorts remain an error. Read failures do not trigger fallback. The member PWA uses `members/{uid}.cohortId` from
Firestore, preserving paid membership rather than moving someone to another cohort.
Its initial read and live listener both hide missing/inactive cohort metadata.

**When a cohort is over.** A cohort is over when it is `archived`, or when
the day its `endDate` falls on, in its `timezone`, has passed. It runs to the
end of that day, the same way `startDate` names the day training opens. A member
of a cohort that is over gets `/cohort-ended` and nothing else, and every write
is refused three times. The app's data source refuses before anything is sent
(`refuseWritesWhen`). The member functions refuse with `cohort-ended`.
`firestore.rules` refuses everything else through `cohortRunning`: messages,
reactions, typing, board rows, the member document and everything under it.
`storage.rules` restates it for uploads and deletes, on the production bucket.
The rules matter most for a message queued offline before the end and replayed
after it. Reads, sign-out, releasing a push device and clearing a typing marker
stay open. Nothing more is pushed to the cohort's members, and no more live-call
reminders go out to it. Both signals are watched, so an open app changes screen when either
lands. The admin contract is in
[ADMIN_NOTIFICATIONS.md → Closing a cohort](ADMIN_NOTIFICATIONS.md#closing-a-cohort).

The cohort must contain `name`, `startDate` and `endDate` (Firestore timestamps),
`durationWeeks`, `timezone` (IANA), `programId`, and `programVersion`. Its program
must exist, be published and match that version to open registration. The website
reads the program name, week outline and guide metadata from the same documents
the PWA uses; private guide bodies and workout prescriptions are not public.

Set this map on the active cohort using the actual offer (values below are examples):

```js
registration: {
  amountMinor: 3000000, // ₦30,000 in kobo
  currency: 'NGN',
  codeTtlDays: 30, // integer, 1–365
  preorderStartsAt: Timestamp, // seats are sold only between these two
  preorderEndsAt: Timestamp,   // on or before `startDate`
}
```

**The pre-order.** The landing site sells seats only between `preorderStartsAt`
and `preorderEndsAt`. A sale inside the window has its code minted and held
(`registrations/{ref}.codeHeld`), and the buyer gets a "slot reserved" email.
When the window ends, the hourly `releasePreorderCodes` function calls the
landing site's `POST /api/preorder/release`, which asks `createAccessCode` for
each held code again (extending its expiry to `codeTtlDays` from then) and
emails it. From then until the cohort's `startDate` is the login window: members
can sign in, set up their profile, chat and take their first photo, and the
member app logs no sessions or check-ins. Every date can be moved at any time;
nothing is scheduled against them, and each read takes them as they stand.
Moving `startDate` means moving the program's dated weeks and days with it.

Each missing/null/empty offer field falls back independently to the environment:

| Firestore value | Temporary environment fallback |
| --- | --- |
| Active cohort document | `NUXT_REGISTRATION_COHORT_ID` (only when none is active) |
| `registration.amountMinor` | `NUXT_PUBLIC_PRICE` (major units, converted using the resolved currency) |
| `registration.currency` | `NUXT_PUBLIC_PRICE_CURRENCY` |
| `registration.codeTtlDays` | `NUXT_REGISTRATION_CODE_TTL_DAYS` |
| `registration.preorderStartsAt` | `NUXT_REGISTRATION_PREORDER_STARTS_AT` (ISO 8601) |
| `registration.preorderEndsAt` | `NUXT_REGISTRATION_PREORDER_ENDS_AT` (ISO 8601) |

There are no hardcoded cohort or offer defaults. Existing, non-empty Firestore
values win; invalid authored values do not get hidden behind fallbacks. If neither
source provides a valid offer, details remain visible but checkout is disabled. Selar controls the actual
charge; keep the product's dashboard price aligned with this Firestore offer.
`NUXT_SELAR_PRODUCT_URL` remains the checkout destination. Firebase connection
settings, credentials and integration secrets also belong in
environment variables; they identify/authenticate the database, not its content.

Run `bun run --filter dp-fitness-web check:cohort` for a read-only check of the
resolved cohort and offer using the configured database and fallbacks.

The page is rendered per request and refreshes open tabs every minute. Checkout
re-reads Firestore and rejects an old cohort/price with HTTP 409. It snapshots
`cohortId`, `cohortName`, `amountMinor`, `currency` and `codeTtlDays`
onto the registration. Webhooks validate the saved price and issue
against that saved cohort, never the active cohort at payment time. Archived
purchases still target the original cohort, but issuance is refused by the existing
Cloud Function until an operator resolves them. Older registrations without a code
lifetime read it from their own cohort's registration map, then the environment
fallback; without either they require manual repair. They are never assigned to a new cohort automatically.

The runtime PWA always uses Firestore. The old mock and HTTP implementations remain
as isolated development fixtures; neither is selected by environment variables or
used as a fallback. An incomplete Firebase configuration is an error.

## Three decisions worth knowing about

**Nothing a member sees is compiled into the app.** The plan, the guide library,
the week themes, the badge and rank ladders, the qualifying threshold, the live
call, the announcement deck — all of it is read from the documents above, per
cohort, on every load. It used to be `import`ed out of `app/data/program.ts`,
which meant every cohort on every deploy was shown the same six weeks of the
same four sessions and the same live-call link, whatever the coach had actually
set up, and re-tuning any of it was a release. That file is now two things and
neither is content the app serves: isolated local development fixtures
(`lib/datasource/local.ts` is the only app module allowed to import it), and the
input to the seed script.

The cost is that the documents have to exist. A program with no `weeks` renders
a Home screen with no session on it, which is the honest answer and not a bug —
see **Seeding**.

**The leaderboard reads a projection, not `members`.** A member document holds
an email address, body weight, injuries and allergies. The board renders a name,
a face and a number. Answering it from `members` would mean granting every
member read access to all of the former in order to show the latter, so
`cohorts/{id}/leaderboard` carries only the three fields the board actually
uses, written alongside `stats` on the same code paths.

**Counters are incremented, never recounted.** `MemberStats` exists so the board
is one ordered query instead of a read of every member's entire history. Every
write that changes a count updates it in the same batch as the document it
summarises, so the two cannot disagree. `streakWeeks` is the exception: it stays
a pure derivation in `lib/domain/rewards`, because a consecutive-week walk has
no incremental form and a second implementation of it would drift.

## The trust boundary

Rules validate ownership, shape and transitions. They cannot re-derive a value
from data they do not have — nothing in `firestore.rules` can check that a
session's `setsDone` matches the sets actually logged. So `qualifies`, and the
reward points that follow from it, is asserted by the client and only
shape-checked server-side.

**A determined member can inflate their own totals.** The exposure is bounded to
their own leaderboard position and badge unlocks; they cannot touch anyone
else's data, read another member's profile, or claim a code that isn't theirs.

Sessions, check-ins and progress photos have already moved: they are filed on a
day or a week, and a day read off the phone could be moved by the phone's owner.
`logSession`, `submitCheckIn` and `logPhoto` write them now, and the rules deny
those paths to clients — see [Days and regions](#days-and-regions). Closing the
rest means the same for what is left:

- `redeemAccessCode`
- `awardBadge`
- the member's own `stats`, which the member update rule does not lock

## Answered once, at setup

`profile.displayName` and `profile.heightCm` are asked for in setup and fixed
from the moment it finishes. The profile screen shows them as text rather than
fields, but that is presentation: the lock is the `members` update rule, which
refuses a change to either unless the document is still `onboarding`.

Three other rules exist to keep that from being worked around, and none of them
is optional:

- **`status` may only go `onboarding` → `active`.** Writing `onboarding` back
  would otherwise reopen both fields.
- **A member cannot delete their own member document.** They could redeem their
  code again — `redeemAccessCode` rebuilds a missing document for the uid that
  already holds the seat — and the rebuild lands in `onboarding`. That is why
  `reset()` no longer deletes anything; erasure is an Admin SDK job.
- **Every copy of the name is checked against the profile.** The leaderboard
  row, a chat message's `authorName` and a typing marker each carry one, and a
  copy the caller chose freely is a rename by another route. The rule derives
  the expected value with `shownName`, matching the client's
  `displayName || fallback` exactly — change one and you must change the other.

The leaderboard row is read with `getAfter`, because redemption writes it in the
same transaction that creates the member document, and it may also keep the name
it already holds: `logSession` merges only the count.

**The one exception is the region.** `members/{uid}.region` is asked at setup
(its own step, after About you) and stays editable from Profile, because members
travel: somebody based in the US flying home to Lagos for a cohort has to be able
to move their days before the trip. It is still locked against the client — the
create and update rules refuse the field — because only `setRegion` may write it.
See below.

## Days and regions

Two clocks, and neither is the phone's.

| | Zone | Decides |
| --- | --- | --- |
| **The Cohort Clock** | `cohorts/{id}.timezone` (`Africa/Lagos`, WAT) | Which week it is, for everybody at once. The `weekNumber` on every session, check-in and photo; the week label; guide unlocks; the check-in's week. |
| **The member's day** | `members/{uid}.region.timezone` (the cohort's zone until they pick one) | Which training days are open. A day opens at midnight *there*, stays open until it is logged, and is locked once logged. The finisher's once-a-day rule counts on it too, and so does "before the cohort starts". |

The time is the server's in both: the functions use their own clock, and the app
uses the network-corrected one in `lib/time.ts` to draw the same answers. No day
is ever read with `getDate()` or the device's zone — a Cloud Function runs in
UTC, and a phone's zone is its owner's to change. `dateKeyIn` always takes a zone
by name.

### The region

```ts
region: {
  id: 'west-africa' | 'uk-ireland' | 'us-eastern' | 'us-central'
    | 'us-pacific' | 'other-africa' | 'europe' | 'other'
  timezone: string     // IANA, e.g. America/New_York — not the label, so DST just works
  since: Timestamp     // when it took effect, the server's time
  floor: string | null // YYYY-MM-DD: the member's day when they switched, under the old zone
}
```

The list is in two places that must agree: `REGIONS` in
`apps/functions/src/regions.ts` (what `setRegion` accepts) and in
`apps/pwa/app/lib/domain/region.ts` (what the picker shows). The five specific
options carry their zone. Other Africa, Europe and Other are too broad for one,
so the member picks a zone from that area and that zone is stored.

**A change is forward-only.** Nothing already logged is re-read: every session
carries `dayKey`, the member's day it was logged on, fixed at write. And the day
the member is in when they switch becomes the `floor`, below which their day
never reads again. So at 1 AM Tuesday in Lagos, switching to New York (8 PM
Monday) keeps them on Tuesday until New York reaches it — Monday cannot be
reopened, and flipping back and forth only ever moves the day forward. Switching
east applies at once. `apps/functions/tests/day-lock.test.ts` walks through these.

### The functions

All four are callables in `africa-south1`, called by the member app with its own
ID token, and each takes `database` like `createAccessCode`. Each checks the same
standing the rules' `signedIn()` does — the latest sign-in, the membership's
email, a trusted sign-in — because a function bypasses the rules.

| Function | Writes | Refuses |
| --- | --- | --- |
| `setRegion` | `members/{uid}.region`, with the floor | an id or zone not on the list |
| `logSession` | `members/{uid}/sessions/{id}`, the stats and the leaderboard row | a day before the cohort starts, not yet open on the member's calendar, or already logged; a second finisher on one member day |
| `submitCheckIn` | `members/{uid}/checkIns/week-{n}`, on the Cohort Clock's week | before the cohort starts; a second for the week |
| `logPhoto` | `members/{uid}/photos/{id}`, dated and on the Cohort Clock's week | a second photo before the cohort starts |

All four also refuse a member whose cohort is over, with `failed-precondition`
and `reason: 'cohort-ended'`. See **When a cohort is over**.

Session ids are stable — `w{planWeek}-{dayId}`, or `{dayKey}-{dayId}` for the
finisher — so two finishes of the same day racing cannot both land. Sessions from
before have random ids and are found by query.

Around a week's turn the two clocks can disagree for a few hours, on purpose. At
8 PM Sunday in New York the Cohort Clock is in Monday's week, so a session logged
then is filed under the new week while it catches up a day of the old one. In
Nairobi the member's Monday opens two hours before Lagos reaches it. The app's
plan follows the member's day (`store.currentWeek`); the label and the filing
follow the Cohort Clock (`store.clock`).

### What is shown in which zone

- **Live calls** are shown in the member's region, with the WAT slot beside it
  when the two differ. The call itself never moves.
- **Activity times** — a session in the exercise history, a progress photo, the
  "Logged" time on finishing — are shown in WAT and labelled "WAT", never
  converted. A converted date could name a day outside the week it is filed
  under.

## Indexes

`firestore.indexes.json` is JSON and cannot carry comments, so the reasoning
lives here.

- **`notifications` composite (`pinned` desc, `publishedAt` desc)** — pinned
  announcements sort above everything regardless of date. Two order-bys on one
  collection require a composite index; Firestore refuses the query without it.
- **`messages` composite (`addressedUids` array-contains, `sentAt` desc)** — the
  inbox's mentions and replies: cohort chat messages aimed at the member, newest
  first. Until it has built, that listener fails with `failed-precondition` and
  the inbox shows the coach's notifications only.
- **`messages` composite (`authorUid` asc, `reactedAt` desc)** — the inbox's
  reactions: the member's own messages others have reacted to, most recently
  reacted to first. Same failure mode: until it has built, the inbox has no
  reactions in it and nothing else is affected.
- **`sessions.exercises` unindexed** — a session log embeds every set of every
  exercise. Nothing queries inside that array, and indexing it costs an index
  write per element on every save.
- **`state.exercises` unindexed** — same, and worse: the in-flight session is
  rewritten every time a set is tapped.
- **`messages.reactionCounts` unindexed** — a map keyed by emoji, which grows
  without bound and is only ever read, never queried.
- **`messages.reactors` unindexed** — a map keyed by uid, so indexing it adds
  index entries for every member who reacts. The inbox queries `reactedAt`,
  never this.

Everything else the app queries (`completedAt`, `takenAt`, `weekNumber`,
`sentAt`, `sessions`) is a single-field sort that Firestore indexes
automatically.

## Deploying

```bash
npm i -g firebase-tools
firebase login
firebase use --add                     # pick the project

firebase deploy --only firestore:rules,firestore:indexes,storage
firebase deploy --only functions        # see "Deploying the function" first
```

Indexes build in the background; queries needing one fail until it is ready, and
the console shows progress.

## Two databases

The project holds `(default)` and `staging`. They are separate databases — not
namespaces — with their own documents **and their own rules**. Which one the
app talks to is `NUXT_PUBLIC_FIREBASE_DATABASE_ID`; empty means `(default)`.

Each has its own rules file, so the two can diverge without production being
loosened by accident:

| database | rules file |
|---|---|
| `(default)` | `firestore.rules` |
| `staging` | `firestore.staging.rules` |

They are identical today. Production already ran staging's `videoUrl` check
(see **The schedule**) before this file caught up with it on 2026-09-16, so
publish from whichever file the database names rather than assuming which is
ahead. `npm run rules:diff` shows any divergence.
When you change something that should apply to both, change it in both; the
diff is there to catch the half that gets forgotten.

Indexes are shared. A query needing a composite index in one database needs the
same one in the other, and nothing about an index is a security decision.

## Deploying the rules

`firestore.rules` and `storage.rules` are source files. They do nothing until
they are published to the project, and a Firestore created in production mode
starts with `allow read, write: if false` — which denies every read, including
a member reading their own document, with "Missing or insufficient
permissions". That failure looks exactly like a rules bug and is not one.

```bash
npm i -g firebase-tools     # once
firebase login              # once
firebase deploy --only firestore:rules,storage
```

`.firebaserc` names the project, so there is no `firebase use` step.

`.firebaserc` names the project, so there is no `firebase use` step, and
`firebase-tools` is a devDependency — `npx firebase`, or the scripts below.

### Deploying to one database

`--only firestore:<database>` matches the `database` key in `firebase.json` and
publishes that entry's rules *and* indexes:

```bash
npm run deploy:staging          # firebase deploy --only firestore:staging
firebase deploy --only "firestore:(default)"    # quote it — the shell eats the parens
```

The one to watch is `--only firestore:rules`. It reads like "rules only" and
means the opposite of narrowing: the CLI treats `rules` and `indexes` as
requests for *every* database, so it publishes to production too. Verified
against the CLI's own config resolver:

| `--only` | publishes to |
|---|---|
| *(omitted)* | `(default)` **and** `staging` |
| `firestore` | `(default)` **and** `staging` |
| `firestore:staging` | `staging` |
| `firestore:(default)` | `(default)` |
| `firestore:rules` | `(default)` **and** `staging` |
| `firestore:typo` | error, names the unmatched target |

A name that matches nothing is an error rather than a silent no-op, so a typo
cannot quietly deploy nothing and look like success.

To see what is actually live: Firebase console → Firestore Database → **Rules**,
which shows the published text and when it was last published. If that does not
match this repo, the deploy has not happened.

## Running against the emulator

Requires a JDK — the Firebase emulators are Java.

```bash
firebase emulators:start
```

Then point the app at it by calling `connectFirestoreEmulator`,
`connectAuthEmulator` and `connectStorageEmulator` from
`app/lib/firebase/app.ts`, guarded on `appEnv === 'development'`. Not wired up
yet.

## Enabling sign-in

An account is made from an access code and nothing else. The member enters the
code first — it is read before anyone is signed in, and must be real, unused and
in date — then an email and password, and the email must be the code's
`issuedToEmail`. The code is redeemed on the new account in the same tap.
Signing back in is the email and password, or Google. Google never makes an
account: one it has not seen is deleted again and sent to the code.

Nothing in either flow leaves the app, which is why it replaced the email link:
on iOS a link tapped in an email opens in Safari, never in the home-screen app
that asked for it.

Each provider has to be turned on in the console before the app can use it — a
provider that is merely coded for answers `auth/operation-not-allowed`, which
`authError` reports as "that sign-in method isn't available right now".

**Email and password**

1. Authentication → Sign-in method → **Email/Password**, enable it. **Email link
   (passwordless sign-in)** underneath can be left off; nothing uses it now.
2. Authentication → Settings → User actions: **Enable create (sign-up)** and
   **Enable delete** both ticked. Sign-up creates; a refused Google sign-in
   deletes the account Firebase made on the way through.
3. Members whose accounts were made with the old sign-in link have no password.
   **Forgot password?** on `/sign-in` sets their first one: the reset finishes
   on Firebase's own page and nothing has to come back to the app.

**Google**

4. Authentication → Sign-in method → **Google**, enable it, and set the
   project support email.
5. Nothing else. `signInWithGoogle` opens a popup, and falls back to a
   full-page redirect when the popup is blocked or cannot exist. The redirect
   finishes in `resumeSignIn`, which the store calls once per load *before*
   route middleware runs — a load returning from Google carries its credentials
   in the URL, and if they are not consumed first the middleware sees nobody
   signed in and bounces a member who just signed in back to the door.

A Google account and a password account with the same address are one account
when the address is Gmail: Firebase links them. For any other address Firebase
refuses the Google sign-in, and the member is told to use their password.

**Both**

6. Authentication → Settings → **Authorised domains**: add every domain the app
   is served from. Google does not complete from an unlisted origin, and the
   password-reset email's link back to `/sign-in` is refused; `localhost` is
   listed by default.

**The rules**

7. Deploy the app and the rules together — `firebase deploy --only
   firestore,storage` right after the app goes out. Each needs the other: the
   new app checks a code signed out, which the old rules refuse ("we couldn't
   check that code"), and the new rules require `joinedWith` on a new
   membership, which the old app does not write, so a code redeemed from a
   stale tab is refused until it reloads.
8. The first deploy of `storage.rules` asks to let Storage read Firestore.
   Accept it. Storage checks membership against `members/{uid}`, and without
   the permission every member upload is refused.

### What the rules hold a member to

An account is not a membership. Anybody can create one with a single request to
Firebase's sign-up API, using the public key in the app's JavaScript, without
an access code — so the rules never treat "signed in" as "paid". Every member
rule, in Firestore and in Storage, asks for all of:

- **A member document.** The program, its artwork, the cohort and chat are for
  members only, not for every account.
- **The email the membership was made with.** `members/{uid}.email` is fixed,
  and an account whose Firebase email no longer matches it is refused
  everything. The app has no email change, but the Auth API allows one; this
  makes it worthless. Anybody changing a member's email on the Admin SDK has to
  change the document too, or the member is locked out.
- **A sign-in the account trusts.** A Google sign-in needs Firebase to have
  verified the account's address — unless the membership predates
  `joinedWith`, whose absence marks one. Google can be linked to any account
  through the Auth API, and a password reset does not unlink it; this stops a
  linked Google account being a way back in. Firebase only takes Google's word
  for Gmail addresses, which is why older Google members are exempt: one who
  joined on a work address was never verified.

The staging bucket is the exception in Storage. Storage rules can only read the
`(default)` database, and staging's members live in `staging`, so the staging
bucket asks only that the caller is signed in.

### Recovering a seat

If somebody other than the buyer made the account with the buyer's code, the
account is still under the buyer's address. From the admin app, on the Admin
SDK:

1. If its Firebase email was changed, set it back to `members/{uid}.email`.
   Firebase also emails the old address a link to undo the change, which does
   the same.
2. Unlink any provider the buyer did not add:
   `updateUser(uid, { providersToUnlink: ['google.com'] })`.
3. Revoke sessions with `revokeRefreshTokens(uid)`.
4. The buyer uses **Forgot password?** on `/sign-in`.

On their own, a password reset and a new sign-in are enough when neither step 1
nor step 2 applies: the reset ends the other sessions, and the one-device rule
signs the other device out.

### `authDomain` and the installed app

`NUXT_PUBLIC_FIREBASE_AUTH_DOMAIN` is `<project>.firebaseapp.com` out of the
box, which is a *different* origin from wherever the app is actually served.
That is fine for the popup, which is the path virtually every session takes.

It is not fine for the redirect. The redirect leans on state stored against the
auth domain, and Safari's ITP plus Chrome's third-party storage partitioning
both treat that as cross-site — so the redirect is exactly the path that
degrades, and it is also the only path an installed iOS home-screen app can use
(there, `window.open` hands the URL to Safari, a separate app with no channel
back, so `mustRedirect()` sends it straight to the redirect).

The fix is to serve the auth helper from the app's own origin: set
`authDomain` to the domain the PWA is hosted on. Firebase Hosting already
serves `/__/auth/*` for the project from any of its domains, ahead of the
catch-all rewrite in `firebase.json`, so on a Firebase-hosted deploy this needs
no extra configuration — just the changed value and that domain in the
authorised list.

## One device at a time

A member is signed in on one device at a time. Signing in on a new device signs
out every other one.

`signIns/{uid}` holds the account's latest sign-in, identified by `auth_time`
from the ID token: the second that device signed in. Refreshing a token keeps
its `auth_time`, so it identifies the sign-in rather than the token, and the
rules can read it as `request.auth.token.auth_time`.

- **On every load**, `hydrate` calls `claimDevice` before reading anything
  else. If the stored sign-in is newer than this device's, the device signs
  out and the sign-in screen says why. Otherwise the device writes its own
  `auth_time`, unless it is already there.
- **While the app is open**, `watchDevice` listens to the same document and
  signs the device out as soon as another device claims the account.
- **In the rules**, `signedIn()` is true only when the caller's `auth_time`
  matches the stored one, and every member rule is built on it. A device that
  skipped the client code would still be refused. `isCoach()` and `isAdmin()`
  read the token alone, so the console never claims anything.

Signing out leaves the document alone. Clearing it would let a device that was
signed out while offline reconnect, find no claim, and take the account back.

What it costs, and where it stops:

- Every member request reads `signIns/{uid}` in the rules. That is one extra
  billed read per request, not per document returned.
- `auth_time` has one-second resolution. Two devices that sign in within the
  same second both hold the account until one of them signs in again.
- A device that is offline when it loses the account keeps working from its
  cache. When it reconnects, it is signed out and anything it logged in the
  meantime is refused.
- `storage.rules` does not check it. The app signs a superseded device out
  before it can upload, but an upload made with the SDK directly would still
  land. The document that points at the upload would be refused.

**Deploy the app before the rules.** The new app tolerates the old rules: a
claim the rules do not know about fails, is logged, and the load carries on.
The new rules do not tolerate the old app, which never claims, so every member
still on it is refused until the service worker picks up the new build. Members
already signed in on several devices keep the account on whichever signed in
most recently, and the others are signed out the next time they open the app.

## Push notifications

The inbox's three sources — coach notifications, mentions and replies in the
cohort chat, and reactions to a member's own messages — are also sent as phone
pushes to members who turn push on under Profile → Preferences &
Notifications.

**How it fits together**

- **Turning it on.** The switch calls `Notification.requestPermission()` inside
  the tap (Safari shows the prompt only from inside the tap). If the member says yes, the
  app gets an FCM token through its own service worker and writes
  `members/{uid}/pushDevices/{id}`, stamped with the sign-in's `auth_time`.
  Nothing new in the rules: everything under `members/{uid}` is already the
  member's own. `app/lib/push.ts` and `usePushNotifications` hold the client
  side.
- **Sending.** `pushNotification` and `pushMessage` in `apps/functions/src/push.ts`
  are Firestore triggers, with a `*Staging` pair on the staging database. They
  build the same lines the inbox draws and send them as data-only FCM
  messages.
- **Showing.** `apps/pwa/public/push-sw.js` is imported into the Workbox
  worker. It draws the notification and routes a tap to the inbox or the
  message. On Chromium it stays quiet while the app is in front. On Safari it
  never does, because WebKit revokes a subscription that receives pushes
  without showing them.
- **One device at a time.** A device is pushed to only while its `authTime`
  matches `signIns/{uid}`, so a phone that loses the account to a later
  sign-in goes quiet at once, and its document is deleted the next time
  anything is sent. Signing out deletes the document and ends the browser's
  subscription.
- **Housekeeping.** Tokens FCM reports as gone are deleted as they fail. The
  app rewrites its document when the token changes, and at least weekly while
  it's being opened.
- **Not for a cohort that is over.** Both triggers read the cohort and send
  nothing once it is archived or past its last day. The app opens on the ended
  screen, which has no inbox and no chat. The message trigger reads the cohort
  only when the write names, answers or is reacted to by somebody new, so a
  plain message costs no extra read.

**Setting it up (once per project)**

1. Console → Project settings → Cloud Messaging → Web Push certificates →
   **Generate key pair**. Put the public key in the PWA's
   `NUXT_PUBLIC_FIREBASE_VAPID_KEY` (see `.env.example`). The switch is hidden
   until it's set, and in mock mode.
2. If the web API key has application or API restrictions, allow the
   **Firebase Installations API** and the **FCM Registration API**, or turning
   push on fails with a 403 from `fcmregistrations.googleapis.com`.
3. Deploy the functions. The four push triggers go out with
   `createAccessCode` in the same codebase.

**Where it doesn't work**

- **iPhone and iPad** only from iOS 16.4, and only once the app is added to
  the Home Screen. In a Safari tab, the switch is replaced by a line pointing to
  the install steps.
- **`nuxt dev`** has no service worker, so turning push on fails there. Use
  `nuxt build` and `nuxt preview`.
- **Private coach threads** aren't pushed, matching the inbox, which doesn't
  list them either.

## Where access codes come from

One function: `createAccessCode`, a callable in `apps/functions`, in
`africa-south1` beside both databases. It is the only thing that writes
`accessCodes` — `firestore.rules` denies `create` to every client, a coach
included. There used to be two writers, and the admin console's wrote documents
the member app could not redeem.

**One code per call, issued to one person.** There are no anonymous codes and no
batches: every code carries the `issuedToEmail` that may redeem it.

```ts
// data
{
  database?:  '(default)' | 'staging',   // defaults to (default)
  cohortId:   string,
  expiryDays: number,                     // whole days, 1–365
  email:      string,                     // who may redeem it
  whatsapp?:  string,                     // copied into their profile
}
// result
{ code, reused, database, cohortId, cohortName, issuedToEmail, expiresAt }
```

Two callers, told apart in `apps/functions/src/callers.ts`:

| caller | authenticates with | audit trail names |
|---|---|---|
| the admin console | its Firebase ID token (the callable SDK sends it), carrying the `dpfitAdmin` claim | the admin |
| `api/payment/webhook` in `apps/web` | a Google-signed ID token for `REGISTRATION_SERVICE_ACCOUNT`, in `X-Service-Token` | `system:web-registration` |

The landing site's token cannot go in `Authorization`: a callable verifies that
header as a Firebase ID token and refuses anything else before the function
runs.

What the function settles so no caller has to:

- **The cohort is read, not trusted.** A cohort that is missing, `archived`, or
  has no `programId` is refused with `failed-precondition`, rather than turning
  into a seat that fails at redemption. `draft` is allowed.
- **`cohortName`, `programId` and `programVersion` come off the cohort.**
- **One live code per person per cohort.** If the email already holds an
  unused, unexpired code for that cohort, it comes back with `reused: true`
  instead of a second one. That is what makes Zapier replaying a sale safe, and
  it means a replacement for a live code starts with revoking it.

From the admin console:

```ts
const createAccessCode = httpsCallable(getFunctions(app, 'africa-south1'), 'createAccessCode')
const { data } = await createAccessCode({ database: 'staging', cohortId, expiryDays, email })
```

### Deploying the function

```bash
cp apps/functions/.env.example apps/functions/.env   # then set REGISTRATION_SERVICE_ACCOUNT
bun run deploy:functions
```

`REGISTRATION_SERVICE_ACCOUNT` is the `client_email` of the key in
`NUXT_FIREBASE_SERVICE_ACCOUNT`. Left unset, deploy asks for it. Cloud Functions
needs the Blaze plan.

`releasePreorderCodes` also needs `PREORDER_RELEASE_URLS` in the same `.env`
and a secret, set once before the first deploy that includes it:

```bash
firebase functions:secrets:set PREORDER_RELEASE_SECRET   # same value as NUXT_PREORDER_RELEASE_SECRET
```

It runs in `europe-west1`, because Cloud Scheduler has no `africa-south1`
location; it only makes an HTTPS call, so the region costs nothing.

**Order matters:** the function first, then `apps/web`, then the rules. The
landing site's old build writes codes itself, so the rules cannot go before it
is replaced — and they refuse the admin console's current direct write, so it
stops issuing codes until it calls the function.

The day-lock functions (`setRegion`, `logSession`, `submitCheckIn`, `logPhoto`)
go the same way: **functions, then the member app, then the rules.** The new app
build cannot log anything until the functions exist. The old build writes
sessions, check-ins and photos itself, so once the rules land an installed app
still on it cannot log until it picks up the new build — deploy the rules after
installed apps have had a chance to update (the service worker takes it on the
next launch).

## What a code contains

The contract `createAccessCode` writes and `redeemAccessCode` and the claim rule
read. It is `AccessCodeDoc` in `apps/pwa/app/data/types.ts`, restated in
`access-codes.ts`; change them together.

Every field must **exist**, including the ones whose value is null. A security
rule that reads a field the document does not have errors rather than returning
false, and an errored rule denies the write — so a code missing `expiresAt` or
`issuedToEmail` fails the claim with a bare "permission denied", nowhere near
anything that names the field. `redeemAccessCode` checks for them first and logs
the missing names.

`accessCodes/{THE-CODE}` — the document id *is* the code, uppercase:

| field | type | value |
|---|---|---|
| `code` | string | same as the document id |
| `batchId` | string | anything; groups codes issued together |
| `cohortId` | string | must match the cohort, e.g. `cohort-01` |
| `cohortName` | string | e.g. `Cohort 01` |
| `programId` / `programVersion` | string / number | the cohort's program pin |
| `expiresAt` | timestamp | **a future date** — the rule refuses a past one |
| `issuedToEmail` | string | who may redeem it — always set now; older codes may hold null, which anybody may redeem |
| `issuedToWhatsapp` | string or null | the buyer's WhatsApp number, or null when none was asked for |
| `status` | string | exactly `unused` |
| `claimedByUid` | null | |
| `claimedByName` | null | |
| `claimedAt` | null | |
| `revokedAt` | null | |
| `createdAt` / `updatedAt` | timestamp | now |
| `createdByUid` / `updatedByUid` | string | the admin's uid, or `system:web-registration` |
| `createdByEmail` / `updatedByEmail` | string | the admin's email, or `system:web-registration` |

`cohortId` has to match a real cohort: the member-create rule re-reads this
document and refuses to write a member into a cohort the code does not name.

`issuedToWhatsapp` is not checked by any rule, but it is what seeds
`MemberProfile.whatsapp` at redemption, so a code issued without it produces a
member the coach has no number for.

`programId` and `programVersion` are not on `AccessCodeBase`, but the member
document copies them out of the code at redemption, and `programs/''` is not a
document path — a code without them redeems fine and then throws on the first
workout save.

Codes written before the function existed can be missing any of these.
`backfill-access-codes.mjs` brings them up to this shape and warns about the
program pin.

## The schedule

A program's plan is weeks, and each week's training days are documents beneath
it with the date they fall on:

```
programs/recomp-six-week-v1/
  weeks/week-1              { weekNumber: 1, title: "Foundation", startDate: "2026-08-26", endDate: "2026-09-01" }
    days/day-1              { weekNumber: 1, dayNumber: 1, date: "2026-08-26", label, focus, exercises, … }
    days/day-2              { weekNumber: 1, dayNumber: 2, date: "2026-08-27", … }
    days/core-cardio        { …, optional: true }
  weeks/week-2              { weekNumber: 2, … startDate: "2026-09-02" }
    days/day-1              …
```

**The week the challenge is in is a date comparison.** Today falls in the
latest week whose `startDate` has arrived — before week 1 starts that is week 1,
after the last week ends it stays the last. That "today" is the cohort's, in the
cohort's zone: a member who joins in week 3 starts in week 3, and a member in New
York is in the same week as one in Lagos at the same instant. `weekNumber` on
every session, check-in and photo is resolved against the same weeks by the
function that writes it, so "this week" on screen and the week a log is filed
under cannot disagree. A day opens on its `date` *on the member's own calendar*
and stays open until logged — see [Days and regions](#days-and-regions).

What an admin has to get right, because a rule cannot check any of it:

| field | on | type | notes |
|---|---|---|---|
| `weekNumber` | week, day | number | 1-based. Orders the weeks; the id does not. A day's must match its week's. |
| `title`, `subtitle` | week | string | `""` renders "Week 3" with no title. |
| `startDate`, `endDate` | week | string | **`YYYY-MM-DD`, not a timestamp.** Inclusive; a week is its span, rest days and all. |
| `date` | day | string | `YYYY-MM-DD`, inside its week's span. |
| `dayNumber` | day | number | The "Day 2" on the card. |
| `optional` | day | boolean | `true` keeps it out of the weekly quota — the finisher. |

Each entry in a day's `exercises` array can carry a demo video, which the
exercise's How to tab plays:

| field | on | type | notes |
|---|---|---|---|
| `videoUrl` | exercise | string or null | An `https://` link to a playable file (MP4), not a YouTube page. Absent or `null` shows "Video coming soon". |
| `videoThumbUrl` | exercise | string or null | Optional poster frame shown before the video plays. |

This one a rule *does* check, on the `staging` database only for now: writes to
a day are refused if any exercise's `videoUrl` is not `null`, a string of at
most 2048 characters starting `https://`, or absent. Checking every exercise
means capping a day at 20, since rules cannot loop. `firestore.rules`
(production) does not have the check yet, so `npm run rules:diff` reports the
two as diverged until it is copied across.

Dates are strings on purpose. A training day is a date, not an instant: midnight
in Lagos is 23:00 the previous evening in UTC, so a timestamp typed into the
console reads back a day early anywhere it is rendered in UTC. A week whose
dates are not real `YYYY-MM-DD` strings is left off the schedule and named in
the browser console, and so is a day dated outside its week.

**Reuse day ids across weeks.** Week 1's quad day and week 4's are both `day-1`.
The "every training day N times" badge counts sessions by `dayId`, and a session
left running over a week boundary finds its day again by id; a fresh id per week
breaks both.

**Dates make a program one run of a plan.** A second cohort on the same six
weeks starting a month later needs its own dates, so it needs its own program
id (`recomp-six-week-v2`, or one per cohort) with `programId` on the cohort and
its access codes pointing at it.

Reading it costs one query for the weeks and one per week for its days, once
per load — seven reads for six weeks. No index is needed: both are sorted in
the client, because `orderBy` silently drops a document missing the field and a
day typed in without a `date` should be reported, not vanish.

### Migrating from `workoutDays`

Programs written before this held one flat `workoutDays` collection plus a
`weekThemes` array, dated from each member's join date.
`scripts/migrate-program-weeks.mjs` turns that into the shape above: week 1 on
the cohort's `startDate` in its timezone, each week seven days, each day on its
`dayNumber`-th day of the week — the schedule the app already ran, made
concrete. Every step is a dry run without `--apply`.

```bash
cd apps/pwa
# 1. Write the weeks. Additive; the old workoutDays stay, so the old build keeps working.
node scripts/migrate-program-weeks.mjs --database=staging --program-id=recomp-six-week-v1
node scripts/migrate-program-weeks.mjs --database=staging --program-id=recomp-six-week-v1 --apply

# 2. Deploy the app build that reads weeks.

# 3. Re-file members' sessions, photos and check-ins under the cohort's weeks.
node scripts/migrate-program-weeks.mjs --database=staging --program-id=recomp-six-week-v1 --restamp --apply

# 4. Once installed apps have picked up the new build, delete the old shape.
node scripts/migrate-program-weeks.mjs --database=staging --program-id=recomp-six-week-v1 --prune --apply
```

- The start date comes from the one cohort whose `programId` matches; name it
  with `--cohort-id` when there are several, or pass `--start-date=YYYY-MM-DD`.
- Weeks and days that already exist are left alone unless `--force`, so a re-run
  never undoes dates corrected in the console since.
- `--restamp` is safe to repeat, and worth repeating after the deploy, to catch
  anything the old build stamped in between. A check-in's id is its week, so a
  changed week moves the document; two check-ins landing in the same week are
  reported and left for a person to resolve.
- `--prune` refuses if any old day is missing from the weeks. It deletes
  Firestore documents only — hero images in Cloud Storage stay where they are,
  and the copied days still point at them.

## Seeding

`app/data/program.ts` is the fixture that mock mode serves, typed against the
same document contracts as the real thing — which is what lets it double as the
seed. `scripts/seed-program.ts` writes it: `programs/{PROGRAM_ID}` from
`program`, the `weeks` and their `days` from `trainingWeeks`, `guides` from
`guides`, the cohort from `cohort`, and the announcement and notification decks
from `announcements` and `notificationSeed`. Week 1 starts on the cohort's
`startDate` in its timezone; `--start-date=YYYY-MM-DD` overrides it.

```bash
cd apps/pwa
bun run seed:program -- --database=staging                    # dry run, prints the plan
bun run seed:program -- --database=staging --apply
```

It runs under Bun rather than Node because it imports the TypeScript fixture
directly. Three modes, and the difference between them matters:

| flag | existing documents |
|---|---|
| *(none)* | skipped — only missing documents are created |
| `--fill` | merged into, **absent top-level fields only** |
| `--force` | replaced outright |

Default is create-only, because after the first seed the console is the source
of truth and a re-run must not undo a coach's edits. `--fill` is the one to
reach for when a document predates a field — the program written before
`rewards` existed is exactly that case, correct in everything it has and
unusable without the one it lacks.

Ids that have to agree with something outside the script:

```bash
bun run seed:program -- --database=staging \
  --program-id=recomp-six-week-v1 --cohort-id=cohort-01 --fill --apply
```

`accessCodes/{code}.cohortId` names the cohort a member is written into and the
member copies `programId` off the same code, so a seed under different ids
produces a member whose program path resolves to nothing. That surfaces as an
empty Train screen, not as an error.

The coach block is denormalised onto the cohort and is the name and face on the
DM header, so it takes flags of its own rather than inheriting the fixture's
stock photograph:

```bash
  --coach-name="Coach Dayo" --coach-title="Head Coach · DP Fitness" \
  --coach-uid=<their auth uid> --coach-avatar=https://…
```

Two things it deliberately does **not** fill in. No live calls are seeded,
because a placeholder meeting link on every member's Home screen is worse than
no card — see below. And `memberCount` starts at `0`,
because nothing in the app maintains it and a seeded number is wrong from the
first member who joins.

## Live calls

Calls are scheduled in the admin app (**Live calls** in its sidebar), one
document per call in the top-level `liveCalls` collection:

```ts
{
  title: string            // "Weekly live call"
  cohortId: string         // the one cohort it is for
  cohortName: string
  startsAt: Timestamp      // the instant it starts, the same for every member
  durationMinutes: number  // 5–480; how long the join button stays open
  joinUrl: string          // https — Meet, Zoom, anything; opened in a new tab
  updatedAt, updatedByUid, updatedByEmail
}
```

Each call is a one-off. Nothing repeats: a weekly call is one document per
week. The app reads its member's cohort with
`where('cohortId', '==', member.cohortId)` — one equality filter, so no
composite index — alongside the cohort document, and Home shows the call on
the member's current calendar day in their stored region, if there is one
(`todaysLiveCall` in `lib/domain/liveCall.ts`): upcoming with a disabled button,
live with a join button, then ended for the rest of the day. Its time is shown
in the member's region as a courtesy — "2:00 – 3:00 PM your time · 7:00 PM WAT"
— and the slot itself is the same instant for everybody. A document missing
`startsAt` or an http(s) `joinUrl` is no call (`liveCallFrom`).

Rules: operators write, with the shape checked; a member reads only calls whose
`cohortId` is their own cohort. There is no copy on the cohort document. The
old `cohorts/{id}.liveCall` field is no longer read.

**Reminders.** Scheduling a call sends nothing. On the call's day, in the
cohort's zone, `remindLiveCalls` (`apps/functions/src/live-call-reminders.ts`,
every 15 minutes) writes a coach notification to the cohort's inbox: "Live call
today", "Weekly live call at 7:00 PM WAT. Join from Home." It goes out at 8 AM,
or an hour before a call that starts earlier than 9 AM, and never after the
call has ended, or once the cohort is over. Like every notification, it is
pushed to members who turned push on. Its id is `live-call-{callId}-{date}`, created rather than set, so it
is sent once per call per day; a call moved to another day is announced again
there. The admin app must not write its own notification for a call, or
members get two.

## The leaderboard switch

`cohorts/{cohortId}.leaderboardVisible` decides whether members see the board.
Off — and missing counts as off — Rewards has no leaderboard tab at all, not a
locked one; on, the tab appears. It is hidden for the opening weeks on purpose.
The projection under `cohorts/{id}/leaderboard` is written the whole time either
way, because it doubles as the chat roster, so turning the board on shows real
history rather than a row of zeros.

`leaderboardRevealWeek` changes nothing about visibility. It is the last week
the "the leaderboard's live now" card shows above the board, and the week is the
cohort's — every member is in the same week on the same date (see **The
schedule**).

Only an admin (the `coach` claim) can write either field. The admin app — a
separate app, not in this repo — is what turns the board on and off; until it
exists, flip the boolean in the console. The PWA watches the cohort document,
so the change reaches members with the app already open.

This is a visibility switch, not access control. Switched off, the session
counts are still readable by the cohort, because chat's `@` roster reads the
same collection.

## Repairing `members/{uid}.programId`

`programId` decides which program the app reads — the plan, the guides, the
threshold every session is judged against, the point values every reward is paid
at. A code issued before the landing site started copying it, or written by hand
without it, produces a member whose `programId` is the **empty string**, and
`programs/''` is not a document path: Firestore rejects it for having an odd
number of segments, so the read throws rather than returning "not found".

`FirestoreDataSource.program()` falls back to the cohort's `programId` and warns,
so nobody is locked out while this is outstanding. It is still a fallback. Fix
the documents:

```bash
cd apps/pwa
node scripts/repair-members.mjs --database=staging
node scripts/repair-members.mjs --database=staging --apply
```

It runs on the Admin SDK because it has to: `firestore.rules` makes `programId`
immutable on a member update, which is the right rule — what a member was
prescribed is not theirs to change — and is exactly why they cannot repair
themselves. Nothing is guessed; a member whose cohort names no program either is
reported and skipped.
