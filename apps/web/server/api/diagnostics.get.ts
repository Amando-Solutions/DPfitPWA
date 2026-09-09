// =============================================================================
// GET /api/diagnostics — what this deployment thinks it is.
//
// Written for one specific class of bug, which is invisible from the code and
// invisible from the browser: a deployment running with the wrong environment's
// configuration. The symptom is always something downstream and confusing — an
// access-code email pointing at the production member app when the buyer
// registered on preview, a registration landing in `(default)` when this
// deployment is supposed to write to `staging` — and the cause is always the
// same question, which nothing in the app was able to answer: *which* set of
// environment variables did this instance actually boot with?
//
// The answer cannot be inferred from the URL. Vercel scopes variables to a
// deployment's TARGET, not to the hostname used to reach it: a production
// deployment visited through its `*.vercel.app` deployment URL is still a
// production deployment and still gets production variables. It also snapshots
// them when the deployment is created, so a deployment built before a variable
// was added never sees it, no matter what the dashboard says today. Both cases
// look exactly like a correctly-configured preview from the outside.
//
// So this route reports the two things that settle it side by side: the
// identity Vercel gave the deployment, and the values it resolved from that.
//
//   curl -H "X-Selar-Token: $NUXT_SELAR_WEBHOOK_SECRET" \
//     https://<the url you are actually hitting>/api/diagnostics
//
// SECRETS. None are returned, and none may be added. Every value below is
// either already public (`appUrl` ships in the page payload, the database name
// and cohort id are names rather than credentials) or a boolean saying whether
// something is configured. The token gate is there because the shape of a
// deployment is still reconnaissance, not because anything here would be
// dangerous to leak — which is exactly the standard a new field has to meet.
// =============================================================================
import { isFromSelar } from '../utils/selar'
import { reachableOrigin } from '../emails/access-code'

export default defineEventHandler((event) => {
  const config = useRuntimeConfig()

  // The same gate as the webhook, and the same secret. There is no second
  // credential to invent here: anybody who is debugging a deployment already
  // has this one, and anybody who does not have it has no business enumerating
  // the environment.
  const token =
    getHeader(event, 'x-selar-token') ??
    getHeader(event, 'x-webhook-token') ??
    (getQuery(event).token as string | undefined)

  if (!isFromSelar(config.selarWebhookSecret, token)) {
    throw createError({ statusCode: 401, statusMessage: 'Bad token.' })
  }

  const appUrl = config.public.appUrl
  const databaseId = config.firebaseDatabaseId?.trim() ?? ''

  return {
    /**
     * Vercel's own account of this deployment, read straight from the system
     * variables it injects. `env` is the one that decides which set of
     * variables the instance was given, and it is the field this route exists
     * to show: `production` here while you believe you are on preview is the
     * whole bug, and no amount of reading the dashboard would have shown it.
     */
    deployment: {
      env: process.env.VERCEL_ENV ?? '(not on Vercel)',
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      url: process.env.VERCEL_URL ?? null,
      branchUrl: process.env.VERCEL_BRANCH_URL ?? null,
    },

    /**
     * What the instance resolved from those variables — the values that
     * actually decide where a buyer is sent and where their registration is
     * written. Compared against `deployment.env` above, a mismatch is the
     * answer: production values under `env: "preview"` means the variables are
     * not scoped the way the dashboard suggests, and preview values under
     * `env: "production"` means the opposite.
     */
    resolved: {
      appUrl,
      // Spelled out rather than left as the empty string it really is, because
      // `""` in a JSON response reads as "unset and therefore broken" when it
      // is in fact the production database — the one a project starts with.
      firebaseDatabaseId: databaseId || '(default)',
      registrationCohortId: config.registrationCohortId,
      // The check the email itself makes. False means the "Open the app"
      // button in an access-code email sent from this deployment points
      // somewhere no inbox can follow — a localhost default left in place.
      appUrlReachableFromAnInbox: Boolean(reachableOrigin(appUrl)),
    },

    /**
     * Configured or not, never the value. A missing one of these is its own
     * class of silent failure — no Selar secret means no sale is ever
     * fulfilled, no Brevo key means the code is minted and never sent — and
     * each is a boolean because knowing *that* it is set is the entire
     * diagnostic value.
     */
    configured: {
      firebaseServiceAccount: Boolean(
        config.firebaseServiceAccount || config.googleApplicationCredentials,
      ),
      selarProductUrl: Boolean(config.selarProductUrl),
      selarWebhookSecret: Boolean(config.selarWebhookSecret),
      brevoApiKey: Boolean(config.brevoApiKey),
      brevoSenderEmail: Boolean(config.brevoSenderEmail),
      brevoTemplateId: Boolean(config.brevoTemplateId),
    },
  }
})
