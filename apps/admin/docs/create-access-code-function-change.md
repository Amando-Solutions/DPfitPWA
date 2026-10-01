# `createAccessCode` Function change

## Deployment target

- Firebase project: `recomp-48b7b`
- Region: `africa-south1`
- Function name: `createAccessCode`
- Runtime: Node.js 22
- Maximum instances: 2
- Supported Firestore databases: `(default)` and `staging`

## Deployment record

Deployed successfully to `recomp-48b7b` on 2026-09-18. Firebase reported an
in-place update of the existing 2nd-generation callable Function. A subsequent
Function inventory check confirmed `createAccessCode`, `africa-south1`,
`nodejs22`, and 256 MiB memory.

This deployment did not include Firestore rules, Hosting, Storage, or other
Firebase resources.

## Previous deployed behavior

The previous Function supported one recipient-bound code per request:

```json
{
  "database": "staging",
  "cohortId": "...",
  "expiryDays": 30,
  "email": "buyer@example.com",
  "whatsapp": "+234..."
}
```

Important properties of the previous implementation:

- `email` was required.
- It created exactly one code.
- A live unused code for the same email and cohort was reused.
- It read cohort and program values from Firestore.
- Both the admin Firebase user and the paid-registration service account could
  call it.
- It allowed up to ten Function instances.
- It already wrote `issuedToEmail`, `issuedToWhatsapp`, `claimedByUid`, and the
  cohort program pin for recipient-bound codes.

This meant the paid landing-page flow was supported, but the admin console
could not create the anonymous batches required by the PWA.

## New behavior

The Function now supports two modes through the same endpoint and code-writing
implementation.

### Admin anonymous batch

Authenticated callers with `dpfitAdmin: true` omit recipient fields and send:

```json
{
  "database": "staging",
  "cohortId": "...",
  "expiryDays": 30,
  "quantity": 10
}
```

The Function creates between 1 and 20 codes and returns:

```json
{
  "codes": ["DPF-XXXX-XXXX"],
  "quantity": 1,
  "database": "staging",
  "cohortId": "...",
  "cohortName": "...",
  "expiresAt": "2026-10-18T00:00:00.000Z"
}
```

Every generated document explicitly contains:

```yaml
issuedToEmail: null
issuedToWhatsapp: null
claimedByUid: null
claimedByName: null
claimedAt: null
revokedAt: null
```

### Paid recipient-bound generation

Supplying `email` selects recipient mode. It still creates exactly one code,
still accepts optional WhatsApp, still reuses a live code for that email and
cohort, and preserves the previous `{ code, reused, ... }` response shape.

The paid-registration service account is not permitted to omit email or use
batch mode.

## Canonical document changes

All newly generated codes now use one shape regardless of caller:

- `claimedByUid` is canonical; no new `claimedByMemberId` fields are written.
- `issuedToEmail` and `issuedToWhatsapp` always exist, including when null.
- `programId` and `programVersion` are copied from the selected cohort.
- `updatedByUid` and `updatedByEmail` are written at creation.
- The document id and `code` field are the same generated value.
- Batch creation uses Firestore `create`, so an existing code cannot be
  overwritten.

## Validation and security changes

- Admin callers must have the Firebase custom claim `dpfitAdmin: true`.
- Server callers must present a Google-signed identity token for the configured
  registration service account in `X-Service-Token`.
- Only `(default)` and `staging` database ids are accepted.
- Quantity is restricted to 1–20.
- Expiry is restricted to 1–365 whole days.
- Recipient mode rejects quantities other than one.
- WhatsApp cannot be supplied without a recipient email.
- Missing, archived, or program-less cohorts are rejected before any write.
- Code values are not written to Function logs.
- Maximum instances were reduced from 10 to 2 as a cost guardrail.

## Compatibility impact

The updated Function is backward-compatible with the paid landing-page request
and response contract. The admin console can now use anonymous batch mode.

The Function uses the Admin SDK and therefore does not depend on browser
Firestore permissions when creating codes. However, deploying the Function
alone does not grant the admin console permission to list codes and does not
enable the PWA's pre-authentication code lookup. Those behaviors require the
unified `firestore.rules` deployment.

Existing documents are not modified by the Function deployment. The staging
audit found ten older codes without `programId`/`programVersion`; they require a
separate backfill before being considered fully compatible.
