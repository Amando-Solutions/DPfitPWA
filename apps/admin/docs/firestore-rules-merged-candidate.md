# Firestore merged rules candidate

Prepared: 2026-09-18

Status: **deployed to the `staging` database — `(default)` unchanged**

## Review files

- The pre-merge staging baseline was staging ruleset
  `96307f9a-438a-4b22-87c9-98acb6499ebd`. Its snapshot file,
  `firestore.deployed-staging.rules`, has since been removed; it is still in git
  history and in the Firebase console's ruleset history.
- `firestore.rules` is the merged rules file, now deployed to `staging`.
- `tests/firestore.rules.test.mjs` is the emulator regression suite.

| File | SHA-256 | Lines |
| --- | --- | ---: |
| Pre-merge staging baseline (`96307f9a`) | `0d439cd0fe11bf567cda01b1676a18a7f8ecb4f5d542f5172a4c867f3ffb60cd` | 699 |
| New merged candidate | `61743a96b2ce75bccfb08d553772ea08756ff834ac88b516017ffacf88f6777e` | 840 |

The candidate differs from the deployed staging snapshot by 223 inserted and
82 removed lines. Most removals are the previous inline member rules being
replaced with named validators; the PWA's live identity, program, cohort,
leaderboard, chat, reaction, typing, and nested-program structure remains the
baseline.

## Exact behavior changes

### Privileged identity

Current staging recognizes only:

```firestore
request.auth.token.coach == true
```

The candidate adds `isAdmin()` for `dpfitAdmin: true` and an `isOperator()`
compatibility helper accepting either trusted custom claim. Existing coach
tokens keep working while the admin console's already-provisioned claim begins
working.

This change is applied only to paths that the deployed rules already treated
as privileged management paths, plus the new member-support permissions below.
Member access continues to use the stronger deployed `signedIn()` function,
including latest-sign-in, member-email, and sign-in-provider checks.

### Access codes

| Operation | Current staging | Merged candidate |
| --- | --- | --- |
| Get one known code | Public | Public, unchanged |
| List codes | `coach` only | `coach` or `dpfitAdmin` |
| Browser create | Denied | Denied, unchanged; `createAccessCode` remains the only creator |
| Delete | `coach` may delete | Always denied |
| Operator update | Any update allowed | Only an audited `unused/claimed -> revoked` transition |
| Member claim | Constrained claim fields | Same constraints plus field types, caller audit identity, and atomic agreement with `members/{uid}` |

The atomic claim now verifies that the member created in the transaction has
the same access code and cohort as the code being claimed. When the code has a
program snapshot, the member must receive that exact program and version. A
legacy code without program fields must produce the PWA's existing empty/1
snapshot, after which the PWA resolves the program from the cohort. This
prevents a member from choosing an arbitrary program without breaking the live
legacy fallback.

### Registrations and unmatched sales

Read access changes from `coach` only to `isOperator()`. Client writes remain
fully denied because these collections are written by trusted server code.

### Programs and cohorts

Every existing privileged `isCoach()` branch becomes `isOperator()`. The
deployed PWA paths remain intact, including:

- recursive member reads below programs;
- generic two-level program content;
- `programs/{programId}/weeks/{weekId}/days/{dayId}`;
- exercise video URL validation;
- notifications and announcements;
- leaderboard projection validation;
- private/cohort threads, reactions, edits, and typing markers.

No alternate program schema replaces the deployed one. The admin console's
existing program and cohort reads/writes are authorized through the same
management paths previously available to a coach.

### Chat

Operators may read the same cohort and private threads already available to a
coach. The candidate also adds a constrained operator message-create branch:

- `authorUid` must be the signed-in operator;
- `isCoach` must be `true`;
- text must be non-empty;
- the timestamp must be a Firestore timestamp;
- reactions must start empty;
- addressed member IDs, when present, must be a list.

All deployed member message, edit, reaction, and typing protections remain.

### Members

Current staging permits a member to read only their own source document and
does not let the browser admin inspect member data. It also permits a coach to
delete a member source document.

The candidate changes this to:

- members retain access to their own document;
- operators may read member documents and activity subcollections;
- operators cannot edit profile, entitlement, email, points, or activity;
- operators may only perform the audited pause and resume transitions used by
  the admin console;
- all direct member-document deletion is denied;
- erasure stays a server-side operation capable of cleaning Auth, Storage,
  projections, and subcollections together.

Member creation now checks both sides of the redemption transaction. The
claimed code must name the member UID, and its cohort/program snapshot must
match the new member document. The deployed `joinedWith` requirement is
preserved.

Member self-updates additionally keep these entitlement/lifecycle fields
immutable:

