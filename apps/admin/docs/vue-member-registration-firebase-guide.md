# DP Fit PWA registration contract

This guide describes the registration flow that the deployed member PWA
already implements. It supersedes the earlier code-only/custom-token proposal.
Do not add a second redemption architecture.

The full cross-application schema and rollout order are in
[firebase-compatibility-foundation.md](firebase-compatibility-foundation.md).

## Fresh-member flow

1. The visitor completes the tour.
2. The visitor enters an access code.
3. Before authentication, the PWA reads `accessCodes/{CODE}` directly.
4. The PWA accepts only a correctly shaped, unused, unexpired code.
5. The visitor supplies their own email and password and creates a Firebase
   Authentication account.
6. In one Firestore transaction, the PWA claims the code and creates
   `members/{firebaseAuthUid}`.

The member is not authenticated *by* the code. The code grants the new Firebase
identity a seat in a cohort and program.

## Firebase initialization

The PWA uses the normal Firebase web SDK. Web app configuration is public and
belongs in `NUXT_PUBLIC_*` environment values. Never put a service-account key
or Admin SDK credential in client code.

The database id must be explicit because `(default)` and `staging` are separate
databases with separate documents and rules:

```dotenv
NUXT_PUBLIC_FIREBASE_DATABASE_ID=staging
```

Initialize Firestore with the named database when the value is non-empty:

```ts
const db = databaseId ? getFirestore(app, databaseId) : getFirestore(app)
```

Email/password Authentication must be enabled in Firebase Console. Auth
persistence may use the normal browser-local Firebase persistence so returning
members remain signed in.

## Pre-authentication validation

Normalize the entered code with `trim().toUpperCase()`, then perform exactly
one document lookup:

```ts
const ref = doc(db, 'accessCodes', normalisedCode)
const snapshot = await getDoc(ref)
```

Do not query the collection. Firestore permits unauthenticated `get` for a
known document id and denies unauthenticated `list`.

Reject the code when:

- the document does not exist;
- `status !== 'unused'`;
- `expiresAt` is not a future timestamp;
- `issuedToEmail` is absent (it may be `null`);
- `cohortId`, `programId`, or `programVersion` is absent;
- `issuedToEmail` is non-null and does not match the authenticated account's
  email case-insensitively.

The last check is repeated by Firestore rules during the claim. Client checks
exist for a useful error message; rules remain the security boundary.

## Canonical access code

```ts
type AccessCode = {
  code: string
  batchId: string
  cohortId: string
  cohortName: string
  programId: string
  programVersion: number
  issuedToEmail: string | null
  issuedToWhatsapp: string | null
  status: 'unused' | 'claimed' | 'revoked'
  claimedByUid: string | null
  claimedByName: string | null
  claimedAt: Timestamp | null
  revokedAt: Timestamp | null
  expiresAt: Timestamp
  createdAt: Timestamp
  createdByUid: string
  createdByEmail: string
  updatedAt: Timestamp
  updatedByUid: string
  updatedByEmail: string
}
```

`issuedToEmail: null` means the code may be claimed by any valid authenticated
email. A string binds the code to that email. Never omit the field.

`claimedByUid` is canonical. `claimedByMemberId` is a legacy field to migrate,
not a field to write.

## Atomic claim and member creation

After Firebase account creation, run one Firestore transaction:

1. Read the code and `members/{uid}`.
2. If that member already exists for the same access code, return it.
3. Validate status, expiry, recipient binding, cohort, and program pin again.
4. Set `members/{uid}`.
5. For a first claim, update the access code from `unused` to `claimed`.

The code update contains only:

```ts
{
  status: 'claimed',
  claimedByUid: user.uid,
  claimedByName: user.displayName || user.email || '',
  claimedAt: now,
  updatedAt: now,
  updatedByUid: user.uid,
  updatedByEmail: user.email || '',
}
```

The member's entitlement fields must come from the code, never from route
parameters or editable form fields:

```ts
{
  email: user.email,
  emailVerified: user.emailVerified,
  status: 'onboarding',
  previousStatus: null,
  pauseReason: null,
  pausedAt: null,
  cohortId: code.cohortId,
  cohortName: code.cohortName,
  programId: code.programId,
  programVersion: code.programVersion,
  accessCode: normalisedCode,
  joinedAt: now,
  profile: initialProfile(code.issuedToWhatsapp ?? ''),
  prefs: defaultPreferences(),
  stats: emptyStats(),
  createdAt: now,
  updatedAt: now,
  updatedByUid: user.uid,
  updatedByEmail: user.email,
}
```

Rules require the post-transaction code to be claimed by the same UID and the
member's cohort/program values to match that code. A code claim without its
member, or a member without its claim, is rejected.

## Recovery and repeat entry

If `members/{uid}` already exists with the same access code, return the member
without resetting it.

If the member document is missing but the code is already `claimed` by that
same UID, the PWA may rebuild the member document without re-claiming the code.
Use the original `claimedAt` as `joinedAt` so challenge week calculations do
not restart.

An already-claimed code must never be usable by a different UID.

## Member ownership

- A member reads and updates only `members/{theirUid}`.
- `email`, `accessCode`, `cohortId`, `cohortName`, `programId`,
  `programVersion`, `joinedAt`, and `createdAt` are immutable.
- The member may transition `onboarding -> active` and `active -> completed`.
- Only the admin may pause or resume a member.
- Member subcollections remain owner-scoped.
- Lifecycle history is append-only under
  `members/{uid}/lifecycleEvents/{eventId}`.

## Admin-generated versus paid codes

Both sources call the same `createAccessCode` Function.

- Admin batch generation omits email/WhatsApp and may request 1–20 codes.
- Paid fulfilment supplies email and optional WhatsApp and receives exactly one
  code, reusing an existing live recipient code when appropriate.

The Function, not either caller, reads the cohort and stamps its name, program
id, and program version.

## Required smoke tests

Before releasing registration changes, verify:

1. Unknown, expired, revoked, and malformed codes fail before account creation.
2. An anonymous code accepts an arbitrary valid email/password account.
3. An email-bound code accepts a case-insensitive matching email.
4. The same bound code rejects another email.
5. Two concurrent first claims cannot both succeed.
6. Successful registration creates `members/{uid}` and claims the code in one
   commit.
7. Refresh restores the Firebase session and member.
8. A member cannot list codes, read another member, or change cohort/program.
9. An admin can list codes and read members but cannot edit activity records.

The admin repository also carries a local Firestore regression suite:

```bash
npm run firestore:rules:test
```

## Next hardening step

Direct pre-authentication reads expose the complete access-code document to a
person who knows the code. Once the current flow is stable, replace that read
with a rate-limited `checkAccessCode` callable that returns only status, expiry,
and whether an email binding exists. Keep the claim/member transaction as the
authoritative operation.
