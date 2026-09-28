// =============================================================================
// Push: the member app's inbox, delivered to a phone that isn't looking at it.
//
// The inbox has three sources (ADMIN_NOTIFICATIONS.md, section 6), and each is
// sent here as the same line the inbox draws:
//
//   cohorts/{c}/notifications/{id}             created → every member of the cohort
//   cohorts/{c}/threads/cohort/messages/{id}   written → whoever it newly names or
//                                                        answers, and its author
//                                                        when somebody new reacts
//
// Delivery is per device, not per member. `members/{uid}/pushDevices/{id}` is
// one browser that turned push on, written by the member app's Profile switch.
// A device is sent to only while it holds the account — its `authTime` matches
// `signIns/{uid}` — so a phone that lost the account to a later sign-in stops
// buzzing the moment it does, whether or not it ever signed out.
//
// Messages are data only. The app's service worker (`apps/pwa/public/push-sw.js`)
// draws the notification itself, so its wording, its tag and where a tap goes
// are decided here and there, not by FCM's defaults. The payload is restated in
// both places; change one, change both.
// =============================================================================
import type { DocumentData, DocumentReference, Firestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { logger } from 'firebase-functions'
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/firestore'
import { app, database, type DatabaseId } from './databases.js'

// --- Contract ---------------------------------------------------------------

/** What the service worker reads out of `data`. Every value is a string, as FCM requires. */
interface PushPayload {
  /**
   * The inbox id. A second push with the same tag replaces the first rather
   * than stacking, which is also what absorbs a trigger delivered twice.
   */
  tag: string
  title: string
  body: string
  /** The path a tap opens. */
  url: string
  /** Alert again when replacing a notification with the same tag. */
  renotify?: boolean
}

/** Mirrors `PushDeviceDoc` in `apps/pwa/app/data/types.ts`. */
interface PushDeviceDoc {
  token: string
  /** `auth_time` of the sign-in that turned push on. */
  authTime: number
}

/**
 * How long FCM holds a push for a device that is off. A day: past that the
 * inbox has it anyway, and "Q&A tonight" arriving on Thursday is noise.
 */
const TTL_SECONDS = 24 * 60 * 60

/** Tokens FCM will never deliver to again. Anything else might be transient. */
const GONE = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
])

/** Nothing addresses more people than the inbox would show. */
const MAX_ADDRESSED = 50

/** The inbox's excerpt length. See `excerptOf` in `apps/pwa/app/lib/chat.ts`. */
const EXCERPT_CHARS = 120

const messaging = getMessaging(app)

// --- Who --------------------------------------------------------------------

interface Target {
  ref: DocumentReference
  token: string
}

/**
 * Of `uids`, the ones whose member document is in `cohortId`.
 *
 * `addressedUids` is written by the sender's own client, and the rules only
 * check that it is a list. Without this, a member could push their text to
 * anybody in any cohort by listing their uid.
 */
const inCohort = async (db: Firestore, uids: string[], cohortId: string): Promise<string[]> => {
  if (!uids.length) return []
  const docs = await db.getAll(
    ...uids.map((uid) => db.collection('members').doc(uid)),
    { fieldMask: ['cohortId'] },
  )
  return docs.filter((d) => d.exists && d.get('cohortId') === cohortId).map((d) => d.id)
}

/**
 * The devices to send to for `uids`: those registered under the sign-in that
 * currently holds each account.
 *
 * A device from an older sign-in can never hold the account again (signing in
 * is the only way back, and that is a new `auth_time`), so it is deleted rather
 * than skipped.
 */
const devicesOf = async (db: Firestore, uids: string[]): Promise<Target[]> => {
  const perMember = await Promise.all(
    uids.map(async (uid) => {
      const devices = await db.collection('members').doc(uid).collection('pushDevices').get()
      if (devices.empty) return []

      const latest = (await db.collection('signIns').doc(uid).get()).get('authTime')
      const live: Target[] = []
      for (const device of devices.docs) {
        const { token, authTime } = device.data() as Partial<PushDeviceDoc>
        if (typeof token === 'string' && token && authTime === latest) {
          live.push({ ref: device.ref, token })
        } else if (typeof latest === 'number' && typeof authTime === 'number' && authTime < latest) {
          await prune(device.ref, 'superseded sign-in')
        }
      }
      return live
    }),
  )
  return perMember.flat()
}

const prune = async (ref: DocumentReference, why: string) => {
  try {
    await ref.delete()
  } catch (cause) {
    logger.warn('Could not prune a push device', { path: ref.path, why, cause })
  }
}

// --- Sending ----------------------------------------------------------------

const deliver = async (kind: string, targets: Target[], payload: PushPayload) => {
  // One device can be registered twice if its local record was wiped; FCM
  // would deliver both, and the second would only replace the first.
  const byToken = new Map<string, DocumentReference[]>()
  for (const { token, ref } of targets) byToken.set(token, [...(byToken.get(token) ?? []), ref])
  const tokens = [...byToken.keys()]
  if (!tokens.length) return

  const data: Record<string, string> = {
    tag: payload.tag,
    title: payload.title,
    body: payload.body,
    url: payload.url,
    renotify: payload.renotify ? '1' : '',
  }

  let failed = 0
  // `sendEachForMulticast` takes 500 tokens a call.
  for (let i = 0; i < tokens.length; i += 500) {
    const chunk = tokens.slice(i, i + 500)
    const result = await messaging.sendEachForMulticast({
      tokens: chunk,
      data,
      webpush: { headers: { TTL: String(TTL_SECONDS), Urgency: 'high' } },
    })
    await Promise.all(
      result.responses.map(async (response, n) => {
        if (response.success) return
        failed++
        const code = response.error?.code ?? ''
        if (GONE.has(code)) {
          await Promise.all((byToken.get(chunk[n]!) ?? []).map((ref) => prune(ref, code)))
        } else {
          logger.warn('A push was not accepted', { kind, code, message: response.error?.message })
        }
      }),
    )
  }
  logger.info('Push sent', { kind, tag: payload.tag, devices: tokens.length, failed })
}

