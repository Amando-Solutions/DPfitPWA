import type { SetType } from './types'

// =============================================================================
// Wording for the set-type picker.
//
// Everything the member reads about set types lives here: the name of each one
// in the picker, the letter its badge carries in the SET column, and the
// explanation behind its "?". The logic that uses them — numbering, defaults —
// is in `~/lib/domain/sets` and does not need touching to reword anything.
// =============================================================================

export interface SetTypeCopy {
  type: SetType
  /** Name of the option in the picker. */
  label: string
  /**
   * The letter in the SET column.
   *
   * Empty for `normal`, which shows its number instead — that number is
   * positional, so it is worked out from the set's place in the exercise
   * rather than stored here.
   */
  badge: string
  /** Heading of the explainer. */
  title: string
  /** What the set type means, in the member's words. */
  description: string
}

/** In picker order, which is also roughly the order they happen in a session. */
export const setTypeCopy: SetTypeCopy[] = [
  {
    type: 'warmup',
    label: 'Warm Up Set',
    badge: 'W',
    title: 'Warm up set',
    description:
      'Warm up sets are used to prepare the body to lift heavier weights.',
  },
  {
    type: 'normal',
    label: 'Normal Set',
    badge: '',
    title: 'Normal set',
    description:
      'Normal sets refer to "working sets" since these will increase strength/muscle',
  },
  {
    type: 'failure',
    label: 'Failure Set',
    badge: 'F',
    title: 'Failure set',
    description:
      'Failure set is a normal set in which you reached muscle failure and were not able to complete the last rep of the exercise successfully. If you fail on your 11th rep you should record 10 reps.',
  },
  {
    type: 'drop',
    label: 'Drop Set',
    badge: 'D',
    title: 'Drop set',
    description:
      'A technique for continuing an exercise with a lower weight once muscle failure has been achieved at a higher weight',
  },
]

/** The destructive option at the foot of the picker. Not a set type. */
export const removeSetCopy = {
  label: 'Remove Set',
  badge: 'X',
}
