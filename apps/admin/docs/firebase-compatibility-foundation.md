# Firebase compatibility foundation

This document is the shared contract between the DP Fit admin console, the
member PWA, the paid landing page, Cloud Functions, and Firestore.

## Registration flow

1. A visitor completes the tour.
2. The visitor enters a code.
3. The PWA performs one unauthenticated `get` of `accessCodes/{CODE}`.
4. The PWA checks that the code is unused, unexpired, and correctly shaped.
5. The visitor creates a Firebase email/password account.
6. One Firestore transaction changes the code from `unused` to `claimed` and
   creates `members/{uid}`.

An access code is the pre-authentication capability. Firestore permits `get`
on a known code document but never permits an unauthenticated collection
`list`. This is an intentional interim trade-off: the complete code document,
including bound contact fields, is visible to anyone who knows that code.
A future `checkAccessCode` callable should return only validation fields.

## Canonical access-code document

`accessCodes/{code}` is keyed by the uppercase code itself.

```yaml
code: DPF-XXXX-XXXX
batchId: console-2026-09-xxxxxxxx
status: unused                 # unused | claimed | revoked

cohortId: string
cohortName: string
programId: string
programVersion: 1

issuedToEmail: null            # null means any authenticated email may claim
issuedToWhatsapp: null         # copied to the member profile when present

claimedByUid: null
claimedByName: null
claimedAt: null
revokedAt: null

expiresAt: Timestamp
createdAt: Timestamp
createdByUid: string
createdByEmail: string
updatedAt: Timestamp
updatedByUid: string
updatedByEmail: string
```

Every nullable field must exist. In particular, omitting `issuedToEmail` is not
equivalent to setting it to `null`: the PWA rejects an incomplete document and
rules that read an absent field fail closed.

`claimedByUid` is canonical. Do not create new `claimedByMemberId` fields.

## The one code writer

`createAccessCode` in `functions/` is the only writer. Client Firestore rules
deny all `accessCodes` creates; the function writes through the Admin SDK.

Admin batch request:

```json
{
  "database": "staging",
  "cohortId": "...",
  "expiryDays": 30,
  "quantity": 10
}
```

The admin must have the Firebase custom claim `dpfitAdmin: true`. The response
contains `codes: string[]`. Recipient fields are stored as `null`.

Paid landing-page request:

```json
{
  "database": "staging",
  "cohortId": "...",
  "expiryDays": 30,
  "email": "buyer@example.com",
  "whatsapp": "+234..."
}
```

The landing server sends a Google-signed identity token for the configured
registration service account in `X-Service-Token`. It uses the Firebase
callable wire format (`{"data": ...}`), not a browser credential. Recipient
mode creates exactly one code and preserves the previous `{ code, reused, ... }`
response shape.

Both modes read the cohort rather than trusting caller-supplied labels. The
function stamps `cohortName`, `programId`, and `programVersion` from that
source document. It is capped at two concurrent instances and twenty codes per
admin call.

## Shared document conventions

- Member identity lives at `members/{firebaseAuthUid}`.
- A member's entitlement fields (`accessCode`, `cohortId`, `programId`, and
  `programVersion`) are immutable after registration.
- Lifecycle history lives at
  `members/{uid}/lifecycleEvents/{eventId}` and is append-only.
- Programs contain a `rewards` map. Newly created programs start with an
  explicit zero-value economy; real reward values must be authored rather than
  guessed.
- Workout days contain `heroImage`, with `null` meaning the PWA uses its normal
  fallback treatment.
- Cohorts contain `endDate`, `coach`, `liveCall`, `leaderboardVisible`, and
  `leaderboardRevealWeek` in addition to their pinned program fields.
- Member-facing cohort data is readable only by members of that cohort.
- Member source documents are private. The leaderboard is a deliberately
  reduced cohort projection, not a cross-member read of `members`.

## Database selection

The project has separate `(default)` and `staging` Firestore databases. A
database id is not inferred from build mode.

- Local admin development uses `VITE_FIREBASE_DATABASE_ID=staging`.
- The callable request includes the same database id.
- Production must explicitly choose `(default)` or `staging` in its own
  environment.
- `firebase.json` deploys the same canonical rules file to both databases.

## Rules ownership

Firestore has one active ruleset per database. The admin and PWA repositories
cannot safely deploy different rule files to the same database.

The merged compatibility rules are deployed to the named `staging` database;
the `(default)` database remains unchanged. See
`docs/firestore-rules-merged-candidate.md` for the implemented differences,
test evidence, deployment record, and remaining rollout checks. The pre-merge
staging baseline was ruleset `96307f9a-438a-4b22-87c9-98acb6499ebd`; its
snapshot file was removed and remains in git history.

Before either repository deploys Firestore rules, the reviewed merged rules
must be synchronized between them, or rules deployment must be owned by one
release process. A last-writer-wins rules deploy can otherwise break either
admin operations or member registration without a code change in the affected
app.

Run the local regression suite before any rules deploy:

```bash
npm run firestore:rules:test
```

Firebase CLI 15 requires Java 21 or newer for the Firestore emulator.

## Rollout order

1. Backfill existing access-code documents with `issuedToEmail`,
   `issuedToWhatsapp`, `programId`, `programVersion`, and `claimedByUid`.
2. Deploy the updated `createAccessCode` function.
3. Merge admin access onto the exact deployed PWA rules and run the combined
   emulator suite.
4. Deploy the reviewed rules to `staging` only.
5. Deploy the admin console configured for `staging`.
6. Exercise one disposable anonymous code through the PWA registration flow.
7. Exercise one disposable email-bound code with a matching and a mismatching
   account.
8. Only after the smoke tests pass, promote the rules to `(default)`, point
   paid fulfilment at the shared
   function and remove its direct access-code writer.

Do not deploy the stricter rules before the function: browser-side code creates
are denied by design.

## Known next hardening steps

- Replace pre-auth document reads with a minimal `checkAccessCode` callable.
- Move points, badge awards, session qualification, and member-count changes
  behind trusted functions; current member writes can still inflate their own
  reward totals.
- Add App Check and rate limiting after the registration path is stable.
- Add constrained Cloud Storage support for admin-authored workout hero images.
  Current Storage rules intentionally allow signed-in member reads while
  denying every browser write to program artwork.

## Admin authoring coverage

The admin console now provides draft-only program editors for week themes,
reward values, badge thresholds and definitions, the rank ladder, and program
guides. New program drafts record explicit `weekThemesConfigured` and
`rewardsConfigured` readiness flags, and the console will not publish until
both areas have been reviewed and saved.

Cohort settings now cover the member-facing `coach`, `liveCall`,
`leaderboardVisible`, and `leaderboardRevealWeek` fields. The existing staging
cohort still needs its preferred coach identity saved through that screen; the
console supplies a generic draft value but does not guess and persist a real
person's identity.