- `email` and `joinedWith`;
- `cohortId` and `cohortName`;
- `accessCode`;
- `programId` and `programVersion`;
- `joinedAt` and `createdAt`;
- `previousStatus`, `pauseReason`, and `pausedAt`.

### Member subcollections

- Operators receive read-only support access.
- Members keep their existing session, photo, badge, state, and notification
  state access.
- Check-ins remain create-once and cannot be updated or deleted.
- Lifecycle events become explicitly append-only for members and operators.
- Lifecycle events validate member ID, transition type/statuses, reason,
  timestamp, and author identity.

## What did not change

The candidate deliberately preserves the deployed PWA rules for:

- anonymous lookup of one known access code;
- prohibition on anonymous collection listing;
- `signIns/{uid}` and single-latest-device enforcement;
- member email consistency;
- linked-Google/provider protection;
- cohort membership checks;
- leaderboard privacy and name projection;
- nested programs and exercise video validation;
- message editing, reactions, addressed members, and typing;
- immutable weekly check-ins.

## Verification completed

The Firestore emulator compiled the candidate successfully under Java 25.
Twelve rules tests passed with no failures:

1. unauthenticated single-code lookup succeeds;
2. unauthenticated code enumeration fails;
3. browser code creation fails;
4. anonymous code claim plus member creation succeeds atomically;
5. an email-bound code rejects the wrong account email;
6. a legacy code without program fields retains the cohort-program fallback;
7. `dpfitAdmin` can list codes;
8. the legacy `coach` claim continues to work;
9. admin browser creation and deletion remain denied;
10. audited revocation succeeds while entitlement rewriting fails;
11. admin member/activity reads and audited pause/resume succeed while profile
    rewriting and deletion fail;
12. member check-ins and lifecycle events are append-only.

Command used:

```bash
JAVA_HOME=/Library/Java/JavaVirtualMachines/jdk-25.jdk/Contents/Home \
  npm run firestore:rules:test
```

Firebase also completed a successful no-write dry run scoped specifically to
the named staging database:

```bash
firebase deploy --project recomp-48b7b --only firestore:staging --dry-run
```

The candidate leaves cohorts flexible: it does not enforce `endDate`,
automatically archive a cohort, or terminate a member's access when cohort
dates pass. Member progression continues from `joinedAt`; cohort status and
dates remain operational grouping/scheduling controls.

## Live registration verification

The deployed PWA was inspected without submitting or consuming a code. Its
fresh-user flow is code-first:

1. unauthenticated visitor enters a code;
2. the PWA reads and validates `accessCodes/{code}`;
3. the visitor supplies email and password;
4. Firebase creates or resumes the account;
5. one transaction claims the code, creates `members/{uid}`, and writes the
   cohort leaderboard projection;
6. setup begins.

The deployed JavaScript does write `joinedWith` from Firebase's current
`signInProvider`, so the deployed rule requirement is compatible. The local
PWA checkout inspected earlier differs from the deployed bundle and should not
be used as evidence that this field is absent from production.

The cohort is mandatory: pre-auth code validation requires `cohortId`, and the
member receives that cohort from the code. The program is optional only for
legacy compatibility. When code program fields are absent, the deployed PWA
writes `programId: ''` and `programVersion: 1`, then falls back to the cohort's
program when training content loads. The candidate rules now preserve exactly
that behavior. The shared Function still stamps the cohort's program onto all
new codes, so new registrations are pinned directly.

## Deployment record

The merged rules were deployed successfully on 2026-09-18 to the named
`staging` Firestore database in project `recomp-48b7b`:

```bash
firebase deploy --project recomp-48b7b --only firestore:staging
```

Firebase compiled, uploaded, and released `firestore.rules` to
`cloud.firestore`. The `(default)` database, Functions, Hosting, Storage, and
Authentication configuration were not included in this deployment.

After release, the running admin console was refreshed and its access-code
query completed successfully. It displayed 16 code documents: 2 available,
9 claimed, and 5 inactive. The previous `Access codes unavailable` error was
no longer present.

## Remaining review and rollout

The current `firebase.json` maps `firestore.rules` to both `(default)` and
`staging`. Do not run the repository's broad `firestore:rules:deploy` script
during the staging review; it is not scoped to one database.

1. Review the exact snapshot and candidate side by side.
2. Run a disposable PWA registration against the emulator or a staging rules
   preview with the production document shape.
3. ~~Deploy rules to the named `staging` database only.~~ Completed on
   2026-09-18.
4. ~~Confirm admin inventory.~~ Completed after deployment. Then confirm
   Function-backed code generation, revocation,
   member directory, pause/resume, and a disposable PWA redemption.
5. Review results before promoting equivalent semantics to `(default)`.
