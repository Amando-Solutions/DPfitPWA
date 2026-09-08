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
| `cohorts/{cohortId}` | The cohort, with the coach denormalised onto it. Also the weekly `liveCall` and whether the leaderboard is on. |
| `cohorts/{id}/notifications/{id}` | Coach-authored inbox lines. |
| `cohorts/{id}/announcements/{id}` | The card deck behind the inbox. Longer-form, and carries a call to action. |
| `cohorts/{id}/leaderboard/{uid}` | Name, avatar, qualifying-session count. A projection — see below. |
| `cohorts/{id}/threads/{threadId}/messages/{id}` | `cohort` is the group thread; every other `threadId` is a member uid, meaning that member's private thread with the coach. |
| `…/messages/{id}/reactions/{uid}` | Who reacted, one document per reactor. |
| `programs/{programId}` | Authored plan, versioned. Carries `qualifyingSetPercent`, `weekThemes` and the whole reward economy — the badge ladder, the rank ladder and every point value. |
| `programs/{id}/workoutDays/{dayId}` | The training week. |
| `programs/{id}/guides/{guideId}` | The guide library. |
| `members/{uid}` | The member. Keyed by the Firebase Auth uid, so rules are `request.auth.uid == uid` with no lookup. |
| `members/{uid}/sessions/{id}` | Workout logs. |
| `members/{uid}/state/activeSession` | The workout in progress. A fixed id, because there is only ever one. |
| `members/{uid}/checkIns/week-{n}` | One per week, enforced by the key. |
| `members/{uid}/photos/{id}` | Progress photos. |
| `members/{uid}/badges/{badgeId}` | Awards, keyed so a double-award is a no-op. |
| `members/{uid}/notificationState/{id}` | Read markers. Present means read. |
| `members/{uid}/lifecycleEvents/{id}` | Append-only status history. |

## Three decisions worth knowing about

**Nothing a member sees is compiled into the app.** The plan, the guide library,
the week themes, the badge and rank ladders, the qualifying threshold, the live
call, the announcement deck — all of it is read from the documents above, per
cohort, on every load. It used to be `import`ed out of `app/data/program.ts`,
which meant every cohort on every deploy was shown the same six weeks of the
same four sessions and the same live-call link, whatever the coach had actually
set up, and re-tuning any of it was a release. That file is now two things and
neither is content the app serves: what *mock mode* answers with
(`lib/datasource/local.ts` is the only module allowed to import it), and the
input to the seed script.

The cost is that the documents have to exist. A program with no `workoutDays`
renders a Home screen with no session on it, which is the honest answer and not
a bug — see **Seeding**.

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

Closing it means moving the four writes that mint points behind Callable
Functions and denying those paths to clients outright:

- `redeemAccessCode`
- `saveSession`
- `saveCheckIn`
- `awardBadge`

`FirestoreDataSource` is shaped so each becomes a one-line `httpsCallable`.

## Indexes

`firestore.indexes.json` is JSON and cannot carry comments, so the reasoning
lives here.

- **`notifications` composite (`pinned` desc, `publishedAt` desc)** — pinned
  announcements sort above everything regardless of date. Two order-bys on one
  collection require a composite index; Firestore refuses the query without it.
- **`sessions.exercises` unindexed** — a session log embeds every set of every
  exercise. Nothing queries inside that array, and indexing it costs an index
  write per element on every save.
- **`state.exercises` unindexed** — same, and worse: the in-flight session is
  rewritten every time a set is tapped.
- **`messages.reactionCounts` unindexed** — a map keyed by emoji, which grows
  without bound and is only ever read, never queried.

Everything else the app queries (`completedAt`, `takenAt`, `weekNumber`,
`sentAt`, `sessions`) is a single-field sort that Firestore indexes
automatically.

## Deploying

