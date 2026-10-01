import type { User } from "firebase/auth"
import { doc, onSnapshot, serverTimestamp, setDoc, Timestamp, updateDoc, type Unsubscribe } from "firebase/firestore"
import type { CohortRecord } from "@/lib/cohorts"
import { firebaseDb } from "@/lib/firebase"

/**
 * `settings/platform`, read by members and by the landing site's payment webhook.
 * `autoIssueCodes` and `multipleCohorts` are absent on older documents, which means on.
 */
export type PlatformSettings = { qualifyingSetPercent: number; autoIssueCodes: boolean; multipleCohorts: boolean }
export const defaultPlatformSettings: PlatformSettings = { qualifyingSetPercent: 80, autoIssueCodes: true, multipleCohorts: true }

/** `settings/public`: readable by anyone, shown on the member app's access-code screen. */
export type PublicSettings = { coachName: string; coachWhatsapp: string }

function requireDatabase() {
  if (!firebaseDb) throw new Error("Settings are not configured.")
  return firebaseDb
}

const audit = (user: User) => ({ updatedAt: serverTimestamp(), updatedByUid: user.uid, updatedByEmail: user.email })

export function subscribeToPlatformSettings(onData: (settings: PlatformSettings) => void, onError: (message: string) => void): Unsubscribe {
  if (!firebaseDb) { onError("Settings are not configured."); return () => {} }
  return onSnapshot(doc(firebaseDb, "settings", "platform"), (snapshot) => {
    const value = snapshot.data()?.qualifyingSetPercent ?? 80
    if (!Number.isInteger(value) || value < 1 || value > 100) {
      onError("The workout qualification threshold is invalid.")
      return
    }
    onData({ qualifyingSetPercent: value, autoIssueCodes: snapshot.data()?.autoIssueCodes !== false, multipleCohorts: snapshot.data()?.multipleCohorts !== false })
  }, () => onError("Platform settings could not be loaded."))
}

/** Writes every setting together; the rules require the threshold on every write. */
export async function savePlatformSettings({ qualifyingSetPercent, autoIssueCodes, multipleCohorts, user }: PlatformSettings & { user: User }) {
  const database = requireDatabase()
  if (!Number.isInteger(qualifyingSetPercent) || qualifyingSetPercent < 1 || qualifyingSetPercent > 100) {
    throw new Error("Enter a whole percentage between 1 and 100.")
  }
  await setDoc(doc(database, "settings", "platform"), { qualifyingSetPercent, autoIssueCodes, multipleCohorts, ...audit(user) }, { merge: true })
}

export function subscribeToPublicSettings(onData: (settings: PublicSettings) => void, onError: (message: string) => void): Unsubscribe {
  if (!firebaseDb) { onError("Settings are not configured."); return () => {} }
  return onSnapshot(doc(firebaseDb, "settings", "public"), (snapshot) => {
    const data = snapshot.data() ?? {}
    onData({
      coachName: typeof data.coachName === "string" ? data.coachName : "",
      coachWhatsapp: typeof data.coachWhatsapp === "string" ? data.coachWhatsapp : "",
    })
  }, () => onError("Coach details could not be loaded."))
}

export async function savePublicSettings({ coachName, coachWhatsapp, user }: PublicSettings & { user: User }) {
  const database = requireDatabase()
  const name = coachName.trim()
  const whatsapp = coachWhatsapp.trim()
  if (name.length > 80) throw new Error("The display name must be 80 characters or fewer.")
  if (!/^[+0-9 ()-]{0,30}$/.test(whatsapp)) throw new Error("Enter the WhatsApp number with digits, spaces and an optional leading +.")
  if (whatsapp && whatsapp.replace(/\D/g, "").length < 8) throw new Error("That WhatsApp number looks too short. Include the country code.")
  await setDoc(doc(database, "settings", "public"), { coachName: name, coachWhatsapp: whatsapp, ...audit(user) })
}

/**
 * Moves a cohort's start. Everything counts from it: the member app's current
 * week and phase, the leaderboard reveal, and the landing page's "starts" badge
 * for the cohort registrations join. The date is midnight in Lagos, as when the
 * cohort was created.
 */
export async function saveCohortStartDate(cohort: CohortRecord, date: string, user: User) {
  const database = requireDatabase()
  if (cohort.status === "archived") throw new Error("Archived cohorts cannot be changed.")
  const startDate = new Date(`${date}T00:00:00+01:00`)
  if (Number.isNaN(startDate.getTime())) throw new Error("Choose a valid start date.")
  const endDate = new Date(startDate)
  endDate.setUTCDate(endDate.getUTCDate() + cohort.durationWeeks * 7)
  await updateDoc(doc(database, "cohorts", cohort.id), {
    startDate: Timestamp.fromDate(startDate), endDate: Timestamp.fromDate(endDate), ...audit(user),
  })
}
