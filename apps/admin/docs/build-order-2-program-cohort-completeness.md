# Build order 2 — program and cohort completeness

Prepared: 2026-09-19

## Outcome

The admin can author every member-facing part of a program, publish an
immutable version, assign that version to a cohort, and control the cohort's
coach, live-call, and leaderboard experience. The existing Vue PWA consumes
the result without a schema fork or PWA code change.

This build order includes:

- reward economy editing;
- guide management;
- week-theme editing;
- workout hero images;
- coach identity;
- live-call settings;
- leaderboard controls;
- safe program versioning and publishing.

It does not include member chat, announcements, nutrition editing, or PWA UI
changes.

## Current position

Implementation status: **locally complete; staging deployment and smoke test are
still pending.** No production deployment was performed.

Implemented in the admin console and trusted backend:

- draft-only week-theme editing;
- reward values, badge targets, badge definitions, and rank ladder editing;
- guide create, edit, delete, read-time, category, and unlock-week controls;
- publish-readiness flags for themes and rewards;
- cohort coach, live-call, leaderboard visibility, and reveal-week controls;
- read-only rendering for published programs.
- callable `cloneProgramVersion` with admin-only auth, a 200-document cap, and
  deterministic version ids;
- Firestore rules that make published programs immutable and preserve active
  cohort program pins;
- browser-side hero-image resizing, upload, replacement, and removal;
- PWA-compatible `heroImage` metadata and admin-only Storage rules;
- publish-time validation of week themes, guide unlock weeks, and image
  references;
- bounded, dry-run-first staging migration tooling;
- 16 passing Firestore rule tests and 4 passing Storage rule tests.

The staging backfill was applied to `recomp-six-week-v1` and a second dry-run
reported `plannedWrites: 0`. It added `familyId`, `sourceProgramId`, the actual
`guideCount: 5`, and published readiness flags. `cohort-01` still requires a
human to confirm and save the real coach identity; the migration deliberately
did not invent one.

Still required for rollout:

- review and deploy the Function, Firestore rules, and Storage rules to staging;
- confirm Storage is provisioned for the new Firebase project;
- run the Phase 7 staging smoke test against the Vue PWA.

## Non-negotiable rules

1. A published program is immutable.
2. Editing a published program always starts by cloning it into a new draft.
3. A running cohort keeps the exact `programId` and `programVersion` it was
   assigned. It is never silently moved to a new version.
4. New cohorts and new codes may use the newly published version.
5. Only the trusted `dpfitAdmin` identity may author program or cohort data.
6. The PWA's existing field names and document paths remain canonical.
7. Development and validation stay on the named `staging` database until the
   acceptance checks pass.

## Phase 1 — program version workflow

### Admin experience

Add **Create new version** to a published program. The action shows the source
program, proposed version, document counts, and resulting draft name before
confirmation.

The result is a new program document with:

```yaml
status: draft
version: source.version + 1
familyId: stable program family identifier
sourceProgramId: source program document id
publishedAt: null
weekThemesConfigured: true
rewardsConfigured: true
createdAt: server timestamp
createdByUid: admin uid
createdByEmail: admin email
```

It copies:

- the program root configuration;
- `workoutDays/*`;
- `guides/*`;
- existing `heroImage` references without copying the underlying file.

Unchanged images may safely remain referenced from the earlier program's
Storage path. Replacing an image in the new draft writes a new object and does
not overwrite the earlier version's file.

### Implementation

Create a callable `cloneProgramVersion` Function using the Admin SDK.

- Require `dpfitAdmin: true`.
- Accept `database` and `sourceProgramId` only.
- Allow only `(default)` and `staging`; use `staging` during this build.
- Reject non-published sources.
- Use a deterministic target version/document id and reject duplicates.
- Cap the copy at 200 workout-day and guide documents combined.
- Use a single batch so a failed clone writes nothing.
- Set `minInstances: 0` and `maxInstances: 2`.
- Return only the new program id, version, and copied document counts.

This operation is manual and bounded, so its Firestore and Functions cost is
small and predictable.

## Phase 2 — authoring integrity

Harden the editors already present:

### Week themes

- Require exactly one theme for every program week.
- Store sequential `weekNumber` values.
- Validate title and subtitle limits.
- Mark `weekThemesConfigured: true` only after a successful save.

### Rewards

- Preserve the PWA's existing `rewards` shape.
- Validate non-negative integer point values.
- Restrict badge rule ids and tiers to the PWA's supported values.
- Require unique rank and badge ids.
- Sort ranks by `minPoints` before saving.
- Mark `rewardsConfigured: true` only after explicit admin save.
- Do not invent business values; zero remains allowed when intentional.

### Guides

- Store at `programs/{programId}/guides/{guideId}`.
- Validate title, category, excerpt, body, read time, and unlock week.
- Keep the PWA convention: blank lines in `body` separate numbered steps.
- Maintain `guideCount` on the program root.

### Publish readiness

Before publishing, require:

- at least one workout day;
- reviewed week themes;
- reviewed reward configuration;
- valid guide unlock weeks;
- valid hero-image references when present.

The confirmation should show a concise readiness checklist. Publishing changes
only `draft -> published` and stamps the audit fields.

## Phase 3 — server-enforced Firestore safety

Update the merged Firestore rules so the backend agrees with the UI:

- operators may create program roots only as drafts;
- draft program roots may be edited;
- the only allowed published-root mutation is the constrained publish
  transition;
