import { createContext, useContext, useMemo, useState, type ReactNode } from "react"
import { useCohortsQuery, useProgramsQuery } from "@/hooks/use-admin-queries"
import { cohortOver } from "@/lib/cohort-calendar"
import { cohortInProgress, type CohortRecord } from "@/lib/cohorts"
import type { ProgramRecord } from "@/lib/programs"

type SelectedCohort = {
  /** The cohort every cohort-scoped page shows; null while loading or when there are none. */
  cohort: CohortRecord | null
  /** Whether that cohort is over: past its last day. Its members see only the ended screen. */
  cohortEnded: boolean
  program: ProgramRecord | null
  /**
   * Cohorts that can be picked: everything not archived. A completed one stays,
   * after the rest, so its results can still be read — a member who has moved
   * on to another cohort is in both — and its last day moved to reopen it.
   */
  cohorts: CohortRecord[]
  setCohortId: (id: string) => void
  isPending: boolean
}

const SelectedCohortContext = createContext<SelectedCohort | null>(null)
const STORAGE_KEY = "dpfit-admin:selected-cohort"

export function SelectedCohortProvider({ children }: { children: ReactNode }) {
  const cohortsQuery = useCohortsQuery()
  const programsQuery = useProgramsQuery()
  const [pickedId, setPickedId] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY))

  const [now] = useState(() => new Date())

  const value = useMemo<SelectedCohort>(() => {
    const open = (cohortsQuery.data ?? []).filter((cohort) => cohort.status !== "archived")
    const cohorts = [
      ...open.filter((cohort) => !cohortOver(cohort, now)),
      ...open.filter((cohort) => cohortOver(cohort, now)),
    ]
    const active = cohorts.find((cohort) => cohortInProgress(cohort, now))
      ?? cohorts.find((cohort) => cohort.status === "active")
      ?? cohorts[0]
      ?? null
    // One cohort runs at a time, but any can be opened: a finished one's results stay readable.
    const cohort = cohorts.find((item) => item.id === pickedId) ?? active
    return {
      cohort,
      cohortEnded: cohort ? cohortOver(cohort, now) : false,
      program: (programsQuery.data ?? []).find((program) => program.id === cohort?.programId) ?? null,
      cohorts,
      setCohortId: (id) => { setPickedId(id); localStorage.setItem(STORAGE_KEY, id) },
      isPending: cohortsQuery.isPending,
    }
  }, [cohortsQuery.data, cohortsQuery.isPending, programsQuery.data, pickedId, now])

  return <SelectedCohortContext.Provider value={value}>{children}</SelectedCohortContext.Provider>
}

export function useSelectedCohort() {
  const value = useContext(SelectedCohortContext)
  if (!value) throw new Error("useSelectedCohort must be used inside SelectedCohortProvider.")
  return value
}
