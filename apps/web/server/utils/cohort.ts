import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { currencyScale, formatPrice, readRegistration, type Challenge } from '../../app/data/challenge'

export interface CohortFallbacks {
  cohortId?: string
  price?: unknown
  currency?: unknown
  codeTtlDays?: unknown
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

export async function loadChallenge(db: Firestore, fallback: CohortFallbacks = {}) {
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
    registrationOpen: Boolean(registration && validProgram),
  }
  return { challenge, registration }
}
