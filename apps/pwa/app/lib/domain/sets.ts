import type { LoggedExercise, LoggedSet, SetType } from '~/data/types'
import { setTypeCopy } from '~/data/setTypes'

/*
  Set-type logic. The wording lives in `~/data/setTypes` — reword an
  explanation there without coming here.
*/

/** The picker's options, in order, with their wording. */
export const setTypes = setTypeCopy

const metaFor = (type: SetType) => setTypeCopy.find((meta) => meta.type === type)

/**
 * The type of a set, defaulting to `normal`.
 *
 * Sessions logged before set types existed have no `setType` at all, and a
 * session in flight when the app updates is one of them. Reading through this
 * is what keeps those rows numbered rather than blank.
 */
export const setTypeOf = (set: LoggedSet): SetType => set.setType ?? 'normal'

/**
 * How many sets the plan asked for, for one exercise.
 *
 * The number the qualifying threshold is measured against. It is stored on the
 * exercise at session start precisely so that nothing the member does during
 * the session can move it — removing a set takes the row away without touching
 * the bar it was counted toward.
 *
 * The fallback is for sessions logged before the field existed. Those could
 * only ever delete sets the member had added themselves, so the prescribed
 * sets are exactly the ones still in the array with `added` false.
 */
export const prescribedSets = (exercise: LoggedExercise): number =>
  exercise.setsPrescribed ?? (exercise.sets ?? []).filter((set) => !set.added).length

/** One rendered row of the set table. */
export interface SetRow {
  set: LoggedSet
  /** Where the set sits in `sets`, which is what every event carries. */
  index: number
  /** The SET column: a number for normal sets, a letter for the rest. */
  label: string
}

/**
 * The set table for one exercise: one row per set, and what each is called.
 *
 * Numbering is derived rather than stored: only normal sets are counted, and
 * they are counted from 1 within the exercise. That is the whole reason it is
 * computed on every render — change one row from normal to a warm-up and every
 * number below it has to shift up, and a stored index cannot do that without a
 * second pass to rewrite it.
 */
export const setRows = (sets: LoggedSet[] | undefined): SetRow[] => {
  let n = 0
  // Documents in the wild are not always the shape the types promise: the
  // seeded sample session in this project has no `exercises` key at all. A
  // missing array here used to throw out of the whole card, taking the "Add
  // set" button with it — so there was no way back from it in the app either.
  return (sets ?? []).map((set, index) => {
    const type = setTypeOf(set)
    const badge = type === 'normal' ? '' : metaFor(type)?.badge
    return { set, index, label: badge || String(++n) }
  })
}

/**
 * The number this set would carry if it were a normal set.
 *
 * The picker shows it against its "Normal Set" option, so that option is a
 * number whatever the row currently is. It counts the normal sets above this
 * one, which is the same rule `setRows` applies — a warm-up two rows up does
 * not push the count along.
 */
export const normalNumberFor = (
  sets: LoggedSet[] | undefined,
  index: number,
): string => {
  let n = 0
  const all = sets ?? []
  for (let i = 0; i < index && i < all.length; i++) {
    if (setTypeOf(all[i]!) === 'normal') n += 1
  }
  return String(n + 1)
}
