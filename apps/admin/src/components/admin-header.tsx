import { useState } from "react"
import { AlertTriangleIcon } from "lucide-react"
import { Link } from "react-router-dom"

import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { useAdminAuth } from "@/hooks/use-admin-auth"
import { useCohortPulse } from "@/hooks/use-cohort-pulse"
import { useSelectedCohort } from "@/hooks/use-selected-cohort"
import { programPhases, type PulseIssue } from "@/lib/cohort-pulse"
import { phaseColor } from "@/lib/phase-colors"
import { cn } from "@/lib/utils"

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const ISSUE_DOT: Record<PulseIssue["kind"], string> = {
  inactive: "bg-destructive",
  "missing-check-in": "bg-amber-500",
  flagged: "bg-destructive",
  pain: "bg-amber-500",
}

/** W1…Wn for the selected cohort, coloured by phase, with the current week filled. */
function WeekStrip() {
  const { cohort, program } = useSelectedCohort()
  const [now] = useState(() => Date.now())
  if (!cohort) return <p className="text-sm text-muted-foreground">No cohort yet</p>

  const phases = programPhases(program, cohort.durationWeeks)
  const elapsed = now - cohort.startDate.getTime()
  const ended = elapsed >= cohort.durationWeeks * WEEK_MS
  const current = elapsed < 0 ? 0 : ended ? cohort.durationWeeks + 1 : Math.floor(elapsed / WEEK_MS) + 1
  const phase = phases.find((item) => current >= item.fromWeek && current <= item.toWeek)
  const weeks = Array.from({ length: cohort.durationWeeks }, (_, index) => index + 1)

  return <div className="flex min-w-0 items-center gap-3">
    <ol className="hidden items-center gap-1 md:flex" aria-label={`${cohort.name} weeks`}>
      {weeks.map((week) => {
        const color = phaseColor(phases, week)
        const isCurrent = week === current
        const title = phases.find((item) => week >= item.fromWeek && week <= item.toWeek)?.title
        return <li key={week} className="relative">
          <span
            title={`Week ${week}${title && !title.startsWith("Week ") ? ` · ${title}` : ""}`}
            aria-current={isCurrent ? "step" : undefined}
            className={cn("inline-flex h-7 min-w-9 items-center justify-center rounded-md border px-1.5 font-mono text-[11px] font-semibold", week > current && "opacity-55")}
            style={isCurrent ? { background: color, borderColor: color, color: "#fff" } : { color, background: `${color}14`, borderColor: `${color}33` }}
          >W{week}</span>
          {isCurrent && <span className="absolute -top-1 -right-1 size-2.5 rounded-full border-2 border-background" style={{ background: color }} aria-hidden />}
        </li>
      })}
    </ol>
    <p className="truncate text-sm text-muted-foreground">
      {current === 0 ? <>Starts <span className="font-semibold text-foreground">{cohort.startDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></>
        : ended ? <span className="font-semibold text-foreground">Completed</span>
        : <>Week <span className="font-semibold text-foreground">{current}</span>{phase && !phase.title.startsWith("Week ") && <> · <span className="font-semibold text-foreground">{phase.title}</span></>}</>}
    </p>
  </div>
}

function CohortPicker() {
  const { cohort, cohorts, multipleCohorts, setCohortId } = useSelectedCohort()
  // Shown whenever several cohorts may run, even with one so far, so it's always clear which cohort the console is showing.
  if (!multipleCohorts || !cohort) return null
  const items = cohorts.map((item) => ({ value: item.id, label: item.name }))
  return <Select items={items} value={cohort.id} onValueChange={(value) => value && setCohortId(value)}>
    <SelectTrigger size="sm" className="w-40 shrink-0" aria-label="Cohort"><SelectValue /></SelectTrigger>
    <SelectContent><SelectGroup>{items.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
  </Select>
}

function AdminChip() {
  const { user } = useAdminAuth()
  const [today] = useState(() => new Date())
  const name = user?.displayName?.trim() || user?.email?.split("@")[0] || "Admin"
  return <div className="ml-auto flex shrink-0 items-center gap-3">
    <span className="hidden font-mono text-xs text-muted-foreground lg:inline">{today.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
    <span className="flex items-center gap-2 rounded-full border bg-background py-1 pr-3 pl-1" title={user?.email ?? undefined}>
      <span className="flex size-6 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground uppercase" aria-hidden>{name[0]}</span>
      <span className="max-w-32 truncate text-sm font-medium capitalize">{name}</span>
    </span>
  </div>
}

/** The selected cohort's attention flags; the full list lives on Cohort pulse. */
function AttentionBar() {
  const { cohort } = useSelectedCohort()
  const { issues } = useCohortPulse(cohort)
  if (issues.length === 0) return null
  const people = new Set(issues.map((issue) => issue.memberId)).size
  // The tint sits on an opaque layer so scrolled page content never shows through.
  return <div className="bg-background"><div className="flex items-center gap-3 border-b bg-destructive/10 px-4 py-2 sm:px-6 lg:px-10" role="status">
    <AlertTriangleIcon className="size-4 shrink-0 text-destructive" aria-hidden />
    <p className="shrink-0 text-sm font-semibold">{people} member{people === 1 ? "" : "s"} need{people === 1 ? "s" : ""} attention.</p>
    <ul className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
      {issues.slice(0, 4).map((issue, index) => <li key={`${issue.memberId}-${issue.kind}`} className={cn("shrink-0", index >= 2 && "hidden xl:block", index >= 1 && "max-sm:hidden")}>
        <Link to={`/members/${encodeURIComponent(issue.memberId)}`} className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-0.5 text-xs whitespace-nowrap hover:bg-muted">
          <span className={cn("size-1.5 rounded-full", ISSUE_DOT[issue.kind])} aria-hidden />{issue.memberName} — {issue.title}
        </Link>
      </li>)}
      <li className="shrink-0">
        <Link to="/cohort-pulse" className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">{issues.length > 4 ? `+${issues.length - 4} more` : "View all"}</Link>
      </li>
    </ul>
  </div></div>
}

export function AdminHeader() {
  return (
    <div className="sticky top-0 z-40 shadow-xs">
      <header className="flex min-h-14 items-center gap-3 border-b bg-background px-4 sm:px-6 lg:px-10">
        <SidebarTrigger className="min-h-11 min-w-11 sm:min-h-7 sm:min-w-7" />
        <Separator orientation="vertical" className="h-5" />
        <CohortPicker />
        <WeekStrip />
        <AdminChip />
      </header>
      <AttentionBar />
    </div>
  )
}
