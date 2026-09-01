# Firebase backend

The app talks to Firestore, Auth and Cloud Storage directly from the browser.
There is no server of ours in the path, which makes `firestore.rules` and
`storage.rules` the actual access-control policy rather than documentation of
one. Read them before changing anything in `app/lib/datasource/firestore.ts`.

## Layout

| Path | What it holds |
| --- | --- |
| `accessCodes/{code}` | One seat. Keyed by the code, so redemption is a single `getDoc` and uniqueness is the database's problem, not a query's. |
| `cohorts/{cohortId}` | The cohort, with the coach denormalised onto it. |
| `cohorts/{id}/notifications/{id}` | Coach-authored announcements. |
| `cohorts/{id}/leaderboard/{uid}` | Name, avatar, qualifying-session count. A projection — see below. |
| `cohorts/{id}/threads/{threadId}/messages/{id}` | `cohort` is the group thread; every other `threadId` is a member uid, meaning that member's private thread with the coach. |
| `…/messages/{id}/reactions/{uid}` | Who reacted, one document per reactor. |
| `programs/{programId}` | Authored plan, versioned. Carries `qualifyingSetPercent` and the whole reward economy. |
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

## Two decisions worth knowing about

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

## Creating an access code by hand

The console is the only way to make one until there is a seed script, and a
code written by hand is the easiest document in the system to leave incomplete.

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

## Seeding

`app/data/program.ts` is the fixture that mock mode serves, typed against the
same document contracts as the real thing. It is what a seed script should
write: `programs/{PROGRAM_ID}` from `program`, `workoutDays` from `planDays` and
`coreCardioDay`, `guides` from `guides`, and the cohort from `cohort`. No such
script exists yet.
