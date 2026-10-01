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
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore"
import { firebaseDb } from "@/lib/firebase"

/**
 * `cohorts/{cohortId}/announcements/{id}`, exactly as the PWA's `AnnouncementDoc`
 * reads it: a card on the member's "What's new this week" deck (Home →
 * announcements, opened from the bell's inbox), newest first, 20 at most.
 */
export type AnnouncementAccent = "rose" | "orange" | "ink"

export type AnnouncementRecord = {
  id: string
  cohortId: string
  eyebrow: string
  title: string
  body: string
  cta: string | null
  ctaUrl: string | null
  accent: AnnouncementAccent
  publishedAt: Date
  createdByEmail: string
  updatedAt: Date | null
  /** The bell notification posted with it, if any; deleted along with it. */
  notificationId: string | null
}

export type AnnouncementInput = {
  eyebrow: string
  title: string
  body: string
  cta: string
  ctaUrl: string
  accent: AnnouncementAccent
}

// The PWA keeps these names from an older palette: rose renders primary purple, orange violet.
export const accentOptions: Array<{ value: AnnouncementAccent; label: string }> = [
  { value: "rose", label: "Primary" },
  { value: "orange", label: "Violet" },
  { value: "ink", label: "Dark" },
]

function requireDatabase() {
  if (!firebaseDb) throw new Error("Announcements are not configured.")
  return firebaseDb
}

const asDate = (value: unknown) => value instanceof Timestamp ? value.toDate() : null

export function subscribeToAnnouncements(cohortId: string, onData: (records: AnnouncementRecord[]) => void, onError: (message: string) => void): Unsubscribe {
  if (!firebaseDb) { onError("Announcements are not configured."); return () => {} }
  return onSnapshot(query(collection(firebaseDb, "cohorts", cohortId, "announcements"), orderBy("publishedAt", "desc"), limit(50)), (snapshot) => {
    onData(snapshot.docs.map((item) => {
      const data = item.data({ serverTimestamps: "estimate" })
      return {
        id: item.id,
        cohortId,
        eyebrow: String(data.eyebrow ?? ""),
        title: String(data.title ?? ""),
        body: String(data.body ?? ""),
        cta: typeof data.cta === "string" && data.cta ? data.cta : null,
        ctaUrl: typeof data.ctaUrl === "string" && data.ctaUrl ? data.ctaUrl : null,
        accent: data.accent === "orange" || data.accent === "ink" ? data.accent : "rose",
        publishedAt: asDate(data.publishedAt) ?? new Date(0),
        createdByEmail: String(data.createdByEmail ?? ""),
        updatedAt: asDate(data.updatedAt),
        notificationId: typeof data.notificationId === "string" ? data.notificationId : null,
      }
    }))
  }, () => onError("Announcements could not be loaded."))
}

function validate(input: AnnouncementInput) {
  const eyebrow = input.eyebrow.trim()
  const title = input.title.trim()
  const body = input.body.trim()
  const cta = input.cta.trim()
  const ctaUrl = input.ctaUrl.trim()
  if (eyebrow.length > 40) throw new Error("The label above the title must be 40 characters or fewer.")
  if (title.length < 2 || title.length > 120) throw new Error("Titles must be 2–120 characters.")
  if (body.length < 2 || body.length > 1000) throw new Error("The message must be 2–1000 characters.")
  if (!!cta !== !!ctaUrl) throw new Error("Add both a button label and its link, or leave both empty.")
  if (cta.length > 30) throw new Error("Button labels must be 30 characters or fewer.")
  // The PWA opens https links in a new tab and keeps "/…" paths inside the app.
  if (ctaUrl && !/^https:\/\/\S+$/.test(ctaUrl) && !/^\/[\w\-/?=&#.]*$/.test(ctaUrl)) throw new Error("Button links must be an https:// URL or an in-app path like /check-in.")
  return { eyebrow: eyebrow || "From your coach", title, body, cta: cta || null, ctaUrl: ctaUrl || null, accent: input.accent }
}

/**
 * Publishes an announcement to a cohort's deck. With `notify`, also posts a bell
 * notification in the same write: the PWA deliberately doesn't ring the bell for
 * announcements on its own.
 */
export async function publishAnnouncement({ cohortId, input, notify, user }: { cohortId: string; input: AnnouncementInput; notify: boolean; user: User }) {
  const database = requireDatabase()
  const fields = validate(input)
  const created = { createdAt: serverTimestamp(), createdByUid: user.uid, createdByEmail: user.email ?? "" }
  const batch = writeBatch(database)
  const notification = notify ? doc(collection(database, "cohorts", cohortId, "notifications")) : null
  if (notification) {
    batch.set(notification, {
      type: "coach", icon: "bell", pinned: false,
      title: fields.title, body: fields.body.length > 160 ? `${fields.body.slice(0, 157)}…` : fields.body,
      publishedAt: serverTimestamp(), ...created,
    })
  }
  batch.set(doc(collection(database, "cohorts", cohortId, "announcements")), {
    ...fields, publishedAt: serverTimestamp(), notificationId: notification?.id ?? null,
    ...created, updatedAt: serverTimestamp(), updatedByUid: user.uid, updatedByEmail: user.email ?? "",
  })
  await batch.commit()
}

/** Edits the card in place; it keeps its place in the deck. A sent bell notification isn't re-sent. */
export async function updateAnnouncement(announcement: AnnouncementRecord, input: AnnouncementInput, user: User) {
  const database = requireDatabase()
  const batch = writeBatch(database)
  batch.update(doc(database, "cohorts", announcement.cohortId, "announcements", announcement.id), {
    ...validate(input), updatedAt: serverTimestamp(), updatedByUid: user.uid, updatedByEmail: user.email ?? "",
  })
  await batch.commit()
}

export async function deleteAnnouncement(announcement: AnnouncementRecord) {
  const database = requireDatabase()
  const batch = writeBatch(database)
  batch.delete(doc(database, "cohorts", announcement.cohortId, "announcements", announcement.id))
  if (announcement.notificationId) batch.delete(doc(database, "cohorts", announcement.cohortId, "notifications", announcement.notificationId))
  await batch.commit()
}
