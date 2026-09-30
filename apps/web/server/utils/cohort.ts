import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { currencyScale, formatPrice, readRegistration, type Challenge, type PreorderState } from '../../app/data/challenge'

export interface CohortFallbacks {
  cohortId?: string
  price?: unknown
  currency?: unknown
  codeTtlDays?: unknown
  /** ISO 8601 with an offset, e.g. `2026-10-01T00:00:00+01:00`. */
  preorderStartsAt?: unknown
  preorderEndsAt?: unknown
}

/** Empty fields are not configured. Invalid non-empty values never use fallback. */
const missing = (value: unknown) => value == null || (typeof value === 'string' && !value.trim())

export const cohortFallbacks = (): CohortFallbacks => {
  const config = useRuntimeConfig()
  return {
    cohortId: config.registrationCohortId,
    price: config.public.price,
    currency: config.public.priceCurrency,
    codeTtlDays: config.registrationCodeTtlDays,
    preorderStartsAt: config.registrationPreorderStartsAt,
    preorderEndsAt: config.registrationPreorderEndsAt,
  }
}

export interface PreorderWindow {
  startsAt: Date
  endsAt: Date
}

/** A Firestore timestamp, else the environment's ISO string, else `null`. */
const instant = (value: unknown, fallback: unknown, name: string): Date | null => {
  if (!missing(value)) {
    if (!(value instanceof Timestamp)) throw new Error(`registration.${name} must be a timestamp.`)
    return value.toDate()
  }
  if (missing(fallback)) return null
  const at = new Date(String(fallback).trim())
  if (Number.isNaN(at.getTime())) throw new Error(`The ${name} fallback is not an ISO 8601 date.`)
  return at
}

/**
 * The pre-order window: when seats are sold, and when their codes go out.
 *
 * `null` when neither end is configured anywhere, which is a cohort not on
 * sale. Anything half-set or out of order throws rather than guessing, and the
 * window must close by the cohort's start, because the time between the two
 * is the members' login window and cannot be negative.
 *
 * Read fresh by every caller, never saved onto a registration: the admin can
 * move either end, and a held code is released on the end as it stands then.
 */
export function preorderWindow(registration: unknown, cohortStart: Date, fallback: CohortFallbacks = {}): PreorderWindow | null {
  const data = (registration && typeof registration === 'object' && !Array.isArray(registration)
    ? registration : {}) as Record<string, unknown>
  const startsAt = instant(data.preorderStartsAt, fallback.preorderStartsAt, 'preorderStartsAt')
  const endsAt = instant(data.preorderEndsAt, fallback.preorderEndsAt, 'preorderEndsAt')
  if (!startsAt && !endsAt) return null
  if (!startsAt || !endsAt) throw new Error('A pre-order needs both a start and an end.')
  if (endsAt.getTime() <= startsAt.getTime()) throw new Error('The pre-order must end after it starts.')
  // if (endsAt.getTime() > cohortStart.getTime()) throw new Error('The pre-order must end by the time the cohort starts.')
  return { startsAt, endsAt }
}

/** "15 Oct 2026 at 00:00 GMT+1": an instant somebody acts on, with its zone named. */
export const momentLabel = (at: Date, timeZone: string) => new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone, timeZoneName: 'short',
}).format(at)

/** "30 Sept 2026": a day on the cohort's own calendar. */
export const dayLabel = (at: Date, timeZone: string) => new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone,
}).format(at)

export const preorderState = (window: PreorderWindow, now = Date.now()): PreorderState =>
  now < window.startsAt.getTime() ? 'upcoming' : now < window.endsAt.getTime() ? 'open' : 'closed'

/**
 * What fulfilment and release need from the cohort a registration bought.
 *
 * One read for both: the pre-order decides whether a code is held, and the
 * code lifetime is the fallback for registrations saved before they recorded
 * their own.
 */
export async function cohortOffer(db: Firestore, cohortId: string, fallback: CohortFallbacks = {}) {
  if (cohortId.includes('/')) throw new Error('A cohort ID is a document ID, not a path.')
  const snap = await db.doc(`cohorts/${cohortId}`).get()
  if (!snap.exists) throw new Error(`cohorts/${cohortId} does not exist.`)
  const start = snap.get('startDate')
  const timezone = snap.get('timezone')
  if (!(start instanceof Timestamp)) throw new Error(`cohorts/${cohortId} has no startDate.`)
  if (typeof timezone !== 'string' || !timezone.trim()) throw new Error(`cohorts/${cohortId} has no timezone.`)
  return {
    preorder: preorderWindow(snap.get('registration'), start.toDate(), fallback),
    codeTtlDays: snap.get('registration.codeTtlDays') as unknown,
    startDate: start.toDate(),
    timezone,
  }
}

export function codeLifetime(value: unknown, fallback?: unknown): number {
  const resolved = missing(value) ? (missing(fallback) ? NaN : Number(fallback)) : value
  if (typeof resolved !== 'number' || !Number.isInteger(resolved) || resolved < 1 || resolved > 365) {
    throw new Error('A code lifetime from 1 to 365 days must be configured in Firestore or the environment.')
  }
  return resolved
}

