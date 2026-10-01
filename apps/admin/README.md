# DP Fit Admin

The DP Fit administration console. One privately provisioned Firebase administrator can sign in, manage cohorts and registration codes, inspect member activity, and create versioned training programs. There is no public admin registration, Google sign-in, or staff system. Members create their own Firebase email/password account after a valid access code passes the PWA's pre-authentication check.

It is `apps/admin` in the DP Fitness workspace. It keeps no rules or functions of its own:

- The Firestore and Storage rules and the indexes are at the repo root.
- The callables it uses, `createAccessCode` and `cloneProgramVersion`, are in `apps/functions`.
- What it writes, and the contract that keeps the member app working, is in [ADMIN_NOTIFICATIONS.md](../../ADMIN_NOTIFICATIONS.md).

## Local setup

1. Create a Firebase project and register a Web app.
2. In Firebase Authentication, enable the **Email/Password** provider.
3. Copy `.env.example` to `.env.local` and add the Web app configuration.
4. Install dependencies from the repo root and start Vite:

   ```bash
   bun install
   bun run dev:admin
   ```

Without the five Firebase Web app environment variables, `/login` intentionally shows a configuration notice and keeps sign-in disabled.

## Provision the one admin

Run this and the other scripts below from `apps/admin`. The command uses the Firebase Admin SDK and Application Default Credentials. It creates the user if missing, or rotates the password for the same email if the user already exists, then applies the private `dpfitAdmin` custom claim. If another account previously held that claim, the command removes it so only one admin remains provisioned.

```bash
gcloud auth application-default login
read -s "DPFIT_ADMIN_PASSWORD?Admin password: "
export DPFIT_ADMIN_PASSWORD
bun run admin:provision \
  --project your-firebase-project-id \
  --email admin@example.com
unset DPFIT_ADMIN_PASSWORD
```

The password prompt is hidden, and the password is never written to the repository or printed by the script. A `--password` argument also works for automation, but the environment variable avoids leaving a password in shell history. If the admin was already signed in before provisioning, sign out and back in to refresh the claim.

To verify Admin SDK access without changing Firebase, use read-only check mode:

```bash
bun run admin:provision \
  --project your-firebase-project-id \
  --email admin@example.com \
  --check
```

If the administrator is created manually in Firebase Authentication so the password never leaves Firebase Console, apply only the custom claim with:

```bash
bun run admin:provision \
  --project your-firebase-project-id \
  --email admin@example.com \
  --claim-only
```

## Cost guardrails

- Do not upgrade or attach a billing account until a feature explicitly requires it.
- Keep the function instance cap low. `apps/functions` sets it for every function in `setGlobalOptions`. Do not enable Analytics or additional Google APIs by default.
- Keep Firestore browser writes restricted to the validated admin operations in the root `firestore.rules`.
- Before any paid plan is enabled, configure monthly budget alerts and service quotas. Budget alerts notify; they do not automatically cap spending.
- Develop and test Firestore reads/writes in emulators before using production data.

## Access-code data model

The admin dashboard uses `accessCodes/{code}`. The code is also the document ID, so a collision cannot silently create a duplicate invitation.

Each record contains:

- `code`, `batchId`, `cohortId`, and `cohortName`
- `programId` and `programVersion`, pinned from the selected cohort
- nullable `issuedToEmail` and `issuedToWhatsapp`; both fields must exist
- `status`: `unused`, `claimed`, or `revoked`; expiry is derived from `expiresAt`
- `createdAt`, `updatedAt`, `expiresAt`, `claimedAt`, and `revokedAt`
- create/update actor fields for the audit trail
- nullable `claimedByUid` and `claimedByName`

The browser may list and revoke records only when its Firebase token contains `dpfitAdmin: true`. Code creation goes through the shared callable Function; direct browser creates and all deletes are denied. A visitor may `get` one known code before authentication but may never list the collection. After account creation, the PWA atomically claims the code and creates `members/{uid}`.

## Cohorts and programs

