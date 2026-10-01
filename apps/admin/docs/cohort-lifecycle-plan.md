# Cohort lifecycle + the two gaps: agreed plan (not yet implemented)

Status: **decisions locked 2026-09-28, parked.** Nothing below is built yet. Revisit before starting.

Source ticket: "Admin: Cohort lifecycle + the two gaps we identified".
Depends on / feeds: "PWA: What a member sees once their cohort has ended", which needs the
cohort link on codes to know which cohort a redeemed code belongs to.

## Ticket, in short

1. Three states: Draft, Active, Ended. End date = start date + program duration; the cohort
   becomes Ended automatically once that date passes.
2. Only one Active cohort, enforced by the action itself: activating a new cohort ends the
   current one. No blocking error.
3. A manual "End cohort early" action.
4. Access codes and registrations record which cohort they belong to.
5. Gap #1: an unclaimed code whose cohort has ended shows as "Expired". It's computed live, not stored.
6. Gap #2: while no cohort is Active, incoming Selar sales are rejected through the same path
   as "auto-issuance off".
7. Recommended: a warning on Cohort Pulse as the Active cohort's end date approaches.

## What already exists

- **Item 4, mostly:** every `accessCodes` and `registrations` document already stores
  `cohortId`. The actual gap is that the landing site always uses one fixed cohort, set by
  the env var `NUXT_REGISTRATION_COHORT_ID` (default `cohort-01`), in
  `apps/web/server/api/register.post.ts`, `payment/webhook.post.ts` and `challenge.get.ts`
  in the DPfitPWA repo.
- **Item 6's reject path:** built for the Settings → "Automatic code issuance" switch. The
  webhook returns a 503 so Zapier keeps a failed task that can be replayed.
- **"Multiple simultaneous challenges":** a Settings switch (`settings/platform.multipleCohorts`),
  plus the header cohort picker and the shared selected-cohort context. Currently on by default.

## Decisions

| Question | Decision |
| --- | --- |
| One Active vs the "Multiple simultaneous challenges" switch | **Keep the switch, change its default to off.** Off: activating a cohort automatically ends the current one, and the header shows the single Active cohort. On: several cohorts can be Active, the header picker appears, and sales go to the most recently activated cohort. |
| How "Ended" is stored | **Reuse `archived`** plus a new `endedAt` date, shown as "Ended" everywhere. No rules or member-app type change. There's no separate "hide from lists" state any more. |
| Cohort duration | **The program decides.** Drop the duration field from the create form and use `program.totalWeeks`. Changing a Draft's program recalculates the end date. Existing cohorts keep their stored duration. |
| Landing form while no cohort is Active | **Keep it open.** Registrations are still taken and attached to a cohort at sale time. Only the sale is rejected, and Zapier holds it for replay. |

Decided without asking (they follow from the ticket and the no-running-costs rule):

- Ending on the date is **computed on every read, never scheduled**: no cron, no Cloud Scheduler, no cost.
- The landing site looks up the Active cohort on each registration and sale (one small read each), instead of reading the env var.
- "Expired" on codes is computed live.

## Implementation plan

### Admin console (this repo)

1. **Effective status helper:** `archived` shows as Ended, and `active` past `endDate` also shows as
   Ended. Used by the Cohorts table, the header, the pickers and the codes table.
2. **Activating a cohort, or creating one as Active,** with the switch off: one batch that sets
   the target Active (with `activatedAt`) and sets every other stored-Active cohort to
   `archived` with `endedAt`. This replaces the current "archive the active cohort first"
   block on the Cohorts page (`singleCohortBlock` in `src/pages/cohorts-page.tsx`).
3. **Actions:** "End cohort early" (with a confirm step) replaces "Archive" for Active cohorts.
   Drafts keep delete (allowed when they have no members).
4. **Duration from the program:** remove the duration input. `createCohort` and
   `assignProgramToCohort` (for drafts) set `durationWeeks` and `endDate` from the program.
5. **Codes table:** an unused code shows Expired when its cohort's effective status is Ended,
   as well as when its `expiresAt` has passed.
6. **Settings:** `multipleCohorts` defaults to off
   (`src/lib/platform-settings.ts`: read as `=== true`), and the Cohorts card copy is updated.
   Note: on staging this hides the header picker until the switch is turned on.
7. **Item 7:** Cohort Pulse and the header show "Ends in N days — is the next cohort ready?"
   within 7 days of the end date, unless a Draft is lined up.

### Landing site (DPfitPWA repo, `apps/web`)

8. **Shared `activeCohort(db)` lookup:** queries `cohorts` where `status == 'active'`, drops any
   past `endDate`, and picks the most recent `activatedAt` (falling back to `startDate`).
   - `register.post.ts`: `cohortId` = the Active cohort, or `null` in the gap.
   - `payment/webhook.post.ts`: issue the code for the cohort Active *at sale time* and record
     it on the registration. With no Active cohort, return the same 503 as "auto-issuance off".
   - `challenge.get.ts`: the "starts on" badge shows the Active cohort's start if it's still
     upcoming, else the soonest future Draft, else no date.
   - `NUXT_REGISTRATION_COHORT_ID` is no longer used.
9. **Member-app type:** `RegistrationDoc.cohortId` becomes `string | null`.

### Not changing

- **Firestore rules:** no change or deploy needed. Registrations and sales are written by the
  server with the Admin SDK, and cohort updates already allow `endedAt` and `activatedAt`.
- **Blocking redemption of an Expired code:** left to the member-app ticket.
