import type { User } from "firebase/auth"
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore"

import {
  cohortOver,
  cohortZone,
  dayIn,
  DEFAULT_TIMEZONE,
  formatDayKey,
  instantOfLocal,
  isDayKey,
  lastDayOf,
  localDateTimeIn,
  startOfDay,
  type DayKey,
} from "@/lib/cohort-calendar"
import { firebaseDb } from "@/lib/firebase"
import type { ProgramRecord } from "@/lib/programs"

export type CohortStatus = "draft" | "active" | "archived"

export type CohortCoach = {
  uid: string
  name: string
  title: string
  avatarUrl: string
}

/**
 * The landing site's offer for a cohort, `cohorts/{id}.registration`. `null` is
 * a field the cohort doesn't set, where the landing site falls back to its own
 * environment (FIREBASE.md → "Firestore setup").
 */
export type CohortRegistration = {
  amountMinor: number | null
  currency: string | null
  codeTtlDays: number | null
  /** Seats are sold only between these two. Both or neither. */
  preorderStartsAt: Date | null
  preorderEndsAt: Date | null
}

export type CohortRecord = {
  id: string
  name: string
  status: CohortStatus
  startDate: Date
  /**
   * Midnight at the start of the cohort's last day, in its `timezone`; `null`
   * when the document has none. See `cohortOver`.
   */
  endDate: Date | null
  durationWeeks: number
  timezone: string
  memberCount: number
  programId: string | null
  programName: string | null
  programVersion: number | null
  coach: CohortCoach | null
  registration: CohortRegistration
  leaderboardVisible: boolean
  leaderboardRevealWeek: number
  createdAt: Date
}

export type CohortCoachInput = {
  name: string
  title: string
  avatarUrl: string
}

/**
 * The offer as its form holds it: the price in major units (naira, not kobo),
 * and each end of the pre-order as a `datetime-local` value on the cohort's
 * clock. An empty field is one the cohort doesn't set.
 */
export type CohortRegistrationInput = {
  price: string
  currency: string
  codeTtlDays: string
  preorderStartsAt: string
  preorderEndsAt: string
}

export type CohortExperienceInput = {
  coach: CohortCoachInput
  registration: CohortRegistrationInput
  leaderboardVisible: boolean
  leaderboardRevealWeek: number
}

type CreateCohortInput = {
  name: string
  status: Exclude<CohortStatus, "archived">
  /** The first day, `YYYY-MM-DD`, on the new cohort's calendar (Lagos). */
  startDay: DayKey
  durationWeeks: number
  program: ProgramRecord
  coach: CohortCoachInput
  registration: CohortRegistrationInput
  user: User
}

const COHORT_LIMIT = 100

/** Active and not yet over: the cohort its members are training in right now. */
export const cohortInProgress = (cohort: CohortRecord, now: Date) =>
  cohort.status === "active" && !cohortOver(cohort, now)

function requireDatabase() {
  if (!firebaseDb) throw new Error("Cohorts are not configured.")
  return firebaseDb
}

function readDate(value: unknown) {
  return value instanceof Timestamp ? value.toDate() : new Date(0)
}

const CURRENCY = /^[A-Z]{3}$/

/** Minor units to the major one: 100 kobo to the naira. Mirrors `currencyScale` in apps/web. */
export const currencyScale = (currency: string) =>
  10 ** (new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2)

/** A price in minor units as the landing page shows it, such as "₦30,000.00". */
export const formatPrice = (amountMinor: number, currency: string) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(amountMinor / currencyScale(currency))

function readRegistration(value: unknown): CohortRegistration {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {}
  return {
    amountMinor: Number.isSafeInteger(data.amountMinor) ? data.amountMinor as number : null,
    currency: typeof data.currency === "string" && CURRENCY.test(data.currency) ? data.currency : null,
    codeTtlDays: Number.isInteger(data.codeTtlDays) ? data.codeTtlDays as number : null,
    preorderStartsAt: data.preorderStartsAt instanceof Timestamp ? data.preorderStartsAt.toDate() : null,
    preorderEndsAt: data.preorderEndsAt instanceof Timestamp ? data.preorderEndsAt.toDate() : null,
  }
}