Cohorts live at `cohorts/{cohortId}` and carry an immutable snapshot of their
assigned published program: `programId`, `programName`, and `programVersion`.
Draft cohorts can change programs; an active cohort's assigned program is
locked.

Programs use a draft-to-publish lifecycle:

- `programs/{programId}` stores duration, schedule, week themes, version, and
  publication status.
- `programs/{programId}/workoutDays/{dayId}` stores workout metadata and its
  complete exercise prescriptions.
- Draft programs can add, edit, and remove workout days. Empty drafts can be
  deleted.
- Drafts also author week themes, reward rules, member guides, and PWA-compatible
  workout hero images.
- Publishing validates the schedule, themes, reward review, guide unlock weeks,
  and image references, then makes that version immutable.
- A published version can be copied into the next draft through the bounded
  `cloneProgramVersion` callable Function (`apps/functions/src/programs.ts`).
  Existing cohorts remain pinned to the earlier version.

Cohort settings control the member-facing coach identity, leaderboard
visibility, and reveal week. A cohort closes for its members when it is
archived or when its last day (`endDate`) has passed. See "Closing a cohort" in
[ADMIN_NOTIFICATIONS.md](../../ADMIN_NOTIFICATIONS.md#closing-a-cohort).

## Member data model

The admin directory reads `members/{memberId}`. Its core fields mirror the Vue
app's `MemberAccount` contract: `id`, `accessCode`, `cohortId`, `joinedAt`,
`setupComplete`, and `profile`. Firestore also retains `cohortName`, `status`,
`onboardingStep`, `lastActiveAt`, `activitySummary`, and `isSample` for the
initial admin workflow. The denormalized activity summary keeps the directory
to one capped query; detailed records live below each member:

- `members/{memberId}/sessions/{sessionId}`
- `members/{memberId}/checkIns/{checkInId}`
- `members/{memberId}/lifecycleEvents/{eventId}`

The admin browser may read these records. Profiles, workouts, and check-ins are
not browser-editable. The only member write currently allowed is a validated
pause or resume, committed with an immutable lifecycle event.

Seed a development-only sample member by redeeming an existing unused code:

```bash
bun run member:seed-sample \
  --project your-firebase-project-id \
  --database staging \
  --code DPF-XXXX-XXXX
```

The transaction creates one member and marks the code claimed together. It also
adds a realistic profile, one check-in, one workout/proof placeholder, summary
counts, and a seed event. It refuses missing, expired, revoked, or mismatched
codes and is idempotent when rerun with a successfully enriched code.

## Security boundary

- The React app accepts only Firebase Email/Password sessions with `dpfitAdmin: true`.
- The dashboard route is protected and returns signed-out users to `/login`.
- Firebase session persistence is local, so the administrator remains signed in after refresh until signing out.
- The root `firestore.rules` recognizes the same custom claim and validates access-code, cohort, member-lifecycle, and program mutations.
- Members authenticate with their own email/password only after a code has passed the pre-authentication check. Their member document id is their Firebase Auth UID.

## Member PWA integration guide

The implementation plan for connecting the existing Nuxt/Vue member PWA is in
[docs/vue-member-registration-firebase-guide.md](docs/vue-member-registration-firebase-guide.md).
It records the implemented email/password registration flow, canonical schemas,
member-owner rules, recovery behavior, tests, and cost controls.

## Checks

From the repo root:

```bash
bun run build:admin
bun run --filter dp-fitness-admin lint
bun run build:functions
```

The local implementation and rollout checklist for this authoring phase is in
[docs/build-order-2-program-cohort-completeness.md](docs/build-order-2-program-cohort-completeness.md).

Rules, indexes and functions are deployed from the repo root, never from here.
See "Rules, indexes and deploys" in
[ADMIN_NOTIFICATIONS.md](../../ADMIN_NOTIFICATIONS.md#8-rules-indexes-and-deploys).
The documents under `docs/` predate the move into this workspace. Where one
names this app's own `firestore.rules`, `storage.rules` or `functions/`, read
the root rules and `apps/functions` instead.