```bash
npm i -g firebase-tools
firebase login
firebase use --add                     # pick the project

firebase deploy --only firestore:rules,firestore:indexes,storage
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

They are byte-for-byte identical today. `npm run rules:diff` says whether that
is still true — no output means they match, and any output is the divergence.
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

There are two ways in and no password on either. Both have to be turned on in
the console before the app can offer them — a provider that is merely coded for
answers `auth/operation-not-allowed`, which `authError` reports as "that
sign-in method isn't available right now".

**Email link (magic link)**

1. Authentication → Sign-in method → **Email/Password**, enable it, then enable
   **Email link (passwordless sign-in)** underneath.
2. The redirect target is `${origin}/access-code` — see `actionCodeSettings` in
   `app/lib/datasource/firestore.ts`. That route knows how to finish the flow,
   including the case where the link is opened on a different device from the
   one that requested it, which is the branch that has to ask for the address
   again because nothing was parked in *that* browser's storage.

**Google**

3. Authentication → Sign-in method → **Google**, enable it, and set the
   project support email.
4. Nothing else. `signInWithGoogle` opens a popup, and falls back to a
   full-page redirect when the popup is blocked or cannot exist. The redirect
   finishes in `resumeSignIn`, which the store calls once per load *before*
   route middleware runs — a load returning from Google carries its credentials
   in the URL, and if they are not consumed first the middleware sees nobody
   signed in and bounces a member who just signed in back to the door.

**Both**

5. Authentication → Settings → **Authorised domains**: add every domain the app
   is served from. Neither flow completes from an unlisted origin; `localhost`
   is listed by default.

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

## Where access codes come from

Two places, and only one of them is a person.

**A paid registration issues one.** `apps/web/server/utils/fulfilment.ts` mints a
code when Selar's sale notification arrives at `api/payment/webhook`, which is
the only path there is — Selar has no API to ask, so the notification is the
evidence; `apps/web/server/utils/access-code.ts` writes the document. It
runs on the Admin SDK for the same reason this section exists at all — `allow
create` on `accessCodes` is coach-only, and a visitor buying a seat is not
signed in — and it gets the shape right by construction, reading `cohortName`
and the program pin off the cohort document rather than copying them by hand.
That is the path to prefer. Nothing issues a code before money moves.

**The console, for anything else** — a comped seat, a replacement, a code issued
against a bank transfer. The table below is what that document has to contain.

## Creating an access code by hand

A code written by hand is the easiest document in the system to leave
incomplete.

Every field below must **exist**, including the ones whose value is null. A
security rule that reads a field the document does not have errors rather than
returning false, and an errored rule denies the write — so a code missing
`expiresAt` or `issuedToEmail` fails the claim with a bare "permission denied",
nowhere near anything that names the field. `redeemAccessCode` checks for them
first and logs the missing names, but the document still has to be right.

`accessCodes/{THE-CODE}` — the document id *is* the code, uppercase:

| field | type | value |
|---|---|---|
| `code` | string | same as the document id |
| `batchId` | string | anything; groups codes issued together |
| `cohortId` | string | must match the cohort, e.g. `cohort-01` |
| `cohortName` | string | e.g. `Cohort 01` |
| `expiresAt` | timestamp | **a future date** — the rule refuses a past one |
| `issuedToEmail` | string or null | the purchase email, or null for a generic code |
| `issuedToWhatsapp` | string or null | the buyer's WhatsApp number, or null when none was asked for |
| `status` | string | exactly `unused` |
| `claimedByUid` | null | |
| `claimedByName` | null | |
| `claimedAt` | null | |
| `revokedAt` | null | |
| `createdAt` / `updatedAt` | timestamp | now |
| `createdByUid` / `updatedByUid` | string | your uid |
| `createdByEmail` / `updatedByEmail` | string | your email |

`cohortId` has to match a real cohort: the member-create rule re-reads this
document and refuses to write a member into a cohort the code does not name.

`issuedToWhatsapp` is not checked by any rule, so leaving it off will not deny
anything — but it is what seeds `MemberProfile.whatsapp` at redemption, and a
code issued without it produces a member the coach has no number for. Set it to
`null` if you genuinely did not collect one; `backfill-access-codes.mjs` fills
it in for codes written before the field existed.

`programId` and `programVersion` are not in the table because they are not on
`AccessCodeBase` — but set them anyway, to whatever the cohort names. The member
document copies them out of the code at redemption, and `programs/''` is not a
document path, so a code without them redeems fine and then throws on the first
workout save. `backfill-access-codes.mjs` warns about exactly this.

## Seeding

`app/data/program.ts` is the fixture that mock mode serves, typed against the
same document contracts as the real thing — which is what lets it double as the
seed. `scripts/seed-program.ts` writes it: `programs/{PROGRAM_ID}` from
`program`, `workoutDays` from `planDays` and `coreCardioDay`, `guides` from
`guides`, the cohort from `cohort`, and the announcement and notification decks
from `announcements` and `notificationSeed`.

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

Two things it deliberately does **not** seed. `liveCall` starts `null`, because
a placeholder meeting link on every member's Home screen is worse than no card
— see below. And `memberCount` starts at `0`, because nothing in the app
maintains it and a seeded number is wrong from the first member who joins.

## The weekly live call

`cohorts/{cohortId}.liveCall` is a map of two strings, and Home reads it
straight off the cohort document:

| field | example |
|---|---|
| `when` | `Tuesday, 7:00 PM WAT` — as it reads on the card, carrying its own zone |
| `joinUrl` | `https://meet.google.com/abc-defg-hij` |

**Null renders no card.** So does either half alone: a time with no link is a
button that goes nowhere and a link with no time is a meeting nobody knows to
attend, so `getCohort` collapses a half-written map to `null` rather than
rendering something broken. A cohort between blocks simply has no live-call
card, which is a complete screen.

Set it from the console — Firestore → `cohorts` → the document → the `liveCall`
map — or with the script, which exists because that is a fiddly nested map to
type correctly every week:

```bash
cd apps/pwa
bun run live-call -- --database=staging --cohort=cohort-01 --show
bun run live-call -- --database=staging --cohort=cohort-01 \
  --when="Tuesday, 7:00 PM WAT" --url=https://meet.google.com/abc-defg-hij --apply
bun run live-call -- --database=staging --cohort=cohort-01 --clear --apply
```

Dry run without `--apply`, and it refuses half a call rather than writing one
the app will ignore. Members pick up the change on their next load.

Two more cohort fields the app reads and the console sets:
`leaderboardVisible` (the board is hidden for the opening weeks on purpose) and
`leaderboardRevealWeek` (used only for the notice shown the week it appears).

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
