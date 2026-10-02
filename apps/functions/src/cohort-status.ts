// =============================================================================
// A cohort's last day passing, written down.
//
// A cohort is `draft`, `active`, `completed` or `archived`. Only one may run at
// a time, and the next one is activated in the console once the running one is
// over. Over by date was always true the moment the last day passed — the
// rules, the member app and every function read `endDate` — but `status` still
// said `active`, so the console could not tell a running cohort from a finished
// one without doing the date sum itself. This does it once and stores it.
//
// Every 15 minutes, `active` cohorts whose last day has passed become
// `completed`. A `draft` that never ran is left as it is, and `archived` is the
// console's alone. Moving the last day of a completed cohort later does not
// bring it back: that is reopening, which the console does with its status.
//
// In `europe-west1` for the same reason as `release.ts`: Cloud Scheduler does
// not run in `africa-south1`.
// =============================================================================
import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { onSchedule } from 'firebase-functions/scheduler'
import { cohortOver } from './calendar.js'
import { DATABASES, database, type DatabaseId } from './databases.js'

/** Whether this cohort document is due to be marked `completed`. */
export const dueToComplete = (cohort: Record<string, unknown>, now: Date): boolean =>
  cohort.status === 'active' && cohortOver(cohort, now)

const completeIn = async (databaseId: DatabaseId, db: Firestore, now: Date) => {
  const active = await db.collection('cohorts').where('status', '==', 'active').get()
  for (const cohort of active.docs) {
    if (!dueToComplete(cohort.data(), now)) continue
    // Conditional on the cohort being as it was read, so an archive or a moved
    // last day landing in between is not written over; the next run looks again.
    try {
      await cohort.ref.update(
        {
          status: 'completed',
          completedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          updatedByUid: 'system:cohort-status',
          updatedByEmail: 'system:cohort-status',
        },
        { lastUpdateTime: cohort.updateTime },
      )
      logger.info('A cohort completed', { databaseId, cohortId: cohort.id })
    } catch (cause) {
      logger.warn('A cohort could not be marked completed', { databaseId, cohortId: cohort.id, cause: String(cause) })
    }
  }
}

export const completeCohorts = onSchedule(
  {
    schedule: 'every 15 minutes',
    region: 'europe-west1',
    timeoutSeconds: 60,
    // The next run is the retry; a scheduler retry on top would only overlap it.
    retryCount: 0,
  },
  async () => {
    const now = new Date()
    for (const databaseId of DATABASES) {
      try {
        await completeIn(databaseId, database(databaseId), now)
      } catch (cause) {
        logger.error('Cohorts could not be completed', { databaseId, cause: String(cause) })
      }
    }
  },
)
