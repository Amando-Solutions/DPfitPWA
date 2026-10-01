import { useMemo, useState, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { RefreshCwIcon } from "lucide-react"
import { Link } from "react-router-dom"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useCohortsQuery, useMembersQuery, usePlatformSettingsQuery, useProgramsQuery } from "@/hooks/use-admin-queries"
import {
  adherencePerWeek,
  completionByDay,
  fetchCohortActivity,
  membersTrendingDown,
  painSignals,
  registrationFunnel,
  revenue,
  sessionsPerWeek,
  trainingFeelCounts,
  weeksDue,
} from "@/lib/analytics"
import { cohortWeek } from "@/lib/leaderboard"
import { defaultMemberRanks, humanizeMemberValue, isParticipating, memberBadgeDefinitions, memberGoalLabel } from "@/lib/member-dashboard"
import { PALETTE } from "@/lib/phase-colors"
import { cn } from "@/lib/utils"
import { useSelectedCohort } from "@/hooks/use-selected-cohort"

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const BLUE = PALETTE[0]!
const AMBER = PALETTE[1]!
const GREEN = PALETTE[3]!

const percent = (part: number, whole: number) => whole > 0 ? Math.round((part / whole) * 100) : 0
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`

function Kpi({ label, value, detail }: { label: string; value: ReactNode; detail: ReactNode }) {
  return <Card size="sm" className="rounded-lg">
    <CardContent className="grid gap-1">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="text-3xl font-semibold tabular-nums">{value}</p>
      <p className="truncate text-xs text-muted-foreground">{detail}</p>
    </CardContent>
  </Card>
}

function Panel({ title, description, footnote, className, children }: { title: string; description?: ReactNode; footnote?: ReactNode; className?: string; children: ReactNode }) {
  return <Card size="sm" className={cn("rounded-lg", className)}>
    <CardHeader>
      <CardTitle>{title}</CardTitle>
      {description && <CardDescription>{description}</CardDescription>}
    </CardHeader>
    <CardContent className="grid gap-3">
      {children}
      {footnote && <p className="text-xs text-muted-foreground">{footnote}</p>}
    </CardContent>
  </Card>
}

type BarRow = { key: string; label: ReactNode; fraction: number; value: ReactNode; color?: string }

/** Label, a proportional track, and a figure, one row per item. */
function BarList({ rows, empty = "No data yet." }: { rows: BarRow[]; empty?: string }) {
  if (rows.length === 0) return <p className="py-4 text-center text-sm text-muted-foreground">{empty}</p>
  return <div className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 text-sm">
    {rows.map((row) => <div key={row.key} className="contents">
      <span className="truncate text-muted-foreground">{row.label}</span>
      <span className="h-2 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(1, row.fraction)) * 100}%`, background: row.color ?? BLUE }} /></span>
      <span className="text-right font-mono text-xs tabular-nums">{row.value}</span>
    </div>)}
  </div>
}

function WeekBars({ counts, currentWeek, colorFor }: { counts: number[]; currentWeek: number; colorFor: (week: number) => string }) {
  const max = Math.max(1, ...counts)
  return <div className="flex h-52 items-end gap-2 sm:gap-3" role="img" aria-label={`Sessions per week: ${counts.map((count, index) => `week ${index + 1} ${count}`).join(", ")}`}>
    {counts.map((count, index) => {
      const week = index + 1
      const future = week > currentWeek
      return <div key={week} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
        {!future && <span className="font-mono text-xs font-semibold tabular-nums">{count}</span>}
        {future
          ? <div className="h-full w-full rounded-md border border-dashed" />
          : <div className="w-full rounded-md" style={{ height: `${Math.max(3, (count / max) * 100)}%`, background: colorFor(week) }} />}
        <span className="font-mono text-[11px] text-muted-foreground">W{week}</span>
      </div>
    })}
  </div>
}

