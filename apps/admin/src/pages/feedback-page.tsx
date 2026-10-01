import { Fragment, useMemo, useState } from "react"
import { useInfiniteQuery } from "@tanstack/react-query"
import { ChevronDownIcon, ChevronRightIcon, RefreshCwIcon } from "lucide-react"
import { Link } from "react-router-dom"
import { CheckInReviewForm } from "@/components/check-in-review-form"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useCohortsQuery, useMembersQuery } from "@/hooks/use-admin-queries"
import { fetchFeedback, reportsPain, type FeedbackRow } from "@/lib/feedback"
import { humanizeMemberValue } from "@/lib/member-dashboard"
import { cn } from "@/lib/utils"

const COLUMNS = 7
// A missing answer reads as "not given", never as a zero.
const Missing = () => <span className="text-muted-foreground" aria-label="Not answered">—</span>

function NoteBlock({ label, value, alert }: { label: string; value: string | null; alert?: boolean }) {
  return <div className="grid content-start gap-1">
    <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
    <p className={cn("text-sm whitespace-pre-wrap", !value && "text-muted-foreground", alert && "text-destructive")}>{value ?? "—"}</p>
  </div>
}

function ReviewBadge({ status }: { status: string }) {
  if (status === "needs-attention") return <Badge variant="outline" className="gap-1.5 text-destructive"><span className="size-1.5 rounded-full bg-destructive" aria-hidden />Needs attention</Badge>
  if (status === "reviewed") return <Badge variant="secondary">Reviewed</Badge>
  return null
}