/** A cohort's offer as its form holds it, with the pre-order on the cohort's clock. */
export function registrationInputOf(registration: CohortRegistration, zone: string): CohortRegistrationInput {
  const { amountMinor, currency, codeTtlDays, preorderStartsAt, preorderEndsAt } = registration
  return {
    price: amountMinor === null ? "" : String(amountMinor / currencyScale(currency ?? "NGN")),
    currency: currency ?? "",
    codeTtlDays: codeTtlDays === null ? "" : String(codeTtlDays),
    preorderStartsAt: preorderStartsAt ? localDateTimeIn(preorderStartsAt, zone) : "",
    preorderEndsAt: preorderEndsAt ? localDateTimeIn(preorderEndsAt, zone) : "",
  }
}

/**
 * `registration` as the landing site reads it (`readRegistration` and
 * `preorderWindow` in apps/web), from its form. Throws on anything the site
 * would refuse, rather than saving an offer that quietly closes checkout.
 * Empty fields are left out, so the site's fallback applies to them.
 */
function registrationFrom(input: CohortRegistrationInput, zone: string) {
  const registration: Record<string, unknown> = {}
  const currency = input.currency.trim().toUpperCase()
  const price = input.price.replace(/,/g, "").trim()
  const days = input.codeTtlDays.trim()

  if (currency) {
    if (!CURRENCY.test(currency)) throw new Error("Enter the currency as a three-letter code, such as NGN.")
    registration.currency = currency
  }
  if (price) {
    if (!currency) throw new Error("Enter the currency the price is in.")
    const amountMinor = Math.round(Number(price) * currencyScale(currency))
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
      throw new Error("Enter the price as a number, such as 30000.")
    }
    registration.amountMinor = amountMinor
  }
  if (days) {
    const codeTtlDays = Number(days)
    if (!Number.isInteger(codeTtlDays) || codeTtlDays < 1 || codeTtlDays > 365) {
      throw new Error("Codes must last a whole number of days, from 1 to 365.")
    }
    registration.codeTtlDays = codeTtlDays
  }

  const opens = input.preorderStartsAt.trim()
  const closes = input.preorderEndsAt.trim()
  if (opens || closes) {
    if (!opens || !closes) throw new Error("Set both ends of the pre-order, or neither.")
    const startsAt = instantOfLocal(opens, zone)
    const endsAt = instantOfLocal(closes, zone)
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new Error("Choose a date and time for each end of the pre-order.")
    }
    if (endsAt.getTime() <= startsAt.getTime()) throw new Error("The pre-order must close after it opens.")
    registration.preorderStartsAt = Timestamp.fromDate(startsAt)
    registration.preorderEndsAt = Timestamp.fromDate(endsAt)
  }
  return registration
}

/** The coach members see on their private thread and in @mentions. */
function coachFrom(input: CohortCoachInput, uid: string): CohortCoach {
  const name = input.name.trim()
  const title = input.title.trim()
  const avatarUrl = input.avatarUrl.trim()

  if (name.length < 2 || name.length > 80) {
    throw new Error("Coach name must be between 2 and 80 characters.")
  }
  if (title.length < 2 || title.length > 80) {
    throw new Error("Coach title must be between 2 and 80 characters.")
  }
  if (avatarUrl && !/^https:\/\//i.test(avatarUrl)) {
    throw new Error("Coach avatar must use an HTTPS URL.")
  }
  return { uid, name, title, avatarUrl }
}

function readCoach(value: unknown): CohortCoach | null {
  if (!value || typeof value !== "object") return null
  const coach = value as Record<string, unknown>
  return {
    uid: String(coach.uid ?? ""),
    name: String(coach.name ?? ""),
    title: String(coach.title ?? ""),
    avatarUrl: String(coach.avatarUrl ?? ""),
  }
}

