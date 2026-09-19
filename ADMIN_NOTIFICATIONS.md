# Admin console handover

The admin console is a separate app and doesn't live in this repo. It writes
the data the member app (`apps/pwa`) runs on: access codes, cohorts, the
training plan, announcements, and the coach's side of chat. This document is
the contract between the two apps. It covers what the console has to build,
which documents and fields it writes, and the mistakes that break the member
app without showing an error.

[FIREBASE.md](FIREBASE.md) has the full data model and the reasons behind the
rules. This document links to it where the detail runs long.

## Contents

1. [Setting up the console](#1-setting-up-the-console)
2. [Access codes and sales](#2-access-codes-and-sales)
3. [Members](#3-members)
4. [Cohorts](#4-cohorts)
5. [Programs](#5-programs)
6. [Announcements and notifications](#6-announcements-and-notifications)
7. [Coach chat](#7-coach-chat)
8. [Rules, indexes and deploys](#8-rules-indexes-and-deploys)
9. [Not supported today](#9-not-supported-today)
10. [Checklist](#checklist)

---

## 1. Setting up the console

### The project and its two databases

| | |
|---|---|
| Firebase project | `recomp-48b7b` |
| Firestore databases | `(default)` for production and `staging`, both in `africa-south1` |
| Storage buckets | `recomp-48b7b.firebasestorage.app` for production and `recomp-48b7b-staging` |
| Cloud Functions region | `africa-south1` |

The two databases are separate databases in one project, not namespaces. They
share Firebase Auth, so one admin account works against both. The console has
to know which one it is pointed at and never mix them:

- Firestore reads and writes go to the database the client was created for,
  such as `getFirestore(app, 'staging')`.
- `createAccessCode` takes the database as a parameter (section 2).
- Uploads go to the matching bucket.

### Admin accounts

An admin is a Firebase Auth user with custom claims. Two claims are checked in
two different places today, and an admin needs both:

| Claim | Checked by | Grants |
|---|---|---|
| `coach: true` | `firestore.rules`, as `isCoach()` | Writing cohorts, programs, announcements and notifications. Reading codes, registrations, unmatched sales and chat. Editing and deleting any chat message. |
| `dpfitAdmin: true` | the `createAccessCode` function | Issuing access codes. |

Set both with the Admin SDK:

```ts
await getAuth().setCustomUserClaims(uid, { coach: true, dpfitAdmin: true })
```

- Claims are read from the ID token. An admin who has just been granted them
  has to sign out and back in, or call `getIdToken(true)`, before the claims
  apply.
- `setCustomUserClaims` replaces the whole claims object, so pass both claims
  every time.
- The plan is to use `dpfitAdmin` alone. Until `firestore.rules` accepts it,
  removing `coach` locks the admin out of every Firestore write.

### Client SDK or Admin SDK

The member app talks to Firestore straight from the browser, so
`firestore.rules` and `storage.rules` are the real access policy. The `coach`
claim can author content through the client SDK. Member data and a few other
writes are kept to the Admin SDK on purpose, and the Admin SDK bypasses rules.
The console therefore needs a small server side, such as its own Cloud
Functions or API routes holding a service account, for the right-hand column:

| Task | Client SDK, signed in with the claims | Admin SDK |
|---|---|---|
| Issue an access code | Through the `createAccessCode` callable | |
| List, revoke or delete codes | ✓ | |
| Read registrations and unmatched sales | ✓ | |
| Mark an unmatched sale resolved, or record a resent email | | ✓ Client writes are refused. |
| Create and edit cohorts, the live call and the leaderboard switch | ✓ | |
| Write programs, weeks, days and guides | ✓ | |
| Upload program hero images | | ✓ Storage refuses client writes under `programs/`. |
| Write announcements and notifications | ✓ | |
| Read chat, edit or delete any message, write typing markers | ✓ | |
| Post a coach message | | ✓ Or add a coach branch to the rules (section 8). |
| React as the coach | | ✓ The coach's `reactions/{uid}` document is refused. |
| Upload coach chat attachments | | ✓ Storage accepts only a member's own uploads. |
| Read a member's profile, sessions, check-ins and photos | | ✓ |
| Pause, resume or complete a member, or fix a member document | | ✓ |
| Delete a member | ✓ The document itself | ✓ Its subcollections |
| Manage Auth: claims, unlinking providers, revoking sessions, changing emails | | ✓ |

[Section 8](#admin-branches-you-could-add-instead) lists the rule changes that
would move some of these rows into the client column, if you would rather not
route them through a server.

### Conventions every write follows

- **Audit fields.** Every document the console authors carries `createdAt`,
  `createdByUid` and `createdByEmail` when it is created, and `updatedAt`,
  `updatedByUid` and `updatedByEmail` on every write. Timestamps come from
  `serverTimestamp()`; the uid and email come from the signed-in admin. The
  member app never reads them. They are the only record of who changed what.
- **Instants are Timestamps.** `publishedAt`, `startsAt`, `expiresAt`, `sentAt`
  and every other point in time must be a Firestore Timestamp. A string or a
  number either throws in the member app or silently reads as unset.
- **Calendar dates are strings.** A program week's `startDate` and `endDate`,
  and a training day's `date`, are `YYYY-MM-DD` strings rather than Timestamps
  (section 5).
- **Write every field, and use `null` for empty.** Firestore has no
  `undefined`. A security rule that reads a missing field errors, which denies
  the write, and the member app's types assume every field is present.
- **Use auto-generated ids** unless a section says otherwise.
- **Know what reaches members live.** The member app listens to the cohort
  document, notifications, announcements and chat, so changes there reach open
  apps within a second or two. The program and its weeks, days and guides are
  read once each time the app loads.

---

## 2. Access codes and sales

Nobody can make a member account without an access code issued to their email
address. Paid sales on the landing site get their code automatically. The
console issues every other code and handles the sales that couldn't be matched
to a buyer.

**How a member uses a code.** They open the member app, enter the code on
`/access-code`, and sign up with an email and password. The email must be the
code's `issuedToEmail`, compared without regard to case. The code is claimed
for the new account in the same step. `expiresAt` is a deadline for redeeming
only: a claimed code keeps working after it passes.

### Issuing a code

Call `createAccessCode`. It is the only writer of `accessCodes`, and the rules
refuse every client create, the coach's included.

```ts
import { getFunctions, httpsCallable } from 'firebase/functions'

const createAccessCode = httpsCallable(getFunctions(app, 'africa-south1'), 'createAccessCode')

const { data } = await createAccessCode({
  database: 'staging',        // or '(default)', which is the default
  cohortId: 'cohort-01',
  expiryDays: 30,             // whole days, 1–365: how long it can be redeemed
  email: 'buyer@example.com', // the only address that can redeem it
  whatsapp: '+234…',          // optional; copied into the member's profile
})
// data: { code, reused, database, cohortId, cohortName, issuedToEmail, expiresAt }
```

- **One code per call, for one email.** There are no batches and no anonymous
  codes.
- **The cohort is checked.** A cohort that doesn't exist, is `archived`, or has
  no `programId` is refused with `failed-precondition`. A `draft` cohort is
  fine, so seats can be sold before a cohort opens.
- **`reused: true`** means that email already holds an unused, unexpired code
  for that cohort, and the function returned it instead of issuing a second
  one. Show this to the admin, because it usually means a duplicate request.
- **Errors:** `unauthenticated`; `permission-denied` for a missing
  `dpfitAdmin` claim; `invalid-argument`, with a message naming the field;
  `failed-precondition` for the cohort; and `aborted` when no free code was
  found, which is worth retrying.
- **Ask for the WhatsApp number.** Nothing checks it, but it is how the coach
  reaches the member outside the app. A code issued without one produces a
  member with no number.
- The email is stored in lower case. `expiresAt` in the result is an ISO
  string.

### Delivering the code

`createAccessCode` sends nothing. The console has to get the code to the
person, either by showing it for the admin to copy or by emailing it. The
landing site's email is in `apps/web/server/emails/access-code.ts` and goes out
through Brevo (`apps/web/server/utils/email.ts`). If the console sends email,
reuse that template so both routes say the same thing.

The member needs three things: the app's address, the code, and a warning that
they must sign up with exactly the address the code was issued to.

### The code document

`accessCodes/{code}`, where the document id is the code itself, such as
`DPF-7K2M-QX9P`. The console reads it and only ever writes it to revoke it.

| Field | Notes |
|---|---|
| `code` | Same as the document id. |
| `batchId` | `console-YYYY-MM` or `landing-YYYY-MM`: where and when it was issued. |
| `cohortId`, `cohortName` | |
| `programId`, `programVersion` | Copied from the cohort when the code was issued. |
| `issuedToEmail`, `issuedToWhatsapp` | Who may redeem it. |
| `expiresAt` | Timestamp. The last moment it can be redeemed. |
| `status` | `unused`, `claimed` or `revoked`. |
| `claimedByUid`, `claimedByName`, `claimedAt` | Set when redeemed. `members/{claimedByUid}` is the member's document. |
| `revokedAt` | Set when revoked. |
| audit fields | `createdByUid` is the admin, or `system:web-registration` for a paid sale. |

Listing codes requires the `coach` claim. A query that filters and sorts, such
as "codes for this cohort, newest first", needs a composite index; add it to
this repo's index file (section 8). Codes written before the function existed
may be missing fields. `bun run backfill:codes` in `apps/pwa` repairs them.

### Revoking a code

```ts
await updateDoc(doc(db, 'accessCodes', code), {
  status: 'revoked',
  revokedAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  updatedByUid: admin.uid,
  updatedByEmail: admin.email,
})
```

- Write only these fields. The rules let the coach change anything on a code,
  so the console has to hold itself to this shape.
- **Revoking an unused code** stops it from being redeemed. The member app
  says "That code has been revoked. Contact support."
- **Revoking a claimed code doesn't remove the member.** They keep their
  access; revoking only stops them rebuilding a deleted member document from
  the code. To remove someone, see [Removing a member](#removing-a-member).
- **Revoke rather than delete.** A claimed code is the record of which seat a
  member holds. The rules allow deleting, so the console should refuse to
  offer it for claimed codes.

### Replacing a code

To give someone a new code for the same cohort, for example after a typo in
the email or a lost code, revoke the old code first and then issue a new one.
While the old code is unused and unexpired, `createAccessCode` returns that
same code with `reused: true`.

To move a code to a different email, revoke it and issue a new one to the new
address. Don't edit `issuedToEmail` in place.

### The sales queue

The landing site sells seats through Selar. Selar can't carry our registration
reference, so a sale is matched to a registration by the buyer's email. When
the match fails, or the email carrying the code fails to send, a buyer has paid
and has no code. The console should show both cases.

**Unmatched sales.** The landing site's webhook writes
`unmatchedSales/{autoId}` when a sale matches no registration. Usually the
buyer changed their email on Selar's checkout page, or bought from a Selar
link without filling in the form. No code has been issued.

| Field | Notes |
|---|---|
| `email`, `fullName` | As Selar reported them. `fullName` may be `null`. |
| `saleReference` | Selar's purchase code, searchable in Selar's dashboard. |
| `amountMinor`, `currency` | What was paid, in minor units (kobo for NGN). Either may be `null`. |
| `expectedAmountMinor`, `expectedCurrency`, `amountNote` | What the page advertised, and a note when it differs. Selar converts prices into the buyer's currency, so a difference is often harmless. |
| `product`, `channel`, `paidAt` | As reported. `paidAt` is a string in whatever format Selar sent. |
| `reference` | Our registration reference, if it survived the trip. Almost always `null`. |
| `resolved` | `false` when written. |
| `receivedAt` | Timestamp. |

To resolve one:

1. Contact the buyer. The email they paid with may not be the one they want to
   sign up with.
2. Issue a code with `createAccessCode` and deliver it.
3. Set `resolved: true`. Client writes to `unmatchedSales` are refused, so this
   goes through the Admin SDK. Nothing reads any other field, so the console
   can also record `resolvedAt`, `resolvedByUid`, `resolvedByEmail` and the
   `code` there as it sees fit.

**Paid registrations whose email failed.** These are `registrations/{reference}`
documents with `paymentStatus == 'paid'` and `emailed == false`. The code in
`code` exists and is valid, but the email carrying it didn't send. List them
and let the admin resend or copy the code. Client writes to `registrations` are
refused, so setting `emailed` after a resend also goes through the Admin SDK.

The registration fields worth showing are `fullName`, `email`, `whatsapp`,
`timezone`, `cohortId`, `paymentStatus`, `code`, `paidAmountMinor` and
`paidCurrency`, `saleReference`, `paidAt`, `emailed` and `createdAt`.
`paymentStatus` is `pending`, `paid`, `failed` or `refunded`. Nothing writes
`failed` or `refunded` any more. A `pending` registration is someone who
started checkout and didn't pay, which is common and not an error.

### Which cohort paid sales go into

This isn't a console setting. The landing site issues every paid seat into
the cohort named by `NUXT_REGISTRATION_COHORT_ID` (default `cohort-01`), with
a redemption window of `NUXT_REGISTRATION_CODE_TTL_DAYS` (default 30). Both are
environment variables on `apps/web`. Opening sales for a new cohort means
changing the variable and redeploying the landing site.

The cohort must exist and have a program first. Otherwise every sale fails to
get a code: the webhook answers 500, and the task has to be replayed from
Zapier once the cohort is fixed.

---

## 3. Members

The member app creates `members/{uid}`, keyed by the member's Auth uid, when a
code is redeemed. The rules keep it private to the member, so the console
reads and writes it only through the Admin SDK.

### What to show

| Field | Notes |
|---|---|
| `email` | The address the membership was made with. It is fixed; see [Changing a member's email](#changing-a-members-email). |
| `status` | `onboarding` (redeemed, setup unfinished), `active`, `paused` or `completed`. |
| `cohortId`, `cohortName`, `programId`, `programVersion` | Taken from the code at redemption. |
| `accessCode` | The code they redeemed. |
| `joinedAt`, `createdAt` | |
| `profile` | `displayName`, `whatsapp`, `age`, `sex`, `heightCm`, `weightKg`, `startWeightKg`, `activity`, `goal`, `trainingDaysPerWeek`, `avatarUrl`. |
| `stats` | `sessionsLogged`, `sessionsQualified`, `checkInsSubmitted`, `photosUploaded`, `points`, `lastSessionAt`. |
| `previousStatus`, `pauseReason`, `pausedAt` | Set while the member is paused. |

The member's subcollections are `sessions` (workout logs), `checkIns` (one per
week, with ids like `week-3`), `photos`, `badges` and `lifecycleEvents`.

Progress photos are the most sensitive thing the product holds. Each photo
document's `image.downloadUrl` renders it, and a download URL works for anyone
who has it. Show photos to admins only, and never copy their URLs anywhere
else.

`cohorts/{cohortId}/leaderboard/{uid}` holds one roster row per member: name,
avatar and qualifying session count. It is the easiest way to list a cohort's
members, and the only one that doesn't need the Admin SDK.

### Pausing, resuming and completing

These moves belong to the console. The only status change a member makes
themselves is `onboarding` to `active`, by finishing setup.

```ts
// Admin SDK
const ref = db.doc(`members/${uid}`)

await db.runTransaction(async (tx) => {
  const member = (await tx.get(ref)).data()!

  tx.update(ref, {
    status: 'paused',
    previousStatus: member.status,     // 'active'
    pauseReason: reason,               // 3–240 characters
    pausedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUid: admin.uid,
    updatedByEmail: admin.email,
  })

  tx.create(ref.collection('lifecycleEvents').doc(), {
    memberId: uid,
    type: 'member.paused',
    fromStatus: member.status,
    toStatus: 'paused',
    reason,
    createdAt: FieldValue.serverTimestamp(),
    createdByUid: admin.uid,
    createdByEmail: admin.email,
  })
})
```

- **To resume,** set `status` back to `previousStatus`, set `previousStatus`,
  `pauseReason` and `pausedAt` to `null`, and write a `member.resumed` event.
- **To complete,** set `status: 'completed'` and write a `member.completed`
  event.
- **Lifecycle events** are append-only. Each has `memberId`, `type`
  (`member.joined`, `member.paused`, `member.resumed` or `member.completed`),
  `fromStatus` (`null` on join), `toStatus`, `reason` and the created-by audit
  fields. The member app writes the `member.joined` events.

**The member app does nothing visible with these statuses today.** A paused or
completed member keeps the whole app. The statuses and events are the coach's
record, for answering questions like "why hasn't she logged since week 2". If a
pause should restrict the app, that is a change to the member app.

Two traps:

- **Don't pause a member who is still `onboarding`.** The app routes a paused
  member past setup, and the rules won't let them finish setup while paused,
  so they land on Home with no profile.
- **Never set `status` back to `onboarding`.** That reopens setup, including
  the display name and height that are otherwise fixed.

### Removing a member

This erases the member and can't be undone.

1. Revoke their access code, `accessCodes/{member.accessCode}`. Otherwise they
   can redeem it again and rebuild their member document.
2. Delete `members/{uid}` with its subcollections, using `recursiveDelete` in
   the Admin SDK, and delete their files in Storage under `members/{uid}/`.
3. Delete `cohorts/{cohortId}/leaderboard/{uid}`. Otherwise they stay on the
   roster and in the @mention list.
4. Optionally, disable or delete their Auth user.

Without a member document the member app refuses them everything. Their chat
messages stay; delete those separately if they should go too.

### Changing a member's email

`members/{uid}.email` is fixed, and the rules refuse every request from an
account whose Auth email no longer matches it. Change both together:

```ts
await getAuth().updateUser(uid, { email: newEmail })
await db.doc(`members/${uid}`).update({
  email: newEmail,
  updatedAt: FieldValue.serverTimestamp(),
  updatedByUid: admin.uid,
  updatedByEmail: admin.email,
})
```

Changing only the Auth email locks the member out.

### Recovering a seat

Sometimes someone other than the buyer makes the account with the buyer's
code. The account is still under the buyer's address, so the seat can be
recovered on the Admin SDK:

1. If the account's Auth email was changed, set it back to
   `members/{uid}.email`.
2. Unlink any sign-in provider the buyer didn't add:
   `updateUser(uid, { providersToUnlink: ['google.com'] })`.
3. Revoke the account's sessions with `revokeRefreshTokens(uid)`.
4. Ask the buyer to use **Forgot password?** on `/sign-in`.

When neither step 1 nor step 2 applies, the password reset and a fresh sign-in
are enough on their own. See
[FIREBASE.md → Recovering a seat](FIREBASE.md#recovering-a-seat).

### Repair scripts

The member app has Admin SDK scripts for one-off repairs. They are run by hand
from `apps/pwa`, they do a dry run unless given `--apply`, and the console
doesn't need to reproduce them:

| Command | What it does |
|---|---|
| `bun run backfill:codes` | Fills in access codes that lack fields the claim rule reads. |
| `bun run repair:members` | Fixes members whose `programId` is empty. |
| `bun run backfill:roster` | Writes a leaderboard row for members who have none. |
| `bun run exercise-video` | Sets or clears one exercise's demo video. |
| `bun run seed:program` | Writes a program, its weeks, days and guides, and a cohort, from the fixture in `apps/pwa/app/data/program.ts`. |
| `bun run migrate:weeks` | Converts programs from the old flat `workoutDays` shape to weeks. |

---

## 4. Cohorts

A cohort, `cohorts/{cohortId}`, is one run of the challenge: its members, its
coach, its program and its chat.

### The cohort document

"Watched" means the member app listens to the field, so a change reaches open
apps without a reload.

| Field | Type | Read by | Notes |
|---|---|---|---|
| `name` | string | Member app (chat), `createAccessCode` | For example `Cohort 01`. Copied onto codes as `cohortName`. |
| `status` | `'draft'` \| `'active'` \| `'archived'` | `createAccessCode` | Codes can't be issued for an `archived` cohort. The member app doesn't read it. |
| `startDate`, `endDate` | Timestamp | Scripts | The member app's calendar comes from the program's weeks, not these. The seed and migration scripts place week 1 on `startDate`. |
| `durationWeeks` | number | | |
| `timezone` | string | Scripts, and you | An IANA zone such as `Africa/Lagos`. Build live-call times in it. |
| `coach` | map | Member app, watched | `{ uid, name, title, avatarUrl }`. See below. |
| `programId`, `programName`, `programVersion` | string, string, number, or `null` each | `createAccessCode`; member app as a fallback | Must be set before codes can be issued. |
| `liveCall` | map or `null` | Member app, watched | See below. |
| `leaderboardVisible` | boolean | Member app, watched | See below. |
| `leaderboardRevealWeek` | number | Member app, watched | See below. |
| `memberCount` | number | Nothing | See below. |
| `archivedAt` | Timestamp or `null` | | |
| audit fields | | | |

### The coach

`coach` is copied onto the cohort rather than looked up. Members see it on the
private coach thread's header and in the @mention suggestions in the cohort
chat.

- **`uid` must be the Auth uid the coach uses in the console.** Members
  @mention the coach by this uid, and replies to the coach go to the
  `authorUid` on the coach's messages. If the two differ, any coach inbox
  misses one or the other.
- `avatarUrl` is an `https://` image URL, or `''` for none.
- Renaming the coach here doesn't rename past messages, which keep the
  `authorName` they were sent with.

### The weekly live call

`liveCall` is `{ startsAt, durationMinutes, joinUrl }`. The member app shows a
card on Home on the day of the call, and the join button works from `startsAt`
for `durationMinutes`. The call repeats every 7 days from `startsAt` until it
is cleared. The essentials are below; the full detail is in
[FIREBASE.md → The weekly live call](FIREBASE.md#the-weekly-live-call).

- **`startsAt` must be a Timestamp built in the cohort's `timezone`,** not the
  admin's browser zone. `new Date('2026-09-16T21:00')` means 9 PM wherever the
  admin's laptop is. Use `fromZonedTime(input, cohort.timezone)` from
  `date-fns-tz`, or an explicit offset such as `+01:00` for Lagos.
- **There is no card unless both `startsAt` and `joinUrl` are set.**
- `joinUrl` must start with `https://`. `durationMinutes` must be 1–1440;
  anything else reads as 60.
- Set it once; any occurrence works. To skip a week, move `startsAt` to the
  occurrence after it. To stop the calls, set `joinUrl` to `null`.
- Keep all three keys present, set to `null` when empty. No rule checks the
  shape, so validate before writing.
- It keeps repeating after the cohort's `endDate` until the admin clears it.

### The leaderboard switch

- `leaderboardVisible: true` shows the leaderboard tab under Rewards. `false`,
  or a missing field, hides the tab entirely. It is meant to stay off for the
  opening weeks.
- `leaderboardRevealWeek` is the last challenge week in which a "the
  leaderboard's live now" card appears above the board. It doesn't affect
  visibility, and it reads as 1 when missing.
- The board's data is written the whole time, so turning it on shows real
  history.
- It is a display switch, not access control. Members can always read the
  counts, because chat's @mention list reads the same collection.

### `memberCount`

Nothing maintains it and nothing reads it. If the console wants a count,
count the cohort's leaderboard rows with `getCountFromServer`, or maintain the
field from an Admin SDK trigger on member create and delete.

### Creating a cohort

1. Create its program first (section 5), with the weeks dated from the
   cohort's start.
2. Create the cohort with:
   - `status: 'draft'`
   - `coach`, `timezone`, and `programId`, `programName` and `programVersion`
   - `liveCall: { startsAt: null, durationMinutes: 60, joinUrl: null }`
   - `leaderboardVisible: false` and a `leaderboardRevealWeek`
   - `memberCount: 0` and `archivedAt: null`
   - the audit fields
3. Issue codes, which works while it is a draft, and set `status: 'active'`
   when it opens.
4. If paid sales should go into it, change the landing site's cohort variable
   (section 2).
5. To close it, set `status: 'archived'` and `archivedAt`. That stops new codes
   being issued. Existing members keep their access.

---

## 5. Programs

`programs/{programId}` and everything under it is the training plan: the
schedule, the exercises, the guides and the reward economy. Members read it,
and only admins write it.

**Edits are live.** The member app reads `programs/{member.programId}`
directly each time it loads. Despite the `programVersion` on cohorts and codes,
there is no per-cohort snapshot. Changing a program changes it for every cohort
and member on it, from their next app load. `version` is only recorded on each
logged session, as a note of which plan it was logged against.

**Use one program per cohort run.** The schedule's dates live in the program's
weeks, so a second cohort on the same plan a month later needs its own program
id (`recomp-six-week-v2`, or one per cohort), with its cohort's `programId`
pointing at it. Copying a program means copying the program document, its
`weeks`, each week's `days`, and its `guides`.

### The program document

| Field | Type | Notes |
|---|---|---|
| `name` | string | |
| `version` | number | Recorded on sessions. Bump it when the plan changes meaningfully. |
| `status` | `'draft'` \| `'published'` | The member app doesn't read it. |
| `totalWeeks`, `totalDays`, `sessionsPerWeek` | number | Descriptive only. The member app works from the weeks and days. |
| `qualifyingSetPercent` | number | The share of a session's prescribed sets that must be logged for the session to earn anything, such as `80`. The whole reward system depends on it. |
| `rewards` | map | The reward economy; see below. **Required.** Without it nothing earns points. |
| `publishedAt` | Timestamp or `null` | |
| audit fields | | |

`rewards` holds every number the reward system uses. These are the values the
current program uses, for a plan of 6 weeks × 4 sessions:

```ts
{
  values: { workout: 25, checkIn: 20, progressPhoto: 5, core: 5, cardio: 5 }, // RP per action
  badgeTierPoints: { starter: 15, consistency: 25, elite: 45 },               // RP per badge, by tier
  badgeTargets: {
    dayRepeats: 3,                            // Consistency Queen: every training day this many times
    checkInWeeks: 4,                          // Check-In Streak: this many weeks in a row
    foundationWeek: 3, foundationSessions: 8, // Foundation Complete
    peakWeek: 6, peakSessions: 20,            // Peak Performer
  },
  ranks: [
    { id: 'new-entry', name: 'New Entry', emoji: '🌱', minPoints: 0 },
    // …
  ],
  badges: [
    { id: 'first-workout', name: 'First Rep', emoji: '💪',
      description: 'Log your first qualifying workout.', tier: 'starter' },
    // …
  ],
}
```

- **Badge ids are fixed.** Each badge's condition is code in the member app,
  keyed by `id`: `first-workout`, `first-photo`, `consistency-queen`,
  `checkin-streak-4`, `foundation-complete`, `peak-performer`, `no-days-off`
  and `final-photo`. The console can edit a badge's `name`, `emoji`,
  `description` and `tier`, but a badge with any other id never unlocks. The
  app adds `final-photo` itself when the list lacks it.
- **Ranks** must include one with `minPoints: 0`, because every member holds at
  least the lowest rank.
- The `core` and `cardio` values aren't awarded yet.
- Changing point values affects points earned from then on. Points already
  earned aren't recalculated.
- The full reference values are in `apps/pwa/app/data/program.ts`.

### Weeks

`programs/{programId}/weeks/{weekId}`, with ids `week-1`, `week-2` and so on by
convention.

| Field | Type | Notes |
|---|---|---|
| `weekNumber` | number | Starts at 1. This orders the weeks; the id doesn't. |
| `title`, `subtitle` | string | Such as "Overload" and "Push intensity, prove the work". An empty `title` shows "Week 3" on its own. |
| `startDate`, `endDate` | string | **`YYYY-MM-DD`**, inclusive. A week covers its whole span, rest days included. |
| audit fields | | |

The current week is a date comparison: it is the latest week whose `startDate`
has arrived. This is the cohort's calendar and the same for every member, so
someone who joins in week 3 starts in week 3.

### Days

`programs/{programId}/weeks/{weekId}/days/{dayId}` is one training day in one
week.

| Field | Type | Notes |
|---|---|---|
| `weekNumber` | number | Must match the parent week's. |
| `date` | string | `YYYY-MM-DD`, inside the week's span. The day opens on this date and stays open until the week ends. |
| `dayNumber` | number | The "Day 2" on the card. |
| `label` | string | Such as "Upper (Push Focus)". |
| `focus` | string | Such as "Upper · Push". |
| `heroImage` | `StoredImage` or `null` | The photo behind the day's card on Home. `null` shows the brand gradient, which is a complete card. |
| `estimatedMinutes`, `estimatedKcal` | number | |
| `proofRequired` | boolean | |
| `optional` | boolean | `true` keeps the day out of the weekly quota, as with the core and cardio finisher. |
| `exercises` | array | 1–20 entries; see below. |
| audit fields | | |

- **Reuse day ids across weeks.** Week 1's quad day and week 4's are both
  `day-1`. The "every training day N times" badge counts sessions by day id,
  and a session resumed across a week boundary finds its day by id.
- **Keep dates as strings.** A training day is a date, not an instant. Midnight
  in Lagos is 23:00 the previous evening in UTC, so a Timestamp reads back a
  day early anywhere it is shown in UTC. Use a date picker that produces
  `YYYY-MM-DD` without going through `Date`.
- **Validate before saving.** A week or day with malformed dates is dropped
  from the schedule, and the only trace is a warning in the member's browser
  console.

### Exercises

Each entry in a day's `exercises`:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Unique within the day. |
| `name` | string | |
| `muscleGroup` | string | Such as "Chest", "Quads", "Core" or "Cardio". |
| `targetSets` | number | Shown on the card. Keep it equal to the length of `sets`. |
| `targetReps` | string | Free text, such as "8-10", "10 each" or "30s on / 30s off". |
| `restSeconds` | number | |
| `sets` | array | One `{ reps: number, weightKg: number \| null }` per prescribed set, with `null` weight for bodyweight or timed moves. **The length of this array is what the qualifying threshold counts.** |
| `cues` | string[] | Coaching cues on the How to tab. |
| `videoUrl` | string or `null` | The demo clip; see below. |
| `videoThumbUrl` | string or `null` | A poster frame shown before the clip plays. |

**Demo videos.** `videoUrl` must be an `https://` link to the video file
itself, not a YouTube, Vimeo or Google Drive page. MP4 (H.264) plays
everywhere. The file can be hosted anywhere: UploadThing, a storage bucket or a
CDN. `null` shows "Video coming soon". The rules refuse any other value, and
they cap a day at 20 exercises. Each week's day is its own document, so a video
set on week 1's `day-1` doesn't appear on week 4's.

### Hero images

A `StoredImage` is `{ storagePath, downloadUrl, width, height, bytes }`. Upload
the image under `programs/{programId}/` in the bucket for the environment, and
store both the path and the download URL. Storage refuses client writes under
`programs/`, so upload through the Admin SDK; `getDownloadURL` in
`firebase-admin/storage` gives the URL. Members can read everything under
`programs/`.

### Guides

`programs/{programId}/guides/{guideId}`:

| Field | Type | Notes |
|---|---|---|
| `title` | string | |
| `category` | string | The filter chips are the distinct categories in use. |
| `readMinutes` | number | |
| `unlockWeek` | number | The guide is hidden until the cohort reaches this week. |
| `excerpt` | string | |
| `body` | string | Steps separated by a blank line (`\n\n`). Each becomes one step on screen. Plain text. |
| audit fields | | |

---

## 6. Announcements and notifications

The member app has an in-app inbox behind a bell icon, and an announcement deck
on Home. The console writes both.

### How members receive notifications

The member app watches three things for as long as it is open:

| Source | What shows up in the inbox |
|---|---|
| `cohorts/{cohortId}/notifications` | Every document, as written by the console. |
| `cohorts/{cohortId}/threads/cohort/messages` | Messages whose `addressedUids` contains the member: they were @mentioned, or someone replied to them (section 7). |
| `cohorts/{cohortId}/threads/cohort/messages` | The member's own messages that have a `reactedAt`, because someone else reacted. There is one line per message, however many people reacted (section 7). |

A new document appears in the inbox and lights the bell within a second or
two.

- **This is not a phone push notification.** Nothing reaches a member whose app
  is closed. They see the notification the next time they open the app.
- **Read state belongs to the member app.** It lives at
  `members/{uid}/notificationState/{notificationId}`. The console never reads
  or writes it.
- **The app doesn't turn announcements into notifications.** Posting a card to
  the deck and telling the cohort about it are two separate writes, and the
  console has to make both.

### Posting an announcement

When the admin posts an announcement, write a notification in the **same
batch**, so members never get one without the other.

**Announcement document:** `cohorts/{cohortId}/announcements/{autoId}`

| Field | Type | Notes |
|---|---|---|
| `eyebrow` | string | The small label above the title, such as "Live call". |
| `title` | string | Such as "Q&A with Coach Dayo · Sat 10am". |
| `body` | string | Plain text. |
| `cta` | string or `null` | The button label, or `null` for no button. |
| `ctaUrl` | string or `null` | A path in the app such as `/train`, or an `https://` link. Ignored when `cta` is `null`. |
| `accent` | `'rose'` \| `'orange'` \| `'ink'` | The card colour. The names are from an older palette: `rose` renders as the primary purple and `orange` as the violet. |
| `publishedAt` | Timestamp | `serverTimestamp()`. |
| audit fields | | Created and updated. |

**Notification document:** `cohorts/{cohortId}/notifications/{autoId}`

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | `'coach'` \| `'workout'` \| `'reward'` \| `'community'` \| `'checkin'` | yes | Use `'coach'` for announcements. `'coach'` is styled orange; every other type is rose. |
| `title` | string | yes | The short label above the text, such as `"New announcement"`. |
| `body` | string | yes | The main line. Use the announcement's headline. Plain text; no markdown. |
| `publishedAt` | **Timestamp** | yes | Use `serverTimestamp()`. See the warnings below. |
| `pinned` | boolean | yes | `false` unless it should stay at the top. **Always set it.** |
| `icon` | string | yes | One of the icon names listed below. |
| `createdAt` | Timestamp | yes | `serverTimestamp()` |
| `createdByUid` | string | yes | The admin's auth uid. |
| `createdByEmail` | string | yes | The admin's email. |

**Icon names the app can draw:** `bell`, `info`, `chat`, `message`, `reply`,
`phone`, `calendar`, `clock`, `star`, `heart`, `trophy`, `flame`, `train`,
`activity`, `trendingUp`, `checkCircle`, `camera`, `image`, `target`, `fuel`,
`guides`, `user`, `lock`. An unknown name falls back to `info`.

The example uses the modular web SDK. With the Admin SDK the same fields
apply, using `FieldValue.serverTimestamp()` and `db.batch()`.

```ts
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore'

async function publishAnnouncement(db, cohortId, admin, card) {
  const now = serverTimestamp()
  const created = { createdAt: now, createdByUid: admin.uid, createdByEmail: admin.email }
  const updated = { updatedAt: now, updatedByUid: admin.uid, updatedByEmail: admin.email }

  const batch = writeBatch(db)

  // The card on the deck.
  batch.set(doc(collection(db, 'cohorts', cohortId, 'announcements')), {
    eyebrow: card.eyebrow,
    title: card.title,
    body: card.body,
    cta: card.cta ?? null,
    ctaUrl: card.ctaUrl ?? null,
    accent: card.accent,
    publishedAt: now,
    ...created,
    ...updated,
  })

  // The line in every member's inbox.
  batch.set(doc(collection(db, 'cohorts', cohortId, 'notifications')), {
    type: 'coach',
    title: 'New announcement',
    body: card.title,
    icon: 'bell',
    pinned: false,
    publishedAt: now,
    ...created,
  })

  await batch.commit()
}
```

### Things that will silently break it

- **`publishedAt` must be a Firestore Timestamp.** The member app calls
  `.toMillis()` on it to sort and label the inbox. A string or a number throws
  there, and the inbox and bell break for every member of the cohort until the
  document is fixed.
- **`pinned` and `publishedAt` must both be present.** The app's query orders
  by both, and Firestore leaves out any document missing an `orderBy` field.
  The notification is simply never delivered, with no error.
- **Use auto-generated ids, and never start an id with `chat-`.** Read markers
  for mentions, replies and reactions are stored as `chat-{messageId}` and
  `chat-{messageId}-reactions` in the same collection, so a colliding id would
  share their read state.

### Behaviour to expect

- **Order:** pinned notifications first, then newest first.
- **Limit:** only the 50 newest are delivered, and pinned ones count toward the
  50.
- **Audience:** a notification reaches every member of the cohort. There is no
  per-member targeting.
- **Not tappable.** Coach notifications don't link anywhere. The inbox has a
  "See the full announcement deck" link underneath the list.
- **Editing doesn't notify again.** Read state is keyed by document id, so
  changing a notification a member has already read leaves it read. To tell
  people again, create a new document.
- **Deleting removes it from every inbox.**
- **No scheduling.** A `publishedAt` in the future appears immediately,
  labelled "Just now".
- **The deck updates live.** A new announcement appears on the deck without a
  reload. The deck shows the 20 newest by `publishedAt`.

---

## 7. Coach chat

Each cohort has two kinds of thread, both at
`cohorts/{cohortId}/threads/{threadId}/messages/{messageId}`:

- `threadId` `cohort` is the group chat.
- A `threadId` that is a member's uid is that member's private thread with the
  coach.

The member app reads the newest 200 messages of a thread, live. The Chat tab
shows a dot when a thread's newest message is one the member hasn't seen.

The console needs a view of the cohort thread and of each member's private
thread, and a way to send, edit and delete coach messages with replies,
mentions and attachments, and to react. A typing indicator and a coach inbox
are optional.

**Under today's rules, the coach can't post a message through the client
SDK.** The create rule requires `isCoach == false` and has no coach branch.
Post through the Admin SDK, or add a coach branch to the rules
([section 8](#admin-branches-you-could-add-instead)). The fields below are
required either way.

### Message document

| Field | Type | Notes |
|---|---|---|
| `authorUid` | string | The coach's Auth uid. It must match `cohorts/{cohortId}.coach.uid`. |
| `authorName` | string | The name members see on the coach's messages. |
| `authorAvatarUrl` | string | `''` if none. |
| `isCoach` | boolean | `true` for coach messages. It gives them the coach's styling. |
| `text` | string | May be `''` for a photos-only message. |
| `sentAt` | Timestamp | `serverTimestamp()` or `Timestamp.now()`. |
| `editedAt` | Timestamp \| null | `null` on send. |
| `attachments` | array | `{ id, kind: 'image' \| 'file', name, bytes, mimeType, storagePath, downloadUrl }`. See [Attachments](#attachments). |
| `replyTo` | object \| null | The message being answered. See below. |
| `mentions` | array | `{ uid, name }` for each person @mentioned. See below. |
| **`addressedUids`** | string[] | Everyone this message is aimed at. See below. |
| `reactionCounts` | map | `{}` on send. |
| `reactors`, `reactedAt` | | **Leave both out on send.** See [Reactions](#reactions). |

```ts
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'

await addDoc(collection(db, 'cohorts', cohortId, 'threads', threadId, 'messages'), {
  authorUid: coach.uid,
  authorName: coach.name,
  authorAvatarUrl: coach.avatarUrl ?? '',
  isCoach: true,
  text,
  sentAt: serverTimestamp(),
  editedAt: null,
  attachments: [],
  replyTo,                                                   // or null
  mentions,                                                  // or []
  addressedUids: addressedUidsOf({ authorUid: coach.uid, mentions, replyTo }),
  reactionCounts: {},
})
```

### `addressedUids`

Members get a notification when someone @mentions them or replies to one of
their messages in the cohort chat. The app finds those messages with a query
on `addressedUids`, so **a coach message without that field notifies nobody**,
even if it mentions someone or replies to them.

To compute it, take everyone in `mentions`, add the author of the message
being replied to, remove the sender, and list each uid once. This is the same
function the member app uses:

```ts
function addressedUidsOf({ authorUid, mentions, replyTo }) {
  const uids = new Set((mentions ?? []).map((m) => m.uid).filter(Boolean))
  if (replyTo?.authorUid) uids.add(replyTo.authorUid)
  uids.delete(authorUid)
  return [...uids]
}
```

### `mentions`

- Each entry is `{ uid, name }`, and `name` must match **exactly** what follows
  the `@` in `text`. For `"Great work @Tomi A."` the entry is
  `{ uid: '…', name: 'Tomi A.' }`. The app highlights names by searching the
  text for `@{name}`.
- Take uids and names from the cohort roster at
  `cohorts/{cohortId}/leaderboard/{uid}`. The document id is the member's uid,
  and `name` is their display name.
- List each uid once. Before sending, drop any mention whose `@name` is no
  longer in the text.

### `replyTo`

A snapshot of the message being answered, not just a pointer to it:

```ts
{
  messageId: original.id,
  authorUid: original.authorUid,       // this is who gets notified
  authorName: original.authorName,
  text: excerpt,                        // original.text trimmed; if over 140 chars,
                                        // the first 140 plus "…"
  attachmentKind: original.text.trim() ? null : (original.attachments[0]?.kind ?? null),
}
```

A quote is a record of what was said, so it survives the original being
deleted.

### Editing and deleting

- **Editing:** write `text`, `mentions`, `addressedUids` and
  `editedAt: serverTimestamp()` together, recomputing `addressedUids` whenever
  `text` or `mentions` changes. A mention removed in an edit then disappears
  from that member's inbox, and one added appears. Members can edit their own
  messages for 15 minutes. The rules put no time limit on the coach, and the
  app shows "Edited" either way.
- **Deleting and moderation:** the coach can delete any message in any thread
  through the client SDK. Its attachments stay in Storage under
  `chat/{cohortId}/{authorUid}/`; delete them through the Admin SDK if they
  should go too.

### Attachments

Members upload to `chat/{cohortId}/{uid}/…` in Storage. Everyone else opens an
attachment through the `downloadUrl` on the message, which no rule governs.
Storage accepts uploads only from a member under their own uid, so upload coach
attachments through the Admin SDK to `chat/{cohortId}/{coachUid}/…`, and store
the download URL.

Match the member app's limits: at most 4 attachments per message, 800 KB each.
`kind: 'image'` renders inline, and anything else renders as a downloadable
chip.

### Reactions

Members are told when someone reacts to one of their cohort messages. The
inbox reads two fields on the message, not the `reactions` subcollection, so
**a coach reaction that updates only `reactionCounts` notifies nobody.**

A reaction is three writes in one transaction:

- `reactionCounts.{emoji}`, incremented or decremented;
- the reactor's own document at `…/messages/{messageId}/reactions/{uid}`,
  `{ emojis: string[], updatedAt }`;
- `reactors` and `reactedAt` on the message, as described below.

**Under today's rules the coach can't write `reactions/{coachUid}`.** That
rule requires a member of the cohort. Run coach reactions through the Admin SDK,
or add a coach branch (section 8).

| Field | Type | Notes |
|---|---|---|
| `reactors` | map | uid → `{ name, at }`, with one entry for each person other than the author who has at least one reaction on the message. `at` is a Timestamp. |
| `reactedAt` | Timestamp | When someone last went from no reaction to some. |

Decide what to write from the coach's emojis before and after the toggle:

| Coach's emojis | Author is the coach? | Also write |
|---|---|---|
| none → some | no | `reactors.{coachUid}` = `{ name: coach.name, at: serverTimestamp() }`, and `reactedAt` = `serverTimestamp()` |
| some → none | no | delete `reactors.{coachUid}` |
| some → some, or the coach wrote the message | | nothing |

```ts
import { FieldPath, deleteField, serverTimestamp } from 'firebase/firestore'

// Inside the transaction, after reading the message and the coach's reactions doc.
const listed = coach.uid in (message.reactors ?? {})
const reacting = nextEmojis.length > 0
const reactor =
  message.authorUid === coach.uid || listed === reacting
    ? []
    : reacting
      ? [new FieldPath('reactors', coach.uid), { name: coach.name, at: serverTimestamp() },
         'reactedAt', serverTimestamp()]
      : [new FieldPath('reactors', coach.uid), deleteField()]

tx.update(messageRef, new FieldPath('reactionCounts', emoji), countChange, ...reactor)
```

- **Only a new reactor dates the message.** A second emoji, or one taken back,
  leaves `reactedAt` alone, so the member isn't notified again.
- **Never set `reactedAt` to `null`.** Leave it out instead. The inbox query
  orders by it, and a `null` would put a message nobody reacted to in the
  inbox.
- **Use the coach's own uid and display name.** The member rules hold members
  to their own entry, their own name and the server time. Nothing enforces
  that for the coach, so the console has to.
- **Older reactions aren't recorded.** Reactions made before `reactors`
  existed have no entry. Nobody is notified about them, and a later reaction
  counts only the people recorded since.

### Typing indicator (optional)

To show "Coach is typing…", write `{ name, at: serverTimestamp() }` to
`…/threads/{threadId}/typing/{coachUid}` while the coach is typing, refresh it
every 4 seconds, and delete it when they stop. The member app ignores a marker
older than 10 seconds. The rules allow this through the client SDK.

### A coach inbox (optional)

`addressedUids` also lets the console list messages aimed at the coach. It
needs no new index, since it uses the one in section 8:

```ts
query(
  collection(db, 'cohorts', cohortId, 'threads', 'cohort', 'messages'),
  where('addressedUids', 'array-contains', coachUid),
  orderBy('sentAt', 'desc'),
  limit(50),
)
```

### Things to know

- **Only the cohort thread notifies.** Messages in a member's private coach
  thread never reach the inbox. Every message there is already for that
  member, and the Chat tab shows a dot for it. Setting `addressedUids` there is
  harmless but does nothing.
- **Older messages don't notify.** Anything sent before `addressedUids`
  existed lacks the field and never appears in an inbox. This is intended.

---

## 8. Rules, indexes and deploys

### One set of rules, shared by both apps

The rules and indexes live in this repo:

| File | Applies to |
|---|---|
| `firestore.rules` | the `(default)` database |
| `firestore.staging.rules` | the `staging` database. It is identical to `firestore.rules` today, which `bun run rules:diff` confirms. |
| `storage.rules` | both buckets |
| `firestore.indexes.json` | both databases |

There is one rules document per database, and whoever deploys last replaces
the whole of it. The console repo shouldn't keep or deploy its own copies. Any
rule or index the console needs is a change to these files, made in this repo
and applied to both Firestore rules files.

### `firestore.rules.proposed` is out of date. Don't deploy it

The file was written to merge an earlier console ruleset into the member
rules, and the member app has changed since. Deployed as it is, it would break
the member app:

1. **It has no `weeks`, `days` or `guides` rules.** It still models the old
   flat `workoutDays` and `weekThemes` shape, so members couldn't read their
   schedule or their guides.
2. **It has no `announcements`, `typing`, `registrations` or
   `unmatchedSales` rules.** Rules deny anything unmatched, so the deck, typing
   indicators and the console's sales queue would all be refused.
3. **Its messages `update` rule allows only `reactionCounts`.** Member edits
   would be refused, and it lacks `addressedUids`, `reactors`, `reactedAt` and
   `movesOnlyOwnReactor()`.
4. **Its cohort edit rule doesn't allow `liveCall`, `leaderboardVisible` or
   `leaderboardRevealWeek`,** so the console couldn't run the live call or the
   leaderboard switch.
5. **It lets admins write access codes directly.** Codes are now created only
   by `createAccessCode`, because hand-written codes were missing fields and
   couldn't be redeemed.

Treat `firestore.rules` as the base. Take only individual admin branches from
the proposed file, as listed below.

### Admin branches you could add instead

If the console should do any of these through the client SDK rather than a
server, the rules need a change first:

| To let the console | Change |
|---|---|
| Post coach messages | A coach branch on the messages `create` rule. See below. |
| React as the coach | Allow the coach to write `…/reactions/{reactorId}` when `reactorId == request.auth.uid`. |
| Read members for support | Coach read on `members/{uid}` and on its `sessions`, `checkIns`, `photos` and `lifecycleEvents`. The proposed file has these. |
| Pause and resume members | `isValidMemberPause()`, `isValidMemberResume()` and the `lifecycleEvents` create rule from the proposed file, adapted to `isCoach()`. |
| Resolve unmatched sales | A coach `update` on `unmatchedSales` limited to `resolved` and the resolution fields. |
| Upload hero images and coach attachments | Coach write paths in `storage.rules` for `programs/{programId}/…` and `chat/{cohortId}/{coachUid}/…`. Storage rules can read the same `request.auth.token.coach` claim. |

A coach branch for messages would look like this, added beside the existing
member branch:

```
allow create: if (
    isCoach()
    && request.resource.data.authorUid == request.auth.uid
    && request.resource.data.isCoach == true
    && request.resource.data.reactionCounts.size() == 0
    && !('reactors' in request.resource.data)
    && !('reactedAt' in request.resource.data)
    && request.resource.data.addressedUids is list
  ) || (
    // … the existing member branch, unchanged …
  );
```

Every one of these changes the member app's security policy, so each should be
reviewed as a change to this repo.

### Indexes

`firestore.indexes.json` has three composite indexes and some field
overrides that the member app depends on:

| Collection | Fields | Used for |
|---|---|---|
| `notifications` | `pinned` descending, `publishedAt` descending | The inbox's coach notifications. |
| `messages` | `addressedUids` array-contains, `sentAt` descending | Mentions and replies in the inbox, and the optional coach inbox. |
| `messages` | `authorUid` ascending, `reactedAt` descending | Reactions in the inbox. |
| `messages.reactionCounts`, `messages.reactors`, `sessions.exercises`, `state.exercises` | Field overrides: not indexed | Keeping write costs down. |

If the console needs a composite index for its own queries, such as codes by
cohort and date or unmatched sales by `receivedAt`, add it to this file. When
deploying indexes, the Firebase CLI offers to delete any index that isn't in
the file being deployed. Deploying from a file without these would turn off
mentions, replies and reactions for every member.

### Deploy order

For any rules or index change the console depends on:

1. Merge the change into `firestore.rules` and `firestore.staging.rules`, and
   into `storage.rules` or `firestore.indexes.json` if they changed.
2. Deploy to both databases. `firebase deploy --only firestore` publishes
   rules and indexes to both, and `--only firestore:staging` publishes to
   staging alone. See "Deploying to one database" in `FIREBASE.md`.
3. Wait for new indexes to finish building. The Firestore console shows
   progress.
4. Release the feature that needs them.

In the other order, the new writes are refused until the rules land, and
queries fail until their index has built.

---

## 9. Not supported today

The console shouldn't promise these, because the member app doesn't do them:

- **Push notifications.** Nothing reaches a member whose app is closed.
- **Targeted notifications.** Every notification goes to the whole cohort.
- **Scheduled announcements.** A future `publishedAt` shows immediately.
- **Program snapshots per cohort.** Program edits are live for everyone on the
  program (section 5).
- **Moving a member to another cohort.** `cohortId` is fixed on the member,
  and their private coach thread lives under the old cohort.
- **A pause that restricts the app.** Pausing is a record only (section 3).
- **Verified scores.** Points and session counts are computed by the member
  app and only shape-checked by the rules, so a determined member can inflate
  their own totals. See
  [FIREBASE.md → The trust boundary](FIREBASE.md#the-trust-boundary).

---

## Checklist

**Setup**

- [ ] Admin accounts have both `coach: true` and `dpfitAdmin: true`.
- [ ] The console knows which database and bucket it is pointed at, and never
      mixes production and staging.
- [ ] The console has a server side on the Admin SDK for the operations in
      [Client SDK or Admin SDK](#client-sdk-or-admin-sdk), or the rule
      changes in section 8 have been made.
- [ ] Every authored document carries the created and updated audit fields.

**Access codes and sales**

- [ ] Codes are issued only through `createAccessCode`, and the console handles
      `reused: true` and each error code.
- [ ] Issued codes are delivered to the person, by email or for the admin to
      copy.
- [ ] Revoking writes only `status`, `revokedAt` and the updated audit fields,
      and claimed codes can't be deleted from the console.
- [ ] Unmatched sales and paid registrations with `emailed == false` are listed
      and can be resolved.

**Members**

- [ ] Pause, resume and complete write the status fields and a lifecycle event
      together.
- [ ] Members still in `onboarding` can't be paused.
- [ ] Removing a member revokes their code and deletes the member document,
      its subcollections, their Storage files and their leaderboard row.
- [ ] Changing a member's email changes Auth and `members/{uid}.email`
      together.

**Cohorts and programs**

- [ ] `coach.uid` matches the Auth uid the coach uses in the console.
- [ ] Live-call times are built in the cohort's `timezone`, and all three
      `liveCall` keys are always present.
- [ ] Every program has a `rewards` block, and badge ids stay within the fixed
      list.
- [ ] Week and day dates are `YYYY-MM-DD` strings, and day ids repeat across
      weeks.
- [ ] Each exercise's `sets` array has one entry per prescribed set, and
      `videoUrl` is `null` or an `https://` link to a video file.
- [ ] Each new cohort run gets its own program id.

**Announcements and notifications**

- [ ] Posting an announcement also creates a `notifications` document, in the
      same batch.
- [ ] Each notification has `type`, `title`, `body`, `icon`, `pinned` (always
      set) and `publishedAt` (a Timestamp), plus `createdAt`, `createdByUid`
      and `createdByEmail`.
- [ ] Notification ids are auto-generated and never start with `chat-`.

**Chat**

- [ ] Coach messages go through the Admin SDK, or through a coach branch added
      to the rules.
- [ ] Coach messages in the cohort thread include `addressedUids`, computed
      with `addressedUidsOf`, and edits recompute it alongside `text` and
      `mentions`.
- [ ] `mentions[].name` matches the text after `@` exactly.
- [ ] Coach reactions write `reactionCounts`, `reactions/{coachUid}`, and
      `reactors` and `reactedAt` in one transaction.
- [ ] Coach attachments are uploaded under `chat/{cohortId}/{coachUid}/`.

**Rules and deploys**

- [ ] `firestore.rules.proposed` is not deployed. Admin branches are added to
      `firestore.rules` and `firestore.staging.rules` instead.
- [ ] The console's own composite indexes are added to this repo's
      `firestore.indexes.json`, and the console repo doesn't deploy rules or
      indexes.
- [ ] Rules and indexes are deployed, and indexes have finished building,
      before the feature that needs them is released.
