// =============================================================================
// The clock behind pre-order releases.
//
// A pre-order sale's access code is minted at payment and held; the landing
// site sends it when the cohort's pre-order closes, from
// `POST /api/preorder/release`. That route does the work — it has the email
// sender and design and the environment fallbacks for the window, none of
// which live here — so all this does is call it, every hour.
//
// No date is scheduled anywhere. Each call reads every cohort's window as it
// stands, so moving the end of a pre-order moves the release with it, and a
// call before any window has closed sends nothing.
//
// In `europe-west1`, not beside the data: Cloud Scheduler does not run in
// `africa-south1`, and this touches no database — it makes one HTTPS request
// per landing deployment.
// =============================================================================
import { logger } from 'firebase-functions'
import { defineSecret, defineString } from 'firebase-functions/params'
import { onSchedule } from 'firebase-functions/scheduler'

/**
 * The release route on each landing deployment, comma-separated, e.g.
 * `https://dpfitness.example/api/preorder/release`. One per database, since
 * each deployment reads and writes the one its NUXT_FIREBASE_DATABASE_ID names.
 * Empty sends nothing.
 *
 * A string split here rather than `defineList`, which JSON-parses the raw
 * value at runtime and would crash on the comma-separated form a `.env` holds.
 */
const releaseUrls = defineString('PREORDER_RELEASE_URLS', {
  default: '',
  description: 'Landing-site release endpoints to call hourly (…/api/preorder/release), comma-separated.',
})

/** The same value as NUXT_PREORDER_RELEASE_SECRET on the landing deployments. */
const releaseSecret = defineSecret('PREORDER_RELEASE_SECRET')

/**
 * A route answers with `remaining` above zero when its own time budget ran out
 * before every due code was sent. It is asked again straight away rather than
 * an hour later, up to this many times a run.
 */
const MAX_CALLS = 30

export const releasePreorderCodes = onSchedule(
  {
    schedule: 'every 60 minutes',
    region: 'europe-west1',
    secrets: [releaseSecret],
    timeoutSeconds: 540,
    // The next hour is the retry; a scheduler retry on top would only overlap it.
    retryCount: 0,
  },
  async () => {
    for (const url of releaseUrls.value().split(',').map((u) => u.trim()).filter(Boolean)) {
      for (let call = 1; call <= MAX_CALLS; call++) {
        let body = null as { remaining?: number } | null
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: { authorization: `Bearer ${releaseSecret.value()}` },
            signal: AbortSignal.timeout(120_000),
          })
          body = (await response.json().catch(() => null)) as { remaining?: number } | null
          if (!response.ok) {
            logger.error('The release route refused', { url, status: response.status, body })
            break
          }
          logger.info('Release run', { url, call, result: body })
        } catch (cause) {
          logger.error('The release route could not be reached', { url, cause: String(cause) })
          break
        }
        if (!body?.remaining) break
      }
    }
  },
)
