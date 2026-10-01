import {
  collectionGroup,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  Timestamp,
  where,
  type QueryDocumentSnapshot,
} from "firebase/firestore"
import { firebaseDb } from "@/lib/firebase"

/**
 * One member's weekly check-in: `members/{uid}/checkIns/week-{n}`. The PWA asks
 * the check-in questions and the feedback questions on one form and stores them
 * in one document, so "joined by member + week" is a single record. A field the
 * member didn't answer (or an older document without it) is null, never 0, so the
 * table can show "—" instead of a figure that looks real.
 */
export type FeedbackRow = {
  id: string
  memberId: string
  weekNumber: number
  submittedAt: Date
  workoutsDone: number | null
  /** Self-rated nutrition adherence, 0–100. */
  nutritionPct: number | null
  energy: number | null
  trainingFeel: string | null
  pain: string | null
  note: string | null
  reviewStatus: string
  reviewNote: string
  reviewedAt: Date | null
  reviewedByEmail: string
}

export type FeedbackPage = { rows: FeedbackRow[]; cursor: QueryDocumentSnapshot | null }

export const FEEDBACK_PAGE_SIZE = 50

const numberOrNull = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null
const textOrNull = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null

export function readCheckIn(snapshot: QueryDocumentSnapshot): FeedbackRow {
  const data = snapshot.data()
  return {
    id: snapshot.id,
    memberId: snapshot.ref.parent.parent?.id ?? "",
    weekNumber: Number(data.weekNumber ?? 0),
    submittedAt: data.submittedAt instanceof Timestamp ? data.submittedAt.toDate() : new Date(0),
    workoutsDone: numberOrNull(data.workoutsDone),
    nutritionPct: numberOrNull(data.nutritionPct),
    energy: numberOrNull(data.energy),
    trainingFeel: textOrNull(data.trainingFeel),
    pain: textOrNull(data.pain),
    note: textOrNull(data.note),
    reviewStatus: String(data.reviewStatus ?? "unreviewed"),
    reviewNote: String(data.reviewNote ?? ""),
    reviewedAt: data.reviewedAt instanceof Timestamp ? data.reviewedAt.toDate() : null,
    reviewedByEmail: String(data.reviewedByEmail ?? ""),
  }
}

/**
 * One page of check-ins across every member, newest first. A one-off read, so it
 * costs one read per check-in shown. Needs the `checkIns` collection-group
 * indexes (see the PWA's firestore.indexes.json).
 */
export async function fetchFeedback({ week, cursor }: { week: number | null; cursor: QueryDocumentSnapshot | null }): Promise<FeedbackPage> {
  if (!firebaseDb) throw new Error("Feedback is not configured.")
  const snapshot = await getDocs(query(
    collectionGroup(firebaseDb, "checkIns"),
    ...(week ? [where("weekNumber", "==", week)] : []),
    orderBy("submittedAt", "desc"),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(FEEDBACK_PAGE_SIZE),
  ))
  const docs = snapshot.docs.filter((item) => item.ref.parent.parent?.parent.id === "members")
  return {
    rows: docs.map(readCheckIn),
    cursor: snapshot.docs.length === FEEDBACK_PAGE_SIZE ? snapshot.docs.at(-1)! : null,
  }
}

/** A pain answer that reports nothing ("none", "no", "n/a") isn't a flag. */
export function reportsPain(pain: string | null) {
  return !!pain && !/^(none|no|nope|n\/?a|nil|nothing|-+)\.?$/i.test(pain.trim())
}
