# Firestore rules: deployed state vs proposed compatibility rules

Review date: 2026-09-18

No Firestore rules were deployed as part of this review.

## Why the admin console says “Access codes unavailable”

The console is connected to the named `staging` Firestore database. Its
access-code screen starts a collection query so it can show the inventory.

The authenticated admin has the custom claim:

```yaml
dpfitAdmin: true
```

The deployed staging rules authorize that query with a different legacy
claim:

```firestore
function isCoach() {
  return request.auth != null && request.auth.token.coach == true;
}

match /accessCodes/{code} {
  allow get: if true;
  allow list: if isCoach();
}
```

Because the token does not contain `coach: true`, Firestore returns
`permission-denied`. The UI converts that failure to “Access codes
unavailable.” This is a rules/claim mismatch, not a failed Firebase connection
and not a failure of the deployed `createAccessCode` Function.

Adding `coach: true` to the admin would make the current query work, but it
would also grant every broad coach permission in the live rules, including
unrestricted program/cohort writes and access-code deletion. The safer fix is
to merge the admin claim into the rules deliberately.

## Exact deployed baseline

The Firebase Rules API was read directly using Application Default
Credentials.

| Database | Deployed ruleset | Lines | SHA-256 |
| --- | --- | ---: | --- |
| `(default)` | `ea34227f-da9b-474d-9f0b-0d0cf58181cb` | 695 | `59a5e28c074be96eff043809e4817d0d5a20f5091478c57f21de2ff94323124c` |
| `staging` | `96307f9a-438a-4b22-87c9-98acb6499ebd` | 700 | `0d439cd0fe11bf567cda01b1676a18a7f8ecb4f5d542f5172a4c867f3ffb60cd` |

The only semantic difference between those two deployed releases is code
creation:

```diff
- // default
- allow create, delete: if isCoach();

+ // staging
+ allow create: if false;
+ allow delete: if isCoach();
```

Neither deployed file matches the 300-line rule files currently checked into
the PWA repository. The Firebase deployment is therefore the authoritative
baseline for this merge.

## Current deployed behavior vs the local proposed file

The “proposed” column refers to this admin repository's current
`firestore.rules`. It was compile-tested in isolation, but it must not be
deployed as-is because it does not contain several protections and collection
paths already used by the live PWA.

| Area | Current deployed rules | Current local proposal | Review finding |
| --- | --- | --- | --- |
| Privileged identity | `coach: true` | `dpfitAdmin: true` | This mismatch causes the current admin error. A merged helper should temporarily accept either trusted claim while the system migrates to one name. |
| Member session security | Requires the latest recorded sign-in, matching member email, and a trusted password/email-link/verified-Google sign-in | Requires only `request.auth != null` | Keep the deployed `signIns`, `onLatestSignIn`, `keepsMemberEmail`, and `trustsSignIn` protections. |
| Pre-auth code check | Anonymous `get` allowed; collection `list` denied unless coach | Same model, but list requires admin | Keep public single-document `get`; permit `list` only to the privileged operator helper. |
| Code creation | Staging denies client creation; default still permits coach creation | Denied for every client; Function is the only writer | Adopt the proposal for both databases: `allow create: if false`. |
| Code deletion | Coach may delete | Denied | Adopt the proposal. Revocation should be an audited status change, not deletion. |
| Code update | Coach may alter any fields; members may perform a constrained claim | Admin may only revoke; member claim is tied to the atomic member creation with `getAfter` | Merge the stricter revoke and atomic claim checks while preserving the PWA's email-bound/anonymous-code behavior. |
| Member creation | Requires `joinedWith`, initial zero stats, and the cohort from the code | Requires the claimed code through `getAfter` and pins cohort/program/version, but omits `joinedWith` | Combine both checks. Dropping `joinedWith` would weaken the PWA's linked-Google defense. |
| Member read | Self only | Self or admin | Add admin read access so the member dashboard works. Keep other members private. |
| Member lifecycle | Member can complete onboarding; coach can delete | Member can also complete; admin gets strict pause/resume; member can delete | Add strict admin pause/resume, but deny member deletion and preferably deny all direct deletion. The local proposal's member-delete permission is a regression. |
| Member subcollections | Member owns subcollections; check-ins are create-once and immutable | Admin can read named subcollections, but members can update/delete check-ins | Preserve create-once check-ins and add admin read-only access. Do not broaden member writes. |
| Programs | Supports the PWA's nested `weeks/{weekId}/days/{dayId}` model, video URL validation, and other nested content | Uses a separate top-level `workoutDays/{dayId}` schema with admin validations | Preserve the deployed PWA paths first. Admin authoring must target the same nested schema before stricter validations are introduced. |
| Cohorts and chat | Includes leaderboard-name rules, thread addressing, reactions, edits, and typing markers | Simplifies chat and omits typing and several validations | Preserve the deployed implementation and add the admin operator to its privileged paths. |
| Registrations and unmatched sales | Coach read-only | Admin read-only | Authorize through the merged privileged helper; keep all client writes denied. |

## Recommended merged rule design

The next deployable candidate should start from the exact deployed staging
rules, not from the smaller local proposal.

### 1. Unify privileged identity without breaking existing callers

```firestore
function isCoach() {
  return request.auth != null && request.auth.token.coach == true;
}

function isAdmin() {
  return request.auth != null && request.auth.token.dpfitAdmin == true;
}

function isOperator() {
  return isCoach() || isAdmin();
}
```

All existing management checks can move from `isCoach()` to `isOperator()`.
Member authentication must continue using the stronger deployed `signedIn()`
helper; the admin helper must stay token-only because the admin has no member
document.

### 2. Preserve PWA security and paths

Keep these deployed sections intact unless an equivalent regression test is
added:

- `signIns/{uid}` and latest-device enforcement;
- member-email and sign-in-provider checks;
- the required `joinedWith` field;
- nested program weeks/days and exercise-video validation;
- cohort leaderboard, chat, reactions, and typing rules;
- immutable, create-once check-ins.

### 3. Add only the admin capabilities currently needed

- List individual access-code inventory.
- Read registrations and unmatched sales.
- Read member documents and member activity subcollections.
- Create and manage programs/cohorts on the existing PWA schema.
- Pause/resume a member through constrained fields and append an audit event.
- Read and later participate in cohort/member chat using the existing message
  shape.

No admin-facing client should directly create an access code. The deployed
`createAccessCode` Function remains the single creator through the Admin SDK.

### 4. Tighten access-code mutations

The merged rules should enforce:

- public `get`, never public `list`;
- operator-only `list`;
- no client `create` or `delete`;
- operator revoke changes only status/audit fields;
- member claim changes only claim/audit fields;
- the member document and code claim are created atomically and agree on UID,
  access code, and cohort; program/version must match when present, while
  legacy codes retain the PWA's empty-program cohort fallback.

### 5. Deploy safely

Before deployment:

1. Materialize the deployed baseline as reviewed source files.
2. Apply the narrow merge above.
3. Run emulator tests for both member and admin scenarios.
4. Test against the named `staging` database first.
5. Confirm admin code inventory/generation and one disposable PWA redemption.
6. Only then promote the same reviewed semantics to `(default)`.

## Review decision

The earlier smaller proposal described in this document was not deployed. A
new local candidate has now been built directly on the exact deployed staging
baseline. See `docs/firestore-rules-merged-candidate.md` for the implemented
diff, test evidence, and remaining pre-deployment compatibility check.