- writes to `workoutDays`, `guides`, weeks, and days require the parent program
  to remain a draft;
- published program content cannot be updated or deleted by a browser client;
- members retain read-only access to their assigned program content;
- cohort program pins remain locked once an active cohort has a program;
- cohort coach/live-call/leaderboard edits remain audited operator actions.

Extend the emulator suite with:

1. draft program content can be authored by `dpfitAdmin`;
2. a published program cannot be edited or deleted;
3. a valid draft-to-published transition succeeds;
4. published guides and workout days cannot be mutated;
5. members can still read assigned program content;
6. active cohort program pins cannot be replaced;
7. cohort experience settings can be changed without altering program pins.

## Phase 4 — workout hero images

### Storage contract

Use this object path:

```text
programs/{programId}/workoutDays/{dayId}/hero/{uuid}.webp
```

Store the exact PWA-compatible value on the workout-day document:

```yaml
heroImage:
  storagePath: programs/.../hero/....webp
  downloadUrl: https://...
  width: 1600
  height: 900
  bytes: 248113
```

`heroImage: null` keeps the PWA's existing gradient fallback.

### Admin upload flow

1. Accept JPEG, PNG, or WebP.
2. Resize in the browser to a maximum 1600 × 900 fit.
3. Encode as WebP or JPEG and refuse anything above 2 MiB after processing.
4. Upload directly with the Firebase Storage SDK.
5. Resolve the download URL.
6. Update the draft workout-day `heroImage` field.
7. Delete the previous object only after the Firestore update succeeds.
8. Provide a separate confirmed **Remove image** action that writes
   `heroImage: null` and then removes the old object.

Direct Storage upload avoids sending base64 image data through a Function,
which is cheaper and avoids unnecessary Function memory and bandwidth.

### Storage configuration and rules

Add `VITE_FIREBASE_STORAGE_BUCKET` and initialize `getStorage(firebaseApp)` in
the admin console.

Extend the shared Storage rules with an `isAdmin()` helper checking
`request.auth.token.dpfitAdmin == true`, then allow program-art create/update
only when:

- the caller is the admin;
- the object is under the exact program/workout hero path;
- the content type is an image;
- the object is at most 2 MiB.

Signed-in PWA members retain read access. No public list or write permission is
added. Firestore rules remain the authority that prevents attaching an upload
to a published workout day.

Add Storage emulator tests for admin upload, member read, public denial,
oversized-file denial, wrong-content-type denial, and writes outside the hero
path.

## Phase 5 — cohort experience controls

Finish and verify the existing cohort settings surface:

- `coach.uid`, `coach.name`, `coach.title`, and HTTPS `coach.avatarUrl`;
- nullable `liveCall` containing both `when` and HTTPS `joinUrl`, or neither;
- `leaderboardVisible` as an explicit manual control;
- `leaderboardRevealWeek` constrained to the cohort duration;
- no automatic cohort expiry or member lockout.

The current staging cohort is missing its `coach` block. Do not guess a real
coach identity. The admin must review the prefilled generic values and save
them, or provide the correct identity for a one-time backfill.

## Phase 6 — staging migration

Run a bounded, dry-run-first migration that reports before writing:

- published programs missing `familyId`;
- missing `guideCount` values;
- missing readiness flags on already-published programs;
- workout days missing `heroImage` (backfill as `null` only if the field is
  required operationally; the PWA already tolerates absence);
- cohorts missing `coach`, `liveCall`, or leaderboard defaults.

Migration behavior:

- infer readiness as true for an existing published program whose current
  rewards/themes are valid;
- count actual guide documents instead of trusting a missing root count;
- preserve all existing program/cohort pins;
- never rewrite access codes or members as part of this build order;
- require `--apply` for writes and log exact document ids changed.

## Phase 7 — acceptance and rollout

### Automated checks

- TypeScript production build passes.
- Lint introduces no new application warnings.
- Firestore emulator suite passes.
- Storage emulator suite passes.
- Functions build passes.

### Staging smoke test

1. Clone the published six-week program into version 2.
2. Confirm version 1 remains byte-for-byte unchanged.
3. Edit one week theme in version 2.
4. Edit reward values and one rank/badge in version 2.
5. Add, edit, and remove a disposable guide.
6. Upload, replace, and remove a disposable hero image.
7. Publish version 2.
8. Create a disposable cohort pinned to version 2.
9. Save coach, live-call, and leaderboard settings.
10. Generate and redeem one disposable access code.
11. Verify the PWA displays the version-2 schedule, hero, guide, rewards,
    coach, live call, and leaderboard state.
12. Confirm the original active cohort and version-1 members are unchanged.

### Deployment order

1. Review the Function, Firestore rules, and Storage rules locally.
2. Deploy `cloneProgramVersion` with bounded instances.
3. Deploy Firestore and Storage rules to staging only.
4. Run the dry-run migration, review it, then apply approved backfills.
5. Run the staging smoke test.
6. Review results before any `(default)` database or production promotion.

## Completion criteria

Build order 2 is complete when:

- a published program can be cloned but cannot be edited in place;
- a draft version can author themes, rewards, guides, workouts, and heroes;
- publish readiness prevents incomplete drafts from going live;
- a cohort can expose the intended coach, call, and leaderboard state;
- the PWA renders every authored field from Firestore/Storage;
- version-1 cohorts and members remain unchanged;
- rules and smoke tests pass on staging;
- no production deployment has occurred without a separate review.
