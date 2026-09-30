// =============================================================================
// Live call reminders: the cohort hears about a call on the day it happens.
//
// The admin app schedules a call by writing `liveCalls/{callId}`, and nothing
// is sent then. On the call's day, in the cohort's zone, this writes a coach
// notification to `cohorts/{cohortId}/notifications`. That puts it in every
// member's inbox and, through `pushNotification` in `push.ts`, on the phone of
// every member who turned push on. The admin app writes no notification of its
// own for a call; if it did, members would get two.
//
// It goes out at 8 AM on the day, or an hour before a call that starts before
// 9 AM. A call added later on its own day is announced on the next run; one
// that has already ended never is.
//
// Nothing is scheduled against a call. Each run reads the calls as they stand,
// so a call moved or deleted before its day needs nothing more.
//
// The notification's id is the call's id and its date, and it is created, never
// set, so overlapping runs or a retry can't send it twice. A call moved to
// another day is announced again on that day; one moved within its day isn't.
// Nothing is written back to the call: its rule allows only the admin's fields.
//
// In `europe-west1` for the same reason as `release.ts`: Cloud Scheduler does
// not run in `africa-south1`.
// =============================================================================
import { FieldValue, Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { onSchedule } from 'firebase-functions/scheduler'
import { cohortZoneOf, dateKeyIn, type DateKey } from './calendar.js'
import { DATABASES, database, type DatabaseId } from './databases.js'

const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * 60 * MINUTE_MS

/** When the reminder goes out on the call's day, in minutes after midnight in the cohort's zone. */
const SEND_AT_MINUTES = 8 * 60

/** How long before an early call its reminder goes out instead. */
const EARLY_LEAD_MINUTES = 60

/** Mirrors `DEFAULT_CALL_MINUTES` and its cap in `lib/domain/liveCall.ts`. */
const DEFAULT_CALL_MINUTES = 60
const MAX_CALL_MINUTES = 24 * 60

/** Starts every reminder's id. The inbox's own read markers start with `chat-`. */
export const REMINDER_ID_PREFIX = 'live-call-'

/** There is no person behind a reminder. See `LANDING_ACTOR` in `callers.ts`. */
const SYSTEM_ACTOR = 'system:live-call-reminders'

/**
 * The zones that are West Africa Time, which no locale names as such.
 * Mirrors `WAT_ZONES` in the member app's `lib/time.ts`.
 */
const WAT_ZONES = new Set([
  'Africa/Lagos', 'Africa/Bangui', 'Africa/Brazzaville', 'Africa/Douala', 'Africa/Kinshasa',
  'Africa/Libreville', 'Africa/Luanda', 'Africa/Malabo', 'Africa/Ndjamena', 'Africa/Niamey',
  'Africa/Porto-Novo',
])

// --- When -------------------------------------------------------------------

/** As much of a call as deciding its reminder needs. */
export interface ReminderCall {
  startsAt: Date
  durationMinutes: number
}

/** Minutes since midnight at `at`, in `timeZone`. */
const minutesIntoDay = (at: Date, timeZone: string): number => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(at)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0)
  return part('hour') * 60 + part('minute')
}

/**
 * The date to remind the cohort of `call` on, if that is now, or `null`.
 *
 * Due on the call's date in `zone`, from 8 AM or from an hour before the call,
 * whichever is earlier, until the call ends. Never before its date, so a call
 * two days out waits.
 */
export const reminderDue = (call: ReminderCall, zone: string, now: Date): DateKey | null => {
  const start = call.startsAt.getTime()
  const end = start + call.durationMinutes * MINUTE_MS
  const day = dateKeyIn(call.startsAt, zone)
  if (now.getTime() >= end || dateKeyIn(now, zone) !== day) return null

  const morning = minutesIntoDay(now, zone) >= SEND_AT_MINUTES
  const soon = now.getTime() >= start - EARLY_LEAD_MINUTES * MINUTE_MS
  return morning || soon ? day : null
}

// --- What -------------------------------------------------------------------

/** "7:00 PM WAT": the slot on the cohort's clock, as `LiveCallCard` anchors it. */
export const slotLabel = (at: Date, zone: string): string => {
  const format = (timeZoneName?: 'short') =>
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: zone, timeZoneName })
  if (WAT_ZONES.has(zone)) return `${format().format(at)} WAT`
  return format('short').format(at)
}

