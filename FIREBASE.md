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

## Running against the emulator

Requires a JDK — the Firebase emulators are Java.

```bash
firebase emulators:start
```

Then point the app at it by calling `connectFirestoreEmulator`,
`connectAuthEmulator` and `connectStorageEmulator` from
`app/lib/firebase/app.ts`, guarded on `appEnv === 'development'`. Not wired up
yet.

## Enabling email-link sign-in

1. Firebase console → Authentication → Sign-in method → **Email/Password**,
   enable it, then enable **Email link (passwordless sign-in)** underneath.
2. Authentication → Settings → **Authorised domains**: add the domain the app is
   served from. The link will not complete from an unlisted origin.
3. The redirect target is `${origin}/access-code` — see `actionCodeSettings` in
   `app/lib/datasource/firestore.ts`. That route knows how to finish the flow,
   including the case where the link is opened on a different device from the
   one that requested it.

## Seeding

`app/data/program.ts` is the fixture that mock mode serves, typed against the
same document contracts as the real thing. It is what a seed script should
write: `programs/{PROGRAM_ID}` from `program`, `workoutDays` from `planDays` and
`coreCardioDay`, `guides` from `guides`, and the cohort from `cohort`. No such
script exists yet.
