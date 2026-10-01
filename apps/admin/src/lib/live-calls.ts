import type { User } from "firebase/auth"
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  type Unsubscribe,
} from "firebase/firestore"
import { firebaseDb } from "@/lib/firebase"

export type LiveCallRecord = {
  id: string
  title: string
  cohortId: string
  cohortName: string
  startsAt: Date
  durationMinutes: number
  joinUrl: string
}

export type LiveCallInput = Omit<LiveCallRecord, "id">

function requireDatabase() {
  if (!firebaseDb) throw new Error("Live calls are not configured.")
  return firebaseDb
}

export const callEnd = (call: Pick<LiveCallRecord, "startsAt" | "durationMinutes">) =>
  new Date(call.startsAt.getTime() + call.durationMinutes * 60_000)

function readCall(id: string, data: Record<string, unknown>): LiveCallRecord {
  return {
    id,
    title: String(data.title ?? ""),
    cohortId: String(data.cohortId ?? ""),
    cohortName: String(data.cohortName ?? ""),
    startsAt: data.startsAt instanceof Timestamp ? data.startsAt.toDate() : new Date(0),
    durationMinutes: Number(data.durationMinutes ?? 60),
    joinUrl: String(data.joinUrl ?? ""),
  }
}

export function subscribeToLiveCalls(onData: (records: LiveCallRecord[]) => void, onError: (message: string) => void): Unsubscribe {
  if (!firebaseDb) { onError("Live calls are not configured."); return () => {} }
  return onSnapshot(collection(firebaseDb, "liveCalls"), (snapshot) => {
    onData(snapshot.docs.map((item) => readCall(item.id, item.data())).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()))
  }, () => onError("Live calls could not be loaded."))
}

function validate(input: LiveCallInput) {
  const title = input.title.trim()
  const joinUrl = input.joinUrl.trim()
  if (title.length < 2 || title.length > 100) throw new Error("Call titles must be 2–100 characters.")
  if (!input.cohortId) throw new Error("Choose a cohort for this call.")
  if (Number.isNaN(input.startsAt.getTime())) throw new Error("Choose a date and time.")
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 5 || input.durationMinutes > 480) throw new Error("Duration must be between 5 and 480 minutes.")
  if (!/^https:\/\/\S+$/.test(joinUrl) || joinUrl.length > 2048) throw new Error("The meeting link must be a full https:// URL.")
  return { title, cohortId: input.cohortId, cohortName: input.cohortName, startsAt: Timestamp.fromDate(input.startsAt), durationMinutes: input.durationMinutes, joinUrl }
}

// Members read these documents directly (their own cohort's), so saving is all there is.
export async function createLiveCall(input: LiveCallInput, user: User) {
  await addDoc(collection(requireDatabase(), "liveCalls"), { ...validate(input), ...audit(user) })
}

export async function updateLiveCall(call: LiveCallRecord, input: LiveCallInput, user: User) {
  await setDoc(doc(requireDatabase(), "liveCalls", call.id), { ...validate(input), ...audit(user) })
}

export async function deleteLiveCall(call: LiveCallRecord) {
  await deleteDoc(doc(requireDatabase(), "liveCalls", call.id))
}

function audit(user: User) {
  return { updatedAt: serverTimestamp(), updatedByUid: user.uid, updatedByEmail: user.email }
}
