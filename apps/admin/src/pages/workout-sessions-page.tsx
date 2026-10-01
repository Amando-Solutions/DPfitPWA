import { useMemo, useState } from "react"
import { useInfiniteQuery } from "@tanstack/react-query"
import { CameraIcon, RefreshCwIcon } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useCohortsQuery, useMembersQuery } from "@/hooks/use-admin-queries"
import { fetchWorkoutSessions, formatDuration, sessionCompletion } from "@/lib/workout-sessions"
import { cn } from "@/lib/utils"

export function WorkoutSessionsPage() {
  const navigate = useNavigate()
  const [week, setWeek] = useState<number | null>(null)
  const membersQuery = useMembersQuery()
  const cohortsQuery = useCohortsQuery()
  const sessions = useInfiniteQuery({
    queryKey: ["workout-sessions", week],
    queryFn: ({ pageParam }) => fetchWorkoutSessions({ week, cursor: pageParam }),
    initialPageParam: null as Parameters<typeof fetchWorkoutSessions>[0]["cursor"],
    getNextPageParam: (page) => page.cursor,
  })

  const names = useMemo(() => new Map((membersQuery.data ?? []).map((member) => [member.id, member.profile.displayName])), [membersQuery.data])
  const rows = sessions.data?.pages.flatMap((page) => page.rows) ?? []
  const weekCount = Math.max(6, ...(cohortsQuery.data ?? []).map((cohort) => cohort.durationWeeks))
  const weekItems = [{ value: "all", label: "All weeks" }, ...Array.from({ length: weekCount }, (_, index) => ({ value: String(index + 1), label: `Week ${index + 1}` }))]

  return <div className="flex min-w-0 flex-col gap-5">
    <header className="grid gap-1">
      <h1 className="text-2xl font-semibold">Workout sessions</h1>
      <p className="text-sm text-muted-foreground">Every completed session, across all members, newest first. Completion is sets done out of sets prescribed; Qualifies is decided by the member app when the session is saved.</p>
    </header>

    <div className="flex flex-wrap items-center justify-between gap-3">
      <Select items={weekItems} value={week ? String(week) : "all"} onValueChange={(value) => value && setWeek(value === "all" ? null : Number(value))}>
        <SelectTrigger className="w-40" aria-label="Filter by week"><SelectValue /></SelectTrigger>
        <SelectContent><SelectGroup>{weekItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
      </Select>
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        {sessions.data && <span>{rows.length}{sessions.hasNextPage ? "+" : ""} sessions</span>}
        <Button variant="outline" size="sm" disabled={sessions.isFetching} onClick={() => void sessions.refetch()}>{sessions.isRefetching ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}Refresh</Button>
      </div>
    </div>

    {sessions.error && <Alert variant="destructive"><AlertTitle>Sessions unavailable</AlertTitle><AlertDescription>{sessions.error.message}</AlertDescription></Alert>}
    {sessions.isPending && <Skeleton className="h-96 w-full rounded-lg" />}
    {sessions.data && (rows.length === 0
      ? <Empty className="min-h-64 rounded-lg border"><EmptyHeader><EmptyTitle>No sessions{week ? ` in week ${week}` : ""}</EmptyTitle><EmptyDescription>Completed workouts appear here as members log them.</EmptyDescription></EmptyHeader></Empty>
      : <div className="overflow-hidden rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="[&>th]:text-[11px] [&>th]:font-medium [&>th]:tracking-wide [&>th]:text-muted-foreground [&>th]:uppercase">
                <TableHead className="pl-4">Member</TableHead><TableHead>Day</TableHead><TableHead>Week</TableHead><TableHead>Date</TableHead>
                <TableHead>Duration</TableHead><TableHead>Photo</TableHead><TableHead>Completion</TableHead><TableHead className="pr-4">Qualifies</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const completion = sessionCompletion(row)
                return <TableRow key={`${row.memberId}/${row.id}`} className="cursor-pointer" onClick={() => navigate(`/members/${encodeURIComponent(row.memberId)}`)}>
                  <TableCell className="pl-4 font-medium">{names.get(row.memberId) ?? <span className="text-muted-foreground">Unknown member</span>}</TableCell>
                  <TableCell className="max-w-64 truncate">Day {row.dayNumber} — {row.label}</TableCell>
                  <TableCell>{row.weekNumber > 0 ? <Badge variant="outline" className="font-mono">W{row.weekNumber}</Badge> : "—"}</TableCell>
                  <TableCell className="font-mono text-xs tabular-nums" title={row.completedAt.toLocaleString()}>{row.completedAt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">{formatDuration(row.durationSeconds)}</TableCell>
                  <TableCell>{row.hasPhoto ? <CameraIcon className="size-4" aria-label="Photo submitted" /> : <span className="text-muted-foreground" aria-label="No photo">—</span>}</TableCell>
                  <TableCell className={cn("font-mono text-xs tabular-nums", !row.qualifies && "text-destructive")}>{completion === null ? "—" : `${completion}%`}</TableCell>
                  <TableCell className="pr-4">{row.qualifies
                    ? <Badge variant="secondary" className="gap-1.5"><span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />Qualifies</Badge>
                    : <Badge variant="outline" className="gap-1.5 text-destructive"><span className="size-1.5 rounded-full bg-destructive" aria-hidden />Below threshold</Badge>}</TableCell>
                </TableRow>
              })}
            </TableBody>
          </Table>
        </div>)}
    {sessions.hasNextPage && <Button variant="outline" className="self-center" disabled={sessions.isFetchingNextPage} onClick={() => void sessions.fetchNextPage()}>{sessions.isFetchingNextPage && <Spinner data-icon="inline-start" />}Load more</Button>}
  </div>
}