export function subscribeToCohorts(
  onData: (records: CohortRecord[]) => void,
  onError: (message: string) => void,
): Unsubscribe {
  if (!firebaseDb) {
    const timeout = window.setTimeout(
      () => onError("Cohorts are not configured."),
      0,
    )
    return () => window.clearTimeout(timeout)
  }

  const cohortsQuery = query(
    collection(firebaseDb, "cohorts"),
    orderBy("createdAt", "desc"),
    limit(COHORT_LIMIT),
  )

  return onSnapshot(
    cohortsQuery,
    (snapshot) => {
      onData(
        snapshot.docs.map((snapshotDocument) => {
          const data = snapshotDocument.data({ serverTimestamps: "estimate" })

          return {
            id: snapshotDocument.id,
            name: String(data.name ?? "Unnamed cohort"),
            status: (data.status ?? "draft") as CohortStatus,
            startDate: readDate(data.startDate),
            endDate: data.endDate instanceof Timestamp ? data.endDate.toDate() : null,
            durationWeeks:
              typeof data.durationWeeks === "number" ? data.durationWeeks : 6,
            timezone: String(data.timezone ?? DEFAULT_TIMEZONE),
            memberCount:
              typeof data.memberCount === "number" ? data.memberCount : 0,
            programId: typeof data.programId === "string" ? data.programId : null,
            programName: typeof data.programName === "string" ? data.programName : null,
            programVersion:
              typeof data.programVersion === "number" ? data.programVersion : null,
            coach: readCoach(data.coach),
            registration: readRegistration(data.registration),
            leaderboardVisible: data.leaderboardVisible === true,
            leaderboardRevealWeek:
              typeof data.leaderboardRevealWeek === "number"
                ? data.leaderboardRevealWeek
                : 1,
            createdAt: readDate(data.createdAt),
          } satisfies CohortRecord
        }),
      )
    },
    () => onError("The cohort list could not be loaded."),
  )
}

export async function createCohort({
  name,
  status,
  startDay,
  durationWeeks,
  program,
  coach,
  registration,
  user,
}: CreateCohortInput) {
  const database = requireDatabase()
  const safeName = name.trim()
  const safeDuration = Math.trunc(durationWeeks)

  if (safeName.length < 2 || safeName.length > 80) {
    throw new Error("Cohort name must be between 2 and 80 characters.")
  }
  if (!isDayKey(startDay)) {
    throw new Error("Choose a valid start date.")
  }
  if (safeDuration < 1 || safeDuration > 52) {
    throw new Error("Duration must be between 1 and 52 weeks.")
  }
  const offer = registrationFrom(registration, DEFAULT_TIMEZONE)
  // A new cohort carries its own offer. Only older ones lean on the landing site's environment.
  if (offer.amountMinor === undefined || offer.codeTtlDays === undefined) {
    throw new Error("Enter the price, its currency and how long codes last.")
  }

  // Both dates are days on the cohort's calendar, stored as midnight at the
  // start of each. The last day is the end of the final week, not the day after.
  const startDate = startOfDay(startDay, DEFAULT_TIMEZONE)
  const endDate = startOfDay(lastDayOf(startDay, safeDuration), DEFAULT_TIMEZONE)
  const reference = doc(collection(database, "cohorts"))
  const batch = writeBatch(database)
  batch.set(reference, {
    name: safeName,
    status,
    startDate: Timestamp.fromDate(startDate),
    endDate: Timestamp.fromDate(endDate),
    durationWeeks: safeDuration,
    timezone: DEFAULT_TIMEZONE,
    memberCount: 0,
    coach: coachFrom(coach, user.uid),
    registration: offer,
    leaderboardVisible: false,
    leaderboardRevealWeek: 1,
    programId: program.id,
    programName: program.name,
    programVersion: program.version,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdByUid: user.uid,
    createdByEmail: user.email,
    updatedByUid: user.uid,
    updatedByEmail: user.email,
    archivedAt: null,
  })
  await batch.commit()

  return reference.id
}