interface Call extends ReminderCall {
  cohortId: string
  title: string
}

/**
 * A `liveCalls` document read the way `liveCallFrom` reads one in the member
 * app: without a `startsAt` or an http(s) `joinUrl` it is no call, and there is
 * no card to point anybody at.
 */
const callFrom = (data: DocumentData): Call | null => {
  const { startsAt, durationMinutes, joinUrl, cohortId, title } = data
  if (!(startsAt instanceof Timestamp)) return null
  if (typeof joinUrl !== 'string' || !/^https?:\/\//i.test(joinUrl.trim())) return null
  if (typeof cohortId !== 'string' || !cohortId) return null

  return {
    startsAt: startsAt.toDate(),
    durationMinutes:
      typeof durationMinutes === 'number' && durationMinutes > 0 && durationMinutes <= MAX_CALL_MINUTES
        ? durationMinutes
        : DEFAULT_CALL_MINUTES,
    cohortId,
    title: typeof title === 'string' && title.trim() ? title.trim() : 'Live call',
  }
}

// --- Sending ----------------------------------------------------------------

/** The gRPC status Firestore answers `create` with when the document is there. */
const ALREADY_EXISTS = 6

const remindIn = async (databaseId: DatabaseId, db: Firestore, now: Date) => {
  // Wider than any calendar day, a daylight-saving one included. `reminderDue`
  // does the real filtering; this only keeps the read small.
  const calls = await db
    .collection('liveCalls')
    .where('startsAt', '>', Timestamp.fromMillis(now.getTime() - 2 * DAY_MS))
    .where('startsAt', '<', Timestamp.fromMillis(now.getTime() + 2 * DAY_MS))
    .get()

  // A cohort's zone, or `null` for a cohort that no longer exists. Read once
  // per run however many calls it has.
  const zones = new Map<string, Promise<string | null>>()
  const zoneOf = (cohortId: string) => {
    if (!zones.has(cohortId)) {
      zones.set(
        cohortId,
        db.collection('cohorts').doc(cohortId).get().then((cohort) =>
          cohort.exists ? cohortZoneOf(cohort.get('timezone')) : null,
        ),
      )
    }
    return zones.get(cohortId)!
  }

  await Promise.all(
    calls.docs.map(async (doc) => {
      const call = callFrom(doc.data())
      if (!call) return
      const zone = await zoneOf(call.cohortId)
      if (!zone) return
      const day = reminderDue(call, zone, now)
      if (!day) return

      const stamp = FieldValue.serverTimestamp()
      const ref = db
        .collection('cohorts')
        .doc(call.cohortId)
        .collection('notifications')
        .doc(`${REMINDER_ID_PREFIX}${doc.id}-${day}`)
      try {
        await ref.create({
          type: 'coach',
          title: 'Live call today',
          body: `${call.title} at ${slotLabel(call.startsAt, zone)}. Join from Home.`,
          icon: 'phone',
          pinned: false,
          publishedAt: stamp,
          createdAt: stamp,
          createdByUid: SYSTEM_ACTOR,
          createdByEmail: SYSTEM_ACTOR,
        })
        logger.info('Live call reminder sent', { databaseId, callId: doc.id, cohortId: call.cohortId, day })
      } catch (cause) {
        // An earlier run sent it.
        if ((cause as { code?: unknown }).code === ALREADY_EXISTS) return
        logger.error('A live call reminder was not written', {
          databaseId,
          callId: doc.id,
          cause: String(cause),
        })
      }
    }),
  )
}

export const remindLiveCalls = onSchedule(
  {
    // A reminder goes out at most 15 minutes after it is due.
    schedule: 'every 15 minutes',
    region: 'europe-west1',
    timeoutSeconds: 120,
    // The next run is the retry; a scheduler retry on top would only overlap it.
    retryCount: 0,
  },
  async () => {
    const now = new Date()
    for (const databaseId of DATABASES) {
      try {
        await remindIn(databaseId, database(databaseId), now)
      } catch (cause) {
        logger.error('Live call reminders could not run', { databaseId, cause: String(cause) })
      }
    }
  },
)
