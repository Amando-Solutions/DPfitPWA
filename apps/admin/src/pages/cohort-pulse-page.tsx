import { type ReactNode } from "react"
import { RefreshCwIcon, VideoIcon } from "lucide-react"
import { Link } from "react-router-dom"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useAccessCodesQuery, useCohortsQuery, useLiveCallsQuery, useProgramsQuery } from "@/hooks/use-admin-queries"
import { effectiveCodeStatus } from "@/lib/access-codes"
import { INACTIVE_AFTER_DAYS, pendingSignups as countPendingSignups, programPhases, type PulseIssue } from "@/lib/cohort-pulse"
import { callEnd } from "@/lib/live-calls"
import { cn } from "@/lib/utils"
import { useCohortPulse } from "@/hooks/use-cohort-pulse"
import { useSelectedCohort } from "@/hooks/use-selected-cohort"

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const ISSUE_DOT: Record<PulseIssue["kind"], string> = {
  inactive: "bg-destructive",
  "missing-check-in": "bg-amber-500",
  flagged: "bg-destructive",
  pain: "bg-amber-500",
}

function Kpi({ label, value, detail }: { label: string; value: ReactNode; detail: ReactNode }) {
  return <Card size="sm" className="rounded-lg">
    <CardContent className="grid gap-1">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="text-3xl font-semibold tabular-nums">{value}</p>
      <p className="truncate text-xs text-muted-foreground">{detail}</p>
    </CardContent>
  </Card>
}