function AdherenceLine({ values }: { values: Array<number | null> }) {
  const width = 400
  const height = 150
  const pad = { left: 26, right: 12, top: 14, bottom: 20 }
  const x = (index: number) => pad.left + (values.length > 1 ? (index / (values.length - 1)) * (width - pad.left - pad.right) : 0)
  const y = (value: number) => pad.top + (1 - value / 100) * (height - pad.top - pad.bottom)
  const points = values.flatMap((value, index) => value === null ? [] : [{ index, value }])
  return <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={`Average adherence per week: ${values.map((value, index) => `week ${index + 1} ${value === null ? "no check-ins" : `${value}%`}`).join(", ")}`}>
    {[0, 25, 50, 75, 100].map((tick) => <g key={tick}>
      <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} className="stroke-border" strokeWidth={1} />
      <text x={pad.left - 6} y={y(tick) + 3} textAnchor="end" className="fill-muted-foreground font-mono text-[9px]">{tick}</text>
    </g>)}
    {values.map((_, index) => <text key={index} x={x(index)} y={height - 5} textAnchor="middle" className="fill-muted-foreground font-mono text-[9px]">W{index + 1}</text>)}
    {points.length > 1 && <polyline fill="none" stroke={BLUE} strokeWidth={2} strokeLinejoin="round" points={points.map((point) => `${x(point.index)},${y(point.value)}`).join(" ")} />}
    {points.map((point) => <g key={point.index}>
      <circle cx={x(point.index)} cy={y(point.value)} r={3.5} fill={BLUE} />
      <text x={x(point.index)} y={y(point.value) - 7} textAnchor="middle" className="fill-foreground font-mono text-[9px] font-semibold">{point.value}%</text>
    </g>)}
  </svg>
}

