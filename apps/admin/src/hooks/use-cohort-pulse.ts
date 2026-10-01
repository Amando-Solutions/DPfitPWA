import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useMembersQuery } from "@/hooks/use-admin-queries"
import type { CohortRecord } from "@/lib/cohorts"
import { checkInWeekOwed, fetchCohortPulse, pulseIssues } from "@/lib/cohort-pulse"
import { cohortWeek } from "@/lib/leaderboard"

/**
 * A cohort's members, current week, and the check-in/session read behind the
 * attention flags. Shared by the header's attention bar and the Cohort pulse
 * page: one cached read per cohort, reloaded after 5 minutes or on Refresh,
 * never on window focus.
 */
export function useCohortPulse(cohort: CohortRecord | null) {
  const membersQuery = useMembersQuery()
  const [now] = useState(() => Date.now())
  const members = useMemo(() => (membersQuery.data ?? []).filter((member) => cohort && member.cohortId === cohort.id), [membersQuery.data, cohort])
  const memberIds = members.map((member) => member.id)
  const durationWeeks = cohort?.durationWeeks ?? 0
  const currentWeek = cohort ? cohortWeek(cohort.startDate, durationWeeks, now) : 0
  const weekOwed = cohort ? checkInWeekOwed(cohort.startDate, durationWeeks, now) : 0

  const query = useQuery({
    queryKey: ["cohort-pulse", cohort?.id, memberIds.join(","), currentWeek],
    queryFn: () => fetchCohortPulse(cohort!.id, memberIds, currentWeek),
    enabled: !!cohort && !membersQuery.isPending,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const issues = useMemo(
    () => cohort && query.data ? pulseIssues({ members, checkIns: query.data.checkIns, startDate: cohort.startDate, weekOwed, now }) : [],
    [cohort, query.data, members, weekOwed, now],
  )

  return { query, membersQuery, members, now, currentWeek, weekOwed, issues }
}