export async function assignProgramToCohort(
  cohort: CohortRecord,
  program: ProgramRecord,
  user: User,
) {
  const database = requireDatabase()

  if (cohort.status === "archived") {
    throw new Error("Archived cohorts cannot be changed.")
  }
  if (cohort.status === "active" && cohort.programId) {
    throw new Error("The program for an active cohort is locked.")
  }
  if (program.status !== "published") {
    throw new Error("Only published programs can be assigned.")
  }

  await updateDoc(doc(database, "cohorts", cohort.id), {
    programId: program.id,
    programName: program.name,
    programVersion: program.version,
    updatedAt: serverTimestamp(),
    updatedByUid: user.uid,
    updatedByEmail: user.email,
  })
}

export async function setCohortStatus(
  cohort: CohortRecord,
  status: Extract<CohortStatus, "active" | "archived">,
  user: User,
) {
  const database = requireDatabase()

  if (cohort.status === status) return
  if (cohort.status === "archived") {
    throw new Error("Archived cohorts cannot be changed.")
  }
  if (status === "active" && cohort.status !== "draft") {
    throw new Error("Only draft cohorts can be activated.")
  }
  if (status === "active" && !cohort.programId) {
    throw new Error("Assign a program before activating this cohort.")
  }

  await updateDoc(doc(database, "cohorts", cohort.id), {
    status,
    archivedAt: status === "archived" ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
    updatedByUid: user.uid,
    updatedByEmail: user.email,
  })
}

/**
 * Un-archive a cohort. Its members go back into the app as soon as this lands,
 * unless its last day has passed too: then pass `lastDay` to move it, in the
 * same write, or they stay on the ended screen. A cohort with no program goes
 * back to draft, since an active one needs a program for codes to be issued.
 */
export async function reopenCohort(cohort: CohortRecord, user: User, lastDay?: DayKey) {
  const database = requireDatabase()
  if (cohort.status !== "archived") return

  const zone = cohortZone(cohort.timezone)
  const patch: Record<string, unknown> = {
    status: cohort.programId ? "active" : "draft",
    archivedAt: null,
    updatedAt: serverTimestamp(),
    updatedByUid: user.uid,
    updatedByEmail: user.email,
  }
  if (lastDay) {
    if (!isDayKey(lastDay)) throw new Error("Choose a valid last day.")
    const startDay = dayIn(cohort.startDate, zone)
    if (lastDay < startDay) {
      throw new Error(`The last day can't be before the start, ${formatDayKey(startDay)}.`)
    }
    patch.endDate = Timestamp.fromDate(startOfDay(lastDay, zone))
  }
  await updateDoc(doc(database, "cohorts", cohort.id), patch)
}

export async function saveCohortExperience(
  cohort: CohortRecord,
  input: CohortExperienceInput,
  user: User,
) {
  const database = requireDatabase()
  if (cohort.status === "archived") {
    throw new Error("Archived cohorts cannot be changed.")
  }

  const coach = coachFrom(input.coach, cohort.coach?.uid || user.uid)
  const registration = registrationFrom(input.registration, cohortZone(cohort.timezone))
  const revealWeek = Math.trunc(input.leaderboardRevealWeek)

  if (!Number.isFinite(revealWeek) || revealWeek < 1 || revealWeek > cohort.durationWeeks) {
    throw new Error(`Leaderboard reveal week must be between 1 and ${cohort.durationWeeks}.`)
  }

  await updateDoc(doc(database, "cohorts", cohort.id), {
    coach,
    registration,
    leaderboardVisible: input.leaderboardVisible,
    leaderboardRevealWeek: revealWeek,
    updatedAt: serverTimestamp(),
    updatedByUid: user.uid,
    updatedByEmail: user.email,
  })
}