export function AnalyticsPage() {
  const cohortsQuery = useCohortsQuery()
  const membersQuery = useMembersQuery()
  const programsQuery = useProgramsQuery()
  const settingsQuery = usePlatformSettingsQuery()
  const [now] = useState(() => Date.now())

  const { cohort, program } = useSelectedCohort()
  const members = useMemo(() => (membersQuery.data ?? []).filter((member) => cohort && member.cohortId === cohort.id), [membersQuery.data, cohort])
  const memberIds = members.map((member) => member.id)

  // One cached read of the cohort's activity. No listener and no refetch on focus:
  // it only reloads when the cohort changes or someone presses Refresh.
  const activity = useQuery({
    queryKey: ["analytics", cohort?.id, memberIds.join(",")],
    queryFn: () => fetchCohortActivity(cohort!.id, memberIds),
    enabled: !!cohort && !membersQuery.isPending,
    staleTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const threshold = settingsQuery.data?.qualifyingSetPercent ?? 80
  const durationWeeks = cohort?.durationWeeks ?? 0
  const currentWeek = cohort ? cohortWeek(cohort.startDate, durationWeeks, now) : 0
  const ended = !!cohort && now >= cohort.startDate.getTime() + durationWeeks * WEEK_MS
  const due = weeksDue(currentWeek, durationWeeks, ended)
  const enrolled = members.filter((member) => member.status !== "onboarding")
  const data = activity.data

  // Colour each week by its phase: consecutive weeks sharing a theme title share a colour.
  const phases = useMemo(() => {
    const titles = Array.from({ length: durationWeeks }, (_, index) => program?.weekThemes.find((theme) => theme.weekNumber === index + 1)?.title.trim() || "")
    const distinct = [...new Set(titles.filter(Boolean))]
    return { titles, distinct, color: (week: number) => { const title = titles[week - 1]; return title ? PALETTE[distinct.indexOf(title) % PALETTE.length]! : BLUE } }
  }, [program, durationWeeks])

  const loading = cohortsQuery.isPending || membersQuery.isPending
  const error = cohortsQuery.error ?? membersQuery.error ?? programsQuery.error

  return <div className="flex min-w-0 flex-col gap-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">The cohort's story so far: where engagement is heading, what the program data says, and who might need a nudge before it shows up as a support ticket.</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={activity.isFetching || !cohort} onClick={() => void activity.refetch()}>{activity.isFetching ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}Refresh</Button>
      </div>
    </header>

    {error && <Alert variant="destructive"><AlertTitle>Analytics unavailable</AlertTitle><AlertDescription>{error.message}</AlertDescription></Alert>}
    {activity.error && <Alert variant="destructive"><AlertTitle>Activity could not be loaded</AlertTitle><AlertDescription>{activity.error.message}</AlertDescription></Alert>}
    {loading && <Skeleton className="h-96 w-full rounded-lg" />}
    {!loading && !cohort && <Empty className="min-h-64 rounded-lg border"><EmptyHeader><EmptyTitle>No cohorts yet</EmptyTitle><EmptyDescription>Analytics appear once a cohort has members.</EmptyDescription></EmptyHeader></Empty>}

    {!loading && cohort && (!data ? <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-28 rounded-lg" />)}</div>
        <div className="grid gap-4 xl:grid-cols-2"><Skeleton className="h-72 rounded-lg" /><Skeleton className="h-72 rounded-lg" /></div>
      </div>
      : analyticsBody())}
  </div>

  function analyticsBody() {
    if (!cohort || !data) return null
    const sessions = data.sessions.filter((session) => session.weekNumber >= 1 && session.weekNumber <= durationWeeks)
    const qualified = sessions.filter((session) => session.qualifies).length
    const checkIns = data.checkIns.filter((row) => row.weekNumber >= 1 && row.weekNumber <= durationWeeks)
    const memberCodes = new Set((membersQuery.data ?? []).map((member) => member.accessCode.toUpperCase()).filter(Boolean))
    const funnel = registrationFunnel(data.registrations, memberCodes)
    const registeredCodes = new Set(data.registrations.map((item) => item.code).filter(Boolean))
    const joinedByHand = members.filter((member) => member.accessCode && !registeredCodes.has(member.accessCode.toUpperCase())).length
    const money = revenue(data.registrations)
    const expectedCheckIns = enrolled.length * due
    const dueCheckIns = checkIns.filter((row) => row.weekNumber <= due).length
    const participating = members.filter((member) => isParticipating(member, now)).length
    const active = members.filter((member) => member.status === "active").length
    const avgPoints = enrolled.length ? Math.round(enrolled.reduce((sum, member) => sum + member.stats.points, 0) / enrolled.length) : 0
    const avgMinutes = sessions.length ? Math.round(sessions.reduce((sum, session) => sum + session.durationSeconds, 0) / sessions.length / 60) : 0

    const ranks = program?.rewards.ranks.length ? [...program.rewards.ranks].sort((a, b) => a.minPoints - b.minPoints) : [...defaultMemberRanks]
    const rankCounts = ranks.map((rank, index) => ({ rank, count: enrolled.filter((member) => member.stats.points >= rank.minPoints && member.stats.points < (ranks[index + 1]?.minPoints ?? Infinity)).length }))
    const badges = program?.rewards.badges.length ? program.rewards.badges : memberBadgeDefinitions
    const badgeCounts = badges.map((badge) => ({ badge, count: enrolled.filter((member) => data.badges.get(member.id)?.has(badge.id)).length }))

    const trendTo = due
    const trendFrom = Math.max(1, due - 2)
    const trending = trendTo > trendFrom ? membersTrendingDown(members.filter((member) => member.status === "active"), checkIns, trendFrom, trendTo) : []
    const pain = painSignals(checkIns)
    const names = new Map(members.map((member) => [member.id, member.profile.displayName]))
    const feel = trainingFeelCounts(checkIns)
    const feelTotal = feel.reduce((sum, item) => sum + item.count, 0)
    const days = completionByDay(sessions)
    const statuses = (["active", "onboarding", "paused", "completed"] as const).map((status) => ({ status, count: members.filter((member) => member.status === status).length })).filter((item) => item.count > 0)
    const goals = [...members.reduce((map, member) => map.set(member.profile.goal || "", (map.get(member.profile.goal || "") ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1])

    return <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        <Kpi label="Sessions logged" value={sessions.length} detail={currentWeek > 0 ? `Through week ${currentWeek} of ${durationWeeks}${avgMinutes ? ` · ~${avgMinutes} min each` : ""}` : "Not started yet"} />
        <Kpi label="Qualifying rate" value={sessions.length ? `${percent(qualified, sessions.length)}%` : "—"} detail={`${qualified} of ${sessions.length} met the ≥${threshold}% threshold`} />
        <Kpi label="Registered → member" value={funnel[0]!.count ? `${percent(funnel[3]!.count, funnel[0]!.count)}%` : "—"} detail={`${funnel[3]!.count} of ${plural(funnel[0]!.count, "signup")}`} />
        <Kpi label="Avg. RP per member" value={avgPoints} detail={`Across ${plural(enrolled.length, "member")}`} />
        <Kpi label="Check-in rate" value={expectedCheckIns ? `${percent(dueCheckIns, expectedCheckIns)}%` : "—"} detail={expectedCheckIns ? `${dueCheckIns} of ${expectedCheckIns} due so far` : "First check-ins are due after week 1"} />
        <Kpi label="Training this week" value={active ? `${participating}/${active}` : "—"} detail="Active members who logged in 7 days" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel title="Sessions logged per week" footnote={<>
          {phases.distinct.length > 1 ? <span className="mr-1 inline-flex flex-wrap gap-x-3 gap-y-1 align-middle">{phases.distinct.map((title, index) => <span key={title} className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm" style={{ background: PALETTE[index % PALETTE.length] }} />{title}</span>)}</span> : null}
          {currentWeek < durationWeeks ? " Dashed boxes are weeks not reached yet." : ""}{!ended && currentWeek > 0 ? ` Week ${currentWeek} is still in progress.` : ""}
        </>}>
          <WeekBars counts={sessionsPerWeek(sessions, durationWeeks)} currentWeek={currentWeek} colorFor={phases.color} />
        </Panel>
        <Panel title="Average adherence % per week" footnote="The average of each submitted check-in's self-rated nutrition adherence that week, across the members who checked in.">
          <AdherenceLine values={adherencePerWeek(checkIns, durationWeeks)} />
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel title="Registration funnel" description="Landing-page signups for this cohort, from form to first sign-in." footnote={<>
          {money.length > 0 && <>Collected {money.map((item) => new Intl.NumberFormat(undefined, { style: "currency", currency: item.currency, maximumFractionDigits: 0 }).format(item.amount)).join(" + ")}. </>}
          {joinedByHand > 0 && <>{plural(joinedByHand, "member")} joined with codes issued by hand, outside this funnel. </>}
          {data.unresolvedSales > 0 && <Link to="/access-codes" className="font-medium text-destructive underline-offset-2 hover:underline">{plural(data.unresolvedSales, "payment")} with no registration still need a code.</Link>}
        </>}>
          <div className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_5.5rem] items-center gap-x-3 gap-y-2.5 text-sm">
            {funnel.map((stage, index) => {
              const prior = index > 0 ? funnel[index - 1]!.count : 0
              return <div key={stage.label} className="contents">
                <span className="text-muted-foreground">{stage.label}</span>
                <span className="h-8 overflow-hidden rounded-md bg-muted">
                  <span className="flex h-full min-w-8 items-center rounded-md px-3 font-mono text-xs font-semibold text-white" style={{ width: `${funnel[0]!.count ? (stage.count / funnel[0]!.count) * 100 : 0}%`, background: index === 0 ? BLUE : index === funnel.length - 1 ? GREEN : AMBER }}>{stage.count}</span>
                </span>
                <span className="text-right font-mono text-xs text-muted-foreground">{index === 0 ? "start" : prior ? `${percent(stage.count, prior)}% of prior` : "—"}</span>
              </div>
            })}
          </div>
        </Panel>
        <Panel title="Members">
          <BarList rows={statuses.map((item) => ({ key: item.status, label: humanizeMemberValue(item.status), fraction: item.count / members.length, value: item.count, color: item.status === "active" ? GREEN : item.status === "paused" ? AMBER : BLUE }))} empty="No members yet." />
          <p className="pt-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Goals</p>
          <BarList rows={goals.map(([goal, count]) => ({ key: goal || "none", label: goal ? memberGoalLabel(goal) : "Not set", fraction: count / members.length, value: `${count} (${percent(count, members.length)}%)` }))} empty="No members yet." />
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Avg. completion % by training day" footnote={`Share of prescribed sets done per session. Lower completion on one day is often the first sign that day needs a rework, not that members are slacking.`}>
          <BarList rows={days.map((day) => ({ key: day.label, label: day.label, fraction: day.percent / 100, value: `${day.percent}% avg · ${day.logged} logged`, color: day.percent < threshold ? AMBER : GREEN }))} empty="No sessions logged yet." />
        </Panel>
        <Panel title="How training felt" description="From weekly check-ins.">
          <BarList rows={feelTotal ? feel.map((item) => ({ key: item.value, label: item.label, fraction: item.count / feelTotal, value: `${item.count} (${percent(item.count, feelTotal)}%)`, color: item.value === "just-right" ? GREEN : AMBER })) : []} empty="No check-ins yet." />
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Rank distribution" description={program?.rewards.ranks.length ? `${program.name}'s ladder` : "Default ladder"}>
          <BarList rows={rankCounts.map(({ rank, count }) => ({ key: rank.name, label: `${rank.emoji} ${rank.name}`, fraction: enrolled.length ? count / Math.max(...rankCounts.map((item) => item.count), 1) : 0, value: plural(count, "member") }))} />
        </Panel>
        <Panel title="Badge unlock rates" description={`Share of ${plural(enrolled.length, "member")} who've earned each.`}>
          <BarList rows={badgeCounts.map(({ badge, count }) => ({ key: badge.id, label: `${badge.emoji} ${badge.name}`, fraction: enrolled.length ? count / enrolled.length : 0, value: `${count} (${percent(count, enrolled.length)}%)`, color: AMBER }))} />
        </Panel>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Panel title="Members trending down" description={trendTo > trendFrom ? `Adherence dropped 15+ points (or a check-in went missing) between week ${trendFrom} and week ${trendTo}. A slower signal than the attention flags on Members.` : "Needs two weeks of check-ins to compare."}>
          {trending.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">{trendTo > trendFrom ? "Nobody is trending down." : "Not enough weeks yet."}</p>
            : <ul className="grid gap-1.5">{trending.map(({ member, from, to }) => <li key={member.id}>
                <Link to={`/members/${encodeURIComponent(member.id)}`} className="flex gap-3 rounded-md bg-muted/60 px-3 py-2 hover:bg-muted">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-destructive" aria-hidden />
                  <span className="grid gap-0.5"><span className="text-sm font-medium">{member.profile.displayName}</span>
                    <span className="text-xs text-muted-foreground">Week {trendFrom}: {from}% adherence → Week {trendTo}: {to === null ? "no check-in submitted" : `${to}% adherence`}</span></span>
                </Link>
              </li>)}</ul>}
        </Panel>
        <Panel title="Pain & feedback signals" description="Pain or discomfort reported on check-ins, newest first.">
          {pain.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">No pain reported.</p>
            : <ul className="grid">{pain.slice(0, 8).map((row, index) => <li key={`${row.memberId}/${row.id}`} className={cn("grid gap-0.5 py-2.5", index > 0 && "border-t")}>
                <p className="text-sm"><Link to={`/members/${encodeURIComponent(row.memberId)}`} className="font-semibold underline-offset-2 hover:underline">{names.get(row.memberId) ?? "Unknown member"}</Link> — {row.pain}</p>
                <p className="font-mono text-xs text-muted-foreground">Week {row.weekNumber}</p>
              </li>)}</ul>}
          {pain.length > 8 && <Link to="/feedback" className="text-xs text-muted-foreground underline-offset-2 hover:underline">{pain.length - 8} more on Feedback</Link>}
        </Panel>
      </div>

      <p className="text-center text-xs text-muted-foreground">Loaded {activity.dataUpdatedAt ? new Date(activity.dataUpdatedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : ""} with {data.reads.toLocaleString()} document reads. Cached for 15 minutes; Refresh reloads it.</p>
    </div>
  }
}