// --- Wording ----------------------------------------------------------------
// The same lines the inbox draws. See `chatNotificationFor` and
// `reactionsNotificationFor` in `apps/pwa/app/lib/chat.ts`.

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const uidsIn = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((uid): uid is string => typeof uid === 'string' && !!uid) : []

const excerptOf = (message: DocumentData): string => {
  const body = text(message.text)
  const [first] = Array.isArray(message.attachments) ? message.attachments : []
  if (!body) return first?.kind === 'image' ? 'Photo' : 'Attachment'
  return body.length > EXCERPT_CHARS ? `${body.slice(0, EXCERPT_CHARS).trimEnd()}…` : body
}

/** "Tomi", "Tomi and Ada", "Tomi and 4 others", newest first, author excluded. */
const reactorsLine = (message: DocumentData): string => {
  const reactors = Object.entries((message.reactors ?? {}) as Record<string, DocumentData>)
    .filter(([uid, r]) => uid !== message.authorUid && typeof r?.at?.toMillis === 'function')
    .map(([, r]) => ({ name: text(r.name) || 'Someone', at: r.at.toMillis() as number }))
    .sort((a, b) => b.at - a.at)
  const [newest, next] = reactors
  if (!newest) return 'Someone'
  if (!next) return newest.name
  return reactors.length === 2
    ? `${newest.name} and ${next.name}`
    : `${newest.name} and ${reactors.length - 1} others`
}

const emojisOf = (message: DocumentData): string =>
  Object.entries((message.reactionCounts ?? {}) as Record<string, number>)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([emoji]) => emoji)
    .join('')

// --- Triggers ---------------------------------------------------------------

/**
 * A coach notification, to every member of the cohort.
 *
 * Created only: editing one doesn't notify again in the inbox either.
 */
export const pushCohortNotification = (databaseId: DatabaseId) =>
  onDocumentCreated(
    { document: 'cohorts/{cohortId}/notifications/{notificationId}', database: databaseId },
    async (event) => {
      const notification = event.data?.data()
      if (!notification) return
      const title = text(notification.title)
      const body = text(notification.body)
      if (!title && !body) return

      const db = database(databaseId)
      const { cohortId, notificationId } = event.params
      const members = await db.collection('members').where('cohortId', '==', cohortId).select().get()
      const targets = await devicesOf(db, members.docs.map((d) => d.id))

      await deliver('coach', targets, {
        tag: notificationId,
        title: title || 'DP Fitness',
        body,
        url: '/notifications',
      })
    },
  )

/**
 * A cohort chat message: the people it newly names or answers, and its author
 * when somebody new reacts.
 *
 * On every write rather than on create, because both can arrive later: an edit
 * can add a mention, and a reaction is an update. Each is diffed against the
 * document before, so a reaction count going up, or an edit that keeps the same
 * names, sends nothing. Only the cohort thread: private coach threads never
 * reach the inbox.
 */
export const pushCohortMessage = (databaseId: DatabaseId) =>
  onDocumentWritten(
    { document: 'cohorts/{cohortId}/threads/cohort/messages/{messageId}', database: databaseId },
    async (event) => {
      const before = event.data?.before.data()
      const after = event.data?.after.data()
      if (!after) return

      const db = database(databaseId)
      const { cohortId, messageId } = event.params
      const author = text(after.authorUid)
      const name = text(after.authorName) || 'Someone'
      const url = `/chat?message=${encodeURIComponent(messageId)}`
      const sends: Array<Promise<void>> = []

      // --- Named or answered, for the first time ---------------------------
      const already = new Set(uidsIn(before?.addressedUids))
      const addressed = await inCohort(
        db,
        uidsIn(after.addressedUids)
          .filter((uid) => uid !== author && !already.has(uid))
          .slice(0, MAX_ADDRESSED),
        cohortId,
      )
      // A reply wins over a mention when a message is both, as in the inbox.
      const repliedTo = text(after.replyTo?.authorUid)
      for (const replied of [true, false]) {
        const uids = addressed.filter((uid) => (uid === repliedTo) === replied)
        if (!uids.length) continue
        sends.push(
          devicesOf(db, uids).then((targets) =>
            deliver(replied ? 'reply' : 'mention', targets, {
              tag: `chat-${messageId}`,
              title: replied ? `${name} replied to you` : `${name} mentioned you`,
              body: excerptOf(after),
              url,
            }),
          ),
        )
      }

      // --- Reacted to by somebody new ---------------------------------------
      // A second emoji from the same person, or one taken back, adds nobody.
      const reactedBefore = (before?.reactors ?? {}) as Record<string, unknown>
      const joined = Object.keys((after.reactors ?? {}) as Record<string, unknown>).filter(
        (uid) => uid !== author && !(uid in reactedBefore),
      )
      if (joined.length && author) {
        sends.push(
          inCohort(db, [author], cohortId)
            .then((uids) => devicesOf(db, uids))
            .then((targets) => {
              const emojis = emojisOf(after)
              return deliver('reaction', targets, {
                tag: `chat-${messageId}-reactions`,
                title: `${reactorsLine(after)} reacted to your message`,
                body: emojis ? `${emojis} · ${excerptOf(after)}` : excerptOf(after),
                url,
                renotify: true,
              })
            }),
        )
      }

      await Promise.all(sends)
    },
  )