export function FeedbackPage() {
  const [week, setWeek] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const membersQuery = useMembersQuery()
  const cohortsQuery = useCohortsQuery()
  const feedback = useInfiniteQuery({
    queryKey: ["feedback", week],
    queryFn: ({ pageParam }) => fetchFeedback({ week, cursor: pageParam }),
    initialPageParam: null as Parameters<typeof fetchFeedback>[0]["cursor"],
    getNextPageParam: (page) => page.cursor,
  })

  const names = useMemo(() => new Map((membersQuery.data ?? []).map((member) => [member.id, member.profile.displayName])), [membersQuery.data])
  const rows = feedback.data?.pages.flatMap((page) => page.rows) ?? []
  const weekCount = Math.max(6, ...(cohortsQuery.data ?? []).map((cohort) => cohort.durationWeeks))
  const weekItems = [{ value: "all", label: "All weeks" }, ...Array.from({ length: weekCount }, (_, index) => ({ value: String(index + 1), label: `Week ${index + 1}` }))]
  const keyOf = (row: FeedbackRow) => `${row.memberId}/${row.id}`

  return <div className="flex min-w-0 flex-col gap-5">
    <header className="grid gap-1">
      <h1 className="text-2xl font-semibold">Feedback</h1>
      <p className="text-sm text-muted-foreground">Each member's weekly check-in: how the week went, how training felt, and anything they flagged. Expand a row for their notes and to review it.</p>
    </header>

    <div className="flex flex-wrap items-center justify-between gap-3">
      <Select items={weekItems} value={week ? String(week) : "all"} onValueChange={(value) => { if (value) { setWeek(value === "all" ? null : Number(value)); setExpanded(null) } }}>
        <SelectTrigger className="w-40" aria-label="Filter by week"><SelectValue /></SelectTrigger>
        <SelectContent><SelectGroup>{weekItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
      </Select>
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        {feedback.data && <span>{rows.length}{feedback.hasNextPage ? "+" : ""} check-ins</span>}
        <Button variant="outline" size="sm" disabled={feedback.isFetching} onClick={() => void feedback.refetch()}>{feedback.isRefetching ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}Refresh</Button>
      </div>
    </div>

    {feedback.error && <Alert variant="destructive"><AlertTitle>Feedback unavailable</AlertTitle><AlertDescription>{feedback.error.message}</AlertDescription></Alert>}
    {feedback.isPending && <Skeleton className="h-96 w-full rounded-lg" />}
    {feedback.data && (rows.length === 0
      ? <Empty className="min-h-64 rounded-lg border"><EmptyHeader><EmptyTitle>No check-ins{week ? ` for week ${week}` : ""}</EmptyTitle><EmptyDescription>Weekly check-ins appear here as members submit them.</EmptyDescription></EmptyHeader></Empty>
      : <div className="overflow-hidden rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="[&>th]:text-[11px] [&>th]:font-medium [&>th]:tracking-wide [&>th]:text-muted-foreground [&>th]:uppercase">
                <TableHead className="pl-4">Member</TableHead><TableHead>Week</TableHead><TableHead>Workouts completed</TableHead>
                <TableHead title="Self-rated nutrition adherence">Adherence</TableHead><TableHead>Energy</TableHead><TableHead>Training felt</TableHead>
                <TableHead className="pr-4"><span className="sr-only">Notes</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const key = keyOf(row)
                const open = expanded === key
                const pain = reportsPain(row.pain)
                return <Fragment key={key}>
                  <TableRow aria-expanded={open} className="cursor-pointer" onClick={() => setExpanded(open ? null : key)}>
                    <TableCell className="pl-4 font-medium">{names.get(row.memberId) ?? <span className="text-muted-foreground">Unknown member</span>}</TableCell>
                    <TableCell>{row.weekNumber > 0 ? <Badge variant="outline" className="font-mono">W{row.weekNumber}</Badge> : <Missing />}</TableCell>
                    <TableCell className="font-mono tabular-nums">{row.workoutsDone ?? <Missing />}</TableCell>
                    <TableCell className="font-mono tabular-nums">{row.nutritionPct === null ? <Missing /> : `${row.nutritionPct}%`}</TableCell>
                    <TableCell className={cn("font-mono tabular-nums", row.energy !== null && row.energy <= 4 && "font-semibold text-destructive")}>{row.energy === null ? <Missing /> : `${row.energy}/10`}</TableCell>
                    <TableCell className={cn(row.trainingFeel === "too-hard" && "text-destructive")}>{row.trainingFeel ? humanizeMemberValue(row.trainingFeel) : <Missing />}</TableCell>
                    <TableCell className="pr-4 text-right">
                      <Button type="button" variant="ghost" size="sm" aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} notes for ${names.get(row.memberId) ?? "member"}, week ${row.weekNumber}`}
                        onClick={(event) => { event.stopPropagation(); setExpanded(open ? null : key) }}>
                        {open ? <ChevronDownIcon data-icon="inline-start" /> : <ChevronRightIcon data-icon="inline-start" />}Notes
                        {pain && <span className="size-1.5 rounded-full bg-destructive" title="Pain reported" aria-label="Pain reported" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                  {open && <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={COLUMNS} className="whitespace-normal bg-muted/40 px-5 py-4">
                      <div className="grid gap-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          <NoteBlock label="Pain or discomfort" value={row.pain} alert={pain} />
                          <NoteBlock label="General notes for coach" value={row.note} />
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>Submitted {row.submittedAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
                          <ReviewBadge status={row.reviewStatus} />
                          <Link to={`/members/${encodeURIComponent(row.memberId)}`} className="underline-offset-2 hover:underline">Open member</Link>
                        </div>
                        <Separator />
                        <CheckInReviewForm key={`${key}:${row.reviewStatus}:${row.reviewNote}`} memberId={row.memberId} checkIn={row} onSaved={() => void feedback.refetch()} />
                      </div>
                    </TableCell>
                  </TableRow>}
                </Fragment>
              })}
            </TableBody>
          </Table>
        </div>)}
    {feedback.hasNextPage && <Button variant="outline" className="self-center" disabled={feedback.isFetchingNextPage} onClick={() => void feedback.fetchNextPage()}>{feedback.isFetchingNextPage && <Spinner data-icon="inline-start" />}Load more</Button>}
  </div>
}
