import type { User } from "firebase/auth"
import { collection, doc, onSnapshot, runTransaction, serverTimestamp, type Unsubscribe } from "firebase/firestore"
import { firebaseDb } from "@/lib/firebase"
import { readExercises, type ProgramRecord, type ProgramWorkoutDay } from "@/lib/programs"
import { normalizeDay, resolveWeek, sameDayStructure, validateWeek, type ProgramWeek } from "@/lib/program-week-model"

export function subscribeToProgramWeeks(programId: string, onData: (weeks: ProgramWeek[]) => void, onError: (message: string) => void): Unsubscribe {
  if (!firebaseDb) { onError("Programs are not configured."); return () => {} }
  return onSnapshot(collection(firebaseDb, "programs", programId, "weeks"), (snapshot) => {
    onData(snapshot.docs.flatMap((document) => {
      const data = document.data()
      if (!Array.isArray(data.days)) return []
      return [{ weekNumber: Number(data.weekNumber), days: data.days.map((day: ProgramWorkoutDay) => ({ ...day, exercises: readExercises(day.exercises) })) }]
    }))
  }, () => onError("Weekly training plans could not be loaded."))
}

export async function saveProgramWeeks({ program, weeks, legacyDays, changes, user }: {
  program: ProgramRecord; weeks: ProgramWeek[]; legacyDays: ProgramWorkoutDay[]
  changes: ProgramWeek[]; user: User
}) {
  if (!firebaseDb) throw new Error("Programs are not configured.")
  const database = firebaseDb
  const live = program.status === "published"
  const validated = changes.map((week) => {
    if (!Number.isInteger(week.weekNumber) || week.weekNumber < 1 || week.weekNumber > program.totalWeeks) throw new Error("Choose a week within this program.")
    if (live && !sameDayStructure(week.days, resolveWeek(weeks, legacyDays, week.weekNumber))) {
      throw new Error(`Week ${week.weekNumber}: training days can't be added or removed in a published program.`)
    }
    return { ...week, days: validateWeek(week.days) }
  })
  await runTransaction(database, async (transaction) => {
    const reference = doc(database, "programs", program.id)
    const snapshot = await transaction.get(reference)
    const current = snapshot.data()
    if (current?.status !== program.status || (current.status !== "draft" && current.status !== "published")) throw new Error("This program can no longer be edited here. Reload and try again.")
    if ((current.scheduleRevision ?? 0) !== (program.scheduleRevision ?? 0) || current.totalWeeks !== program.totalWeeks) throw new Error("The schedule changed elsewhere. Reload before saving your edits.")
    // Freeze untouched legacy weeks on the first edit; copies never inherit later edits.
    const complete = Array.from({ length: program.totalWeeks }, (_, index) => {
      const weekNumber = index + 1
      return validated.find((week) => week.weekNumber === weekNumber)
        ?? { weekNumber, days: resolveWeek(weeks, legacyDays, weekNumber).map(normalizeDay) }
    })
    for (const week of complete) {
      transaction.set(doc(database, "programs", program.id, "weeks", `week-${week.weekNumber}`), {
        ...week, updatedAt: serverTimestamp(), updatedByUid: user.uid, updatedByEmail: user.email,
      }, { merge: true }) // PWA week docs share these ids; never drop their title/dates.
    }
    transaction.update(reference, {
      scheduleRevision: (current.scheduleRevision ?? 0) + 1,
      // Live edits keep the structure, so the published day count stays as it was.
      ...(live ? {} : { workoutDayCount: complete.reduce((total, week) => total + week.days.length, 0) }),
      updatedAt: serverTimestamp(), updatedByUid: user.uid, updatedByEmail: user.email,
    })
  })
}
