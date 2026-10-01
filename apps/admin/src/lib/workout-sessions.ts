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

export type WorkoutSessionRow = {
  id: string
  memberId: string
  dayNumber: number
  label: string
  weekNumber: number
  completedAt: Date
  durationSeconds: number
  setsDone: number
  setsTotal: number
  qualifies: boolean
  hasPhoto: boolean
}

export type WorkoutSessionPage = {
  rows: WorkoutSessionRow[]
  cursor: QueryDocumentSnapshot | null
}

export const SESSIONS_PAGE_SIZE = 50

function readRow(snapshot: QueryDocumentSnapshot): WorkoutSessionRow {
  const data = snapshot.data()
  return {
    id: snapshot.id,
    // members/{memberId}/sessions/{sessionId}
    memberId: snapshot.ref.parent.parent?.id ?? "",
    dayNumber: Number(data.dayNumber ?? 0),
    label: String(data.label ?? "Workout"),
    weekNumber: Number(data.weekNumber ?? 0),
    completedAt: data.completedAt instanceof Timestamp ? data.completedAt.toDate() : new Date(0),
    durationSeconds: Number(data.durationSeconds ?? 0),
    setsDone: Number(data.setsDone ?? 0),
    setsTotal: Number(data.setsTotal ?? 0),
    qualifies: data.qualifies === true,
    hasPhoto: !!data.proofPhoto && typeof data.proofPhoto === "object",
  }
}

/**
 * One page of completed sessions across every member, newest first. A one-off
 * read rather than a listener, so it costs one read per session actually shown.
 * Needs the `sessions` collection-group indexes (see the PWA's firestore.indexes.json).
 */
export async function fetchWorkoutSessions({ week, cursor }: { week: number | null; cursor: QueryDocumentSnapshot | null }): Promise<WorkoutSessionPage> {
  if (!firebaseDb) throw new Error("Workout sessions are not configured.")
  const snapshot = await getDocs(query(
    collectionGroup(firebaseDb, "sessions"),
    ...(week ? [where("weekNumber", "==", week)] : []),
    orderBy("completedAt", "desc"),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(SESSIONS_PAGE_SIZE),
  ))
  // Only member sessions: a `sessions` collection anywhere else isn't a workout.
  const docs = snapshot.docs.filter((item) => item.ref.parent.parent?.parent.id === "members")
  return {
    rows: docs.map(readRow),
    cursor: snapshot.docs.length === SESSIONS_PAGE_SIZE ? snapshot.docs.at(-1)! : null,
  }
}

export function sessionCompletion(row: Pick<WorkoutSessionRow, "setsDone" | "setsTotal">) {
  return row.setsTotal > 0 ? Math.round((row.setsDone / row.setsTotal) * 100) : null
}

export function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`
    : `${minutes}m ${String(rest).padStart(2, "0")}s`
}
