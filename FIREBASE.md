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
| `…/messages/{id}/reactions/{uid}` | Who reacted, one document per reactor. The message also carries `reactors` (uid → name and time, author excluded) and `reactedAt`, which is what the author's inbox reads. |
| `programs/{programId}` | Authored plan, versioned. Carries `qualifyingSetPercent` and the whole reward economy — the badge ladder, the rank ladder and every point value. |
| `programs/{id}/weeks/{weekId}` | One week of the block: its number, title and dates. `week-1`, `week-2`, … — see **The schedule**. |
| `programs/{id}/weeks/{weekId}/days/{dayId}` | One training day in that week, with the date it falls on. |
| `programs/{id}/guides/{guideId}` | The guide library. |
| `members/{uid}` | The member. Keyed by the Firebase Auth uid, so rules are `request.auth.uid == uid` with no lookup. |
| `members/{uid}/sessions/{id}` | Workout logs. |
| `members/{uid}/state/activeSession` | The workout in progress. A fixed id, because there is only ever one. |
| `members/{uid}/checkIns/week-{n}` | One per week, enforced by the key. |
| `members/{uid}/photos/{id}` | Progress photos. |
| `members/{uid}/badges/{badgeId}` | Awards, keyed so a double-award is a no-op. |
| `members/{uid}/notificationState/{id}` | Read markers. Present means read. |
| `members/{uid}/lifecycleEvents/{id}` | Append-only status history. |
| `signIns/{uid}` | The account's latest sign-in, which is the one device it is signed in on. See **One device at a time**. |

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

Closing it means moving the four writes that mint points behind Callable
Functions and denying those paths to clients outright:

- `redeemAccessCode`
- `saveSession`
- `saveCheckIn`
- `awardBadge`

`FirestoreDataSource` is shaped so each becomes a one-line `httpsCallable`.

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
it already holds: `deleteSession` merges only the count.

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

They differ today by one change: staging checks each exercise's `videoUrl`
(see **The schedule**) and production does not yet. `npm run rules:diff` shows
the divergence — no output means they match, and any output is the divergence.
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
after the last week ends it stays the last. A day is today's session on its
`date`, open to catch up on until its week ends, and shut before its date. This
is the cohort's calendar, not the member's: a member who joins in week 3 starts
in week 3. `weekNumber` on every session, check-in and photo is resolved against
the same weeks, so "this week" on screen and the week a log is filed under
cannot disagree.

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
the app will ignore. The app watches the cohort document, so members with it
open see the change without reloading.

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
