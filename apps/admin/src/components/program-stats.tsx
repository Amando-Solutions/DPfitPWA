import { useState, type ReactNode } from "react"
import { CalendarDaysIcon, DumbbellIcon, ListChecksIcon, TimerIcon, UsersIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useCohortsQuery, useMembersQuery } from "@/hooks/use-admin-queries"
import { isParticipating, PARTICIPATION_WINDOW_DAYS } from "@/lib/member-dashboard"
import { activeExercises, resolveWeek, type ProgramWeek } from "@/lib/program-week-model"
import type { ProgramRecord, ProgramWorkoutDay } from "@/lib/programs"

const DAY_MS = 24 * 60 * 60 * 1000

function StatCard({ label, icon, value, detail }: { label: string; icon: ReactNode; value: ReactNode; detail?: ReactNode }) {
  return <Card size="sm" className="rounded-lg">
    <CardContent className="grid gap-1">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground [&_svg]:size-4">{label}{icon}</div>
      <p className="truncate text-2xl font-semibold tabular-nums">{value}</p>
      {detail && <p className="truncate text-xs text-muted-foreground">{detail}</p>}
    </CardContent>
  </Card>
}

function DurationStat({ program }: { program: ProgramRecord }) {
  return <StatCard label="Duration" icon={<CalendarDaysIcon />} value={`${program.totalWeeks} weeks`} detail={`${program.totalDays} days`} />
}

function ScheduleStat({ program }: { program: ProgramRecord }) {
  return <StatCard label="Weekly schedule" icon={<TimerIcon />} value={`${program.sessionsPerWeek} sessions`} detail="per week" />
}

function ExercisesStat({ program, weeks, legacyDays }: { program: ProgramRecord; weeks?: ProgramWeek[]; legacyDays?: ProgramWorkoutDay[] }) {
  if (!weeks || !legacyDays) return <StatCard label="Exercises added" icon={<DumbbellIcon />} value={<Skeleton className="h-8 w-16" />} />
  const scheduled = Array.from({ length: program.totalWeeks }, (_, index) => resolveWeek(weeks, legacyDays, index + 1))
    .flatMap((days) => days.flatMap(activeExercises))
  const unique = new Set(scheduled.map((exercise) => exercise.name.trim().toLowerCase()).filter(Boolean)).size
  return <StatCard label="Exercises added" icon={<DumbbellIcon />} value={scheduled.length} detail={`${unique} unique across ${program.totalWeeks} weeks`} />
}

// A live program's progress comes from the cohorts pinned to it.
function LiveStats({ program }: { program: ProgramRecord }) {
  const cohortsQuery = useCohortsQuery()
  const membersQuery = useMembersQuery()
  const [now] = useState(() => Date.now())
  const cohorts = (cohortsQuery.data ?? [])
    .filter((cohort) => cohort.programId === program.id && cohort.status === "active")
    .sort((a, b) => b.memberCount - a.memberCount)
  const cohortIds = new Set(cohorts.map((cohort) => cohort.id))
  const enrolled = (membersQuery.data ?? []).filter((member) => member.status === "active" && (cohortIds.has(member.cohortId) || member.programId === program.id))
  const participating = enrolled.filter((member) => isParticipating(member, now))

  let state: { value: string; detail: string }
  const lead = cohorts[0]
  if (!lead) state = { value: "Not running", detail: "No active cohort" }
  else {
    const week = Math.floor((now - lead.startDate.getTime()) / (7 * DAY_MS)) + 1
    const more = cohorts.length > 1 ? ` +${cohorts.length - 1} more` : ""
    state = week < 1
      ? { value: "Not started", detail: `${lead.name} starts ${lead.startDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}${more}` }
      : week > program.totalWeeks
        ? { value: "Completed", detail: `${lead.name}${more}` }
        : { value: `Week ${week} of ${program.totalWeeks}`, detail: `${lead.name}${more}` }
  }

  return <>
    <StatCard label="Current state" icon={<ListChecksIcon />} value={cohortsQuery.isPending ? <Skeleton className="h-8 w-28" /> : state.value} detail={cohortsQuery.isPending ? undefined : state.detail} />
    <ScheduleStat program={program} />
    <StatCard label="Active members" icon={<UsersIcon />}
      value={membersQuery.isPending || cohortsQuery.isPending ? <Skeleton className="h-8 w-12" /> : participating.length}
      detail={membersQuery.error ? "Members could not be loaded" : `of ${enrolled.length} enrolled · trained in last ${PARTICIPATION_WINDOW_DAYS} days`} />
  </>
}

export function ProgramStats({ program, weeks, legacyDays }: { program: ProgramRecord; weeks?: ProgramWeek[]; legacyDays?: ProgramWorkoutDay[] }) {
  const live = program.status === "published"
  return <section aria-label="Program stats" className={`grid gap-3 sm:grid-cols-2 ${live ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
    {live ? <>
      <DurationStat program={program} />
      <LiveStats program={program} />
    </> : <>
      <ExercisesStat program={program} weeks={weeks} legacyDays={legacyDays} />
      <DurationStat program={program} />
      <ScheduleStat program={program} />
    </>}
  </section>
}