export function registrationWithFallback(value: unknown, fallback: CohortFallbacks = {}) {
  if (value != null && (typeof value !== 'object' || Array.isArray(value))) {
    throw new Error('The cohort registration settings must be a map.')
  }
  const data = (value ?? {}) as Record<string, unknown>
  const currency = missing(data.currency)
    ? (typeof fallback.currency === 'string' ? fallback.currency.trim().toUpperCase() : undefined)
    : data.currency
  let amountMinor = data.amountMinor
  if (missing(amountMinor) && !missing(fallback.price)) {
    if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) throw new Error('Missing or invalid currency.')
    const major = Number(String(fallback.price).replace(/,/g, '').trim())
    amountMinor = Math.round(major * currencyScale(currency))
  }
  return readRegistration({
    amountMinor, currency, codeTtlDays: codeLifetime(data.codeTtlDays, fallback.codeTtlDays),
  })
}

/** Use the configured ID only when Firestore has no active cohort. */
export async function activeCohort(db: Firestore, fallbackId?: string) {
  const result = await db.collection('cohorts').where('status', '==', 'active').limit(2).get()
  if (result.size > 1) throw new Error('Multiple active cohorts. Archive the previous cohort before opening registration.')
  if (result.docs[0]) return result.docs[0]
  const id = fallbackId?.trim()
  if (!id) return null
  if (id.includes('/')) throw new Error('The fallback cohort ID must be a document ID.')
  const configured = await db.doc(`cohorts/${id}`).get()
  if (!configured.exists || configured.get('status') === 'archived') return null
  return configured
}

export async function loadChallenge(db: Firestore, fallback: CohortFallbacks = {}, now = Date.now()) {
  const snap = await activeCohort(db, fallback.cohortId)
  if (!snap) return null
  const data = snap.data()!
  if (typeof data.name !== 'string' || !data.name.trim() ||
      !(data.startDate instanceof Timestamp) || !(data.endDate instanceof Timestamp) ||
      data.endDate.toMillis() <= data.startDate.toMillis() ||
      !Number.isInteger(data.durationWeeks) || data.durationWeeks < 1 ||
      typeof data.timezone !== 'string' || !data.timezone.trim()) {
    throw new Error(`cohorts/${snap.id} has incomplete dates, name, duration or timezone.`)
  }
  const date = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: data.timezone,
  })
  const start = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: data.timezone,
  })
  const programId = typeof data.programId === 'string' ? data.programId.trim() : ''
  if (programId.includes('/')) throw new Error('Invalid cohort program ID.')
  const programSnap = programId ? await db.doc(`programs/${programId}`).get() : null
  const program = programSnap?.data()
  const validProgram = programSnap?.exists && program?.status === 'published' &&
    typeof program.name === 'string' && program.name.trim() &&
    Number.isInteger(data.programVersion) && data.programVersion === program.version
  const [weeks, guides] = validProgram ? await Promise.all([
    programSnap!.ref.collection('weeks').get(), programSnap!.ref.collection('guides').get(),
  ]) : [null, null]
  let registration = null
  try { registration = registrationWithFallback(data.registration, fallback) } catch { /* Display, but do not sell an unconfigured cohort. */ }
  let preorder: PreorderWindow | null = null
  try { preorder = preorderWindow(data.registration, data.startDate.toDate(), fallback) } catch (cause) {
    console.warn(`[cohort] cohorts/${snap.id} has an unusable pre-order window, so registration stays closed:`, cause)
  }
  const sales = preorder ? preorderState(preorder, now) : null

  const challenge: Challenge = {
    id: snap.id, name: data.name.trim(),
    startsOn: date.format(data.startDate.toDate()), startsLabel: start.format(data.startDate.toDate()),
    endsOn: date.format(data.endDate.toDate()), timezone: data.timezone, durationWeeks: data.durationWeeks,
    program: validProgram ? { id: programId, name: program!.name, version: data.programVersion } : null,
    weeks: (weeks?.docs ?? []).flatMap((doc) => {
      const week = doc.data()
      return Number.isInteger(week.weekNumber) && week.weekNumber > 0 ? [{
        number: week.weekNumber, title: typeof week.title === 'string' ? week.title : '',
        subtitle: typeof week.subtitle === 'string' ? week.subtitle : '',
      }] : []
    }).sort((a, b) => a.number - b.number),
    guides: (guides?.docs ?? []).flatMap((doc) => {
      const guide = doc.data()
      return typeof guide.title === 'string' && Number.isInteger(guide.unlockWeek) && guide.unlockWeek > 0 ? [{
        id: doc.id, title: guide.title,
        description: typeof guide.excerpt === 'string' ? guide.excerpt : '', unlockWeek: guide.unlockWeek,
      }] : []
    }).sort((a, b) => a.unlockWeek - b.unlockWeek || a.title.localeCompare(b.title)),
    price: registration ? formatPrice(registration.amountMinor, registration.currency) : null,
    preorder: preorder && sales ? {
      startsAt: preorder.startsAt.toISOString(), endsAt: preorder.endsAt.toISOString(),
      startsLabel: momentLabel(preorder.startsAt, data.timezone),
      endsLabel: momentLabel(preorder.endsAt, data.timezone), state: sales,
    } : null,
    // Seats are sold during the pre-order and at no other time.
    registrationOpen: Boolean(registration && validProgram && sales === 'open'),
  }
  return { challenge, registration }
}