export function CohortPulsePage() {
  const cohortsQuery = useCohortsQuery()
  const programsQuery = useProgramsQuery()
  const codesQuery = useAccessCodesQuery()
  const callsQuery = useLiveCallsQuery()
  const { cohort, program } = useSelectedCohort()
  const { query: pulse, membersQuery, members, now, currentWeek, weekOwed, issues: allIssues } = useCohortPulse(cohort)
  const durationWeeks = cohort?.durationWeeks ?? 0

  const loading = cohortsQuery.isPending || membersQuery.isPending
  const error = cohortsQuery.error ?? membersQuery.error ?? programsQuery.error ?? codesQuery.error

  const phases = programPhases(program, durationWeeks)
  const currentPhase = phases.find((phase) => currentWeek >= phase.fromWeek && currentWeek <= phase.toWeek) ?? null
  const ended = !!cohort && now >= cohort.startDate.getTime() + durationWeeks * WEEK_MS
  const active = members.filter((member) => member.status === "active")

  return <div className="flex min-w-0 flex-col gap-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Cohort pulse</h1>
        <p className="text-sm text-muted-foreground">
          {!cohort ? "How the cohort is doing right now." : [
            ended ? "Completed" : currentWeek > 0 ? `Week ${currentWeek} of ${durationWeeks}` : `Starts ${cohort.startDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
            currentPhase && !ended && currentWeek > 0 ? `${currentPhase.title} phase` : null,
            `${active.length} active member${active.length === 1 ? "" : "s"}`,
          ].filter(Boolean).join(" · ")}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={pulse.isFetching || !cohort} onClick={() => void pulse.refetch()}>{pulse.isFetching ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}Refresh</Button>
      </div>
    </header>

    {error && <Alert variant="destructive"><AlertTitle>Cohort pulse unavailable</AlertTitle><AlertDescription>{error.message}</AlertDescription></Alert>}
    {pulse.error && <Alert variant="destructive"><AlertTitle>Check-ins and sessions could not be loaded</AlertTitle><AlertDescription>{pulse.error.message}</AlertDescription></Alert>}
    {loading && <Skeleton className="h-96 w-full rounded-lg" />}
    {!loading && !cohort && <Empty className="min-h-64 rounded-lg border"><EmptyHeader><EmptyTitle>No cohorts yet</EmptyTitle><EmptyDescription>The pulse appears once a cohort is running.</EmptyDescription></EmptyHeader></Empty>}
    {!loading && cohort && pulseBody()}
  </div>

  function pulseBody() {
    if (!cohort) return null
    const data = pulse.data
    const inactive = active.filter((member) => {
      const since = member.stats.lastSessionAt ?? new Date(Math.max(cohort.startDate.getTime(), member.joinedAt.getTime()))
      return now >= cohort.startDate.getTime() && now - since.getTime() > INACTIVE_AFTER_DAYS * 24 * 60 * 60 * 1000
    }).length
    const latest = data ? active.flatMap((member) => {
      const row = data.checkIns.filter((item) => item.memberId === member.id && item.nutritionPct !== null).sort((a, b) => b.weekNumber - a.weekNumber)[0]
      return row ? [row.nutritionPct!] : []
    }) : []
    const adherence = latest.length ? Math.round(latest.reduce((sum, value) => sum + value, 0) / latest.length) : null
    const unusedCodes = (codesQuery.data ?? []).filter((code) => code.cohortId === cohort.id && effectiveCodeStatus(code) === "unused").length
    const pendingSignups = data ? countPendingSignups(data, membersQuery.data ?? []) : null
    const issues = allIssues
    const issueMembers = new Set(issues.map((issue) => issue.memberId)).size
    const checkedInThisWeek = data && weekOwed > 0 ? active.filter((member) => data.checkIns.some((row) => row.memberId === member.id && row.weekNumber === weekOwed)).length : null
    const nextCall = (callsQuery.data ?? []).filter((call) => call.cohortId === cohort.id && callEnd(call).getTime() > now).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0]
    const pending = <Skeleton className="h-9 w-12" />

    return <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Active members" value={active.length} detail={`${inactive} inactive · ${members.length - active.length} not active`} />
        <Kpi label="Avg. adherence" value={!data ? pending : adherence === null ? "—" : `${adherence}%`} detail={latest.length ? `Across ${latest.length} latest check-in${latest.length === 1 ? "" : "s"}` : "No check-ins yet"} />
        <Kpi label="Sessions this week" value={!data ? pending : data.sessionsThisWeek} detail={currentWeek > 0 && !ended ? `Logged so far in Week ${currentWeek}` : ended ? `Logged in the final week` : "Cohort hasn't started"} />
        <Kpi label="Unused codes" value={unusedCodes} detail="Ready to hand out" />
        <Kpi label="Pending signups" value={pendingSignups ?? pending} detail="Registered, not yet a member" />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card size="sm" className="rounded-lg">
          <CardHeader>
            <CardTitle>Needs attention ({data ? issues.length : "…"})</CardTitle>
            <CardDescription>{data ? `${issueMembers} of ${active.length} active members. Inactive means no workout in ${INACTIVE_AFTER_DAYS} days.` : "Checking check-ins and sessions…"}</CardDescription>
          </CardHeader>
          <CardContent>
            {!data ? <Skeleton className="h-48 w-full" />
              : issues.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Everyone's on track.</p>
              : <ul className="grid max-h-[36rem] gap-1.5 overflow-y-auto pr-1">
                  {issues.map((issue) => <li key={`${issue.memberId}-${issue.kind}`}>
                    <Link to={`/members/${encodeURIComponent(issue.memberId)}`} className="flex gap-3 rounded-md bg-muted/60 px-3 py-2 hover:bg-muted">
                      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", ISSUE_DOT[issue.kind])} aria-hidden />
                      <span className="grid min-w-0 gap-0.5">
                        <span className="text-sm"><span className="font-semibold">{issue.memberName}</span> — {issue.title}</span>
                        <span className="truncate text-xs text-muted-foreground">{issue.detail}</span>
                      </span>
                    </Link>
                  </li>)}
                </ul>}
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card size="sm" className="rounded-lg">
            <CardHeader><CardTitle>Cohort phase</CardTitle></CardHeader>
            <CardContent className="grid gap-3">
              <div className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_2rem] items-center gap-x-3 gap-y-2 text-sm">
                {phases.map((phase) => {
                  const here = phase === currentPhase && !ended
                  return <div key={phase.fromWeek} className="contents">
                    <span className={cn("truncate", here ? "font-medium" : "text-muted-foreground")}>{phase.title}<span className="ml-1.5 font-mono text-[11px] text-muted-foreground">W{phase.fromWeek}{phase.toWeek > phase.fromWeek ? `–${phase.toWeek}` : ""}</span></span>
                    <span className="h-2 overflow-hidden rounded-full bg-muted"><span className={cn("block h-full rounded-full", here ? "bg-primary" : phase.toWeek < currentWeek || ended ? "bg-muted-foreground/30" : "")} style={{ width: here || phase.toWeek < currentWeek || ended ? "100%" : "0%" }} /></span>
                    <span className="text-right font-mono text-xs tabular-nums">{here ? active.length : 0}</span>
                  </div>
                })}
              </div>
              <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">Everyone in a cohort shares the same week. It's counted from the cohort's start date ({cohort.startDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}), never chosen by hand. Change it in <Link to="/cohorts" className="font-medium text-foreground underline-offset-2 hover:underline">Cohorts</Link>.</p>
            </CardContent>
          </Card>

          <Card size="sm" className="rounded-lg">
            <CardHeader><CardTitle>This week</CardTitle></CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Check-ins for week {weekOwed || "—"}</span><span className="font-mono tabular-nums">{weekOwed === 0 ? "Not due yet" : checkedInThisWeek === null ? "…" : `${checkedInThisWeek} of ${active.length}`}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Leaderboard</span><span>{cohort.leaderboardVisible ? "Visible to members" : cohort.leaderboardRevealWeek ? `Hidden until W${cohort.leaderboardRevealWeek}` : "Hidden"}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Next live call</span>
                {nextCall ? <a href={nextCall.joinUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 truncate underline-offset-2 hover:underline"><VideoIcon className="size-3.5" />{nextCall.startsAt.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</a>
                  : <Link to="/live-calls" className="text-muted-foreground underline-offset-2 hover:underline">None scheduled</Link>}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  }
}
