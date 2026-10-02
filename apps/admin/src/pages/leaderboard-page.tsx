import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { EyeOffIcon, RefreshCwIcon } from "lucide-react"
import { Link } from "react-router-dom"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useCohortsQuery, useMembersQuery, useProgramsQuery } from "@/hooks/use-admin-queries"
import { cohortWeek, fetchCohortGamification } from "@/lib/leaderboard"
import { membersOf } from "@/lib/members"
import { memberBadgeDefinitions, memberRank } from "@/lib/member-dashboard"
import { cn } from "@/lib/utils"
import { useSelectedCohort } from "@/hooks/use-selected-cohort"

const MEDALS = ["🥇", "🥈", "🥉"]

export function LeaderboardPage() {
  const cohortsQuery = useCohortsQuery()
  const membersQuery = useMembersQuery()
  const programsQuery = useProgramsQuery()
  const [now] = useState(() => Date.now())

  const { cohort, program } = useSelectedCohort()
  const currentWeek = cohort ? cohortWeek(cohort.startDate, cohort.durationWeeks, now) : 0

  // Ranked by qualifying sessions: the same count the PWA's board projection mirrors.
  // Its members now, and anybody who has since joined another cohort, as they were here.
  const members = useMemo(() => (cohort ? membersOf(membersQuery.data ?? [], cohort.id) : [])
    .sort((a, b) => b.stats.sessionsQualified - a.stats.sessionsQualified || a.profile.displayName.localeCompare(b.profile.displayName)),
  [membersQuery.data, cohort])
  const memberIds = members.map((member) => member.id)

  const gamification = useQuery({
    queryKey: ["leaderboard-gamification", cohort?.id, memberIds.join(","), currentWeek],
    queryFn: () => fetchCohortGamification(cohort!.id, members, currentWeek),
    enabled: !!cohort && memberIds.length > 0,
    staleTime: 5 * 60 * 1000,
  })

  // The pinned program's own ladder and badge set, else the defaults the PWA ships with.
  const ranks = program?.rewards.ranks.length ? [...program.rewards.ranks].sort((a, b) => a.minPoints - b.minPoints) : null
  const rankFor = (points: number) => ranks ? ([...ranks].reverse().find((rank) => points >= rank.minPoints) ?? ranks[0]!) : memberRank(points)
  const badgeTotal = program?.rewards.badges.length || memberBadgeDefinitions.length
  const byPoints = [...members].sort((a, b) => b.stats.points - a.stats.points || a.profile.displayName.localeCompare(b.profile.displayName))

  const loading = cohortsQuery.isPending || membersQuery.isPending
  const error = cohortsQuery.error ?? membersQuery.error ?? programsQuery.error

  return <div className="flex min-w-0 flex-col gap-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Leaderboard</h1>
        <p className="text-sm text-muted-foreground">Ranked by qualifying sessions logged, not by results. The same count members see on their board.</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={gamification.isFetching} onClick={() => void gamification.refetch()}>{gamification.isFetching ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}Refresh</Button>
      </div>
    </header>

    {error && <Alert variant="destructive"><AlertTitle>Leaderboard unavailable</AlertTitle><AlertDescription>{error.message}</AlertDescription></Alert>}
    {loading && <Skeleton className="h-96 w-full rounded-lg" />}
    {!loading && !cohort && <Empty className="min-h-64 rounded-lg border"><EmptyHeader><EmptyTitle>No cohorts yet</EmptyTitle><EmptyDescription>The leaderboard appears once a cohort has members.</EmptyDescription></EmptyHeader></Empty>}

    {!loading && cohort && <div className="grid items-start gap-4 xl:grid-cols-2">
      <Card size="sm" className="rounded-lg">
        <CardHeader>
          <CardTitle>{cohort.name} leaderboard</CardTitle>
          <CardDescription>{currentWeek > 0 ? `Week ${currentWeek} of ${cohort.durationWeeks}` : "Not started yet"} · {members.length} members</CardDescription>
          {!cohort.leaderboardVisible && <CardAction><Badge variant="outline" className="gap-1.5" title="Members can't see the board yet. Change it in the cohort's settings."><EyeOffIcon />Hidden from members{cohort.leaderboardRevealWeek ? ` until W${cohort.leaderboardRevealWeek}` : ""}</Badge></CardAction>}
        </CardHeader>
        <CardContent>
          {members.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No members in this cohort yet.</p>
            : <ol className="grid gap-1">
                {members.map((member) => {
                  // Tied members share a place: 1, 1, 1, 4.
                  const place = members.findIndex((other) => other.stats.sessionsQualified === member.stats.sessionsQualified) + 1
                  return <li key={member.id}>
                    <Link to={`/members/${encodeURIComponent(member.id)}`} className={cn("flex items-center gap-3 rounded-md px-3 py-2 hover:bg-muted", place <= 3 && member.stats.sessionsQualified > 0 && "bg-muted/60")}>
                      <span className="w-6 text-center text-sm font-semibold text-muted-foreground tabular-nums">{place <= 3 && member.stats.sessionsQualified > 0 ? MEDALS[place - 1] : place}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{member.profile.displayName}</span>
                      {member.status === "paused" && <Badge variant="outline">Paused</Badge>}
                      <Badge variant="secondary" className="tabular-nums">{member.stats.sessionsQualified} session{member.stats.sessionsQualified === 1 ? "" : "s"}</Badge>
                    </Link>
                  </li>
                })}
              </ol>}
        </CardContent>
      </Card>

      <Card size="sm" className="rounded-lg">
        <CardHeader>
          <CardTitle>Per-member gamification</CardTitle>
          <CardDescription>Reward points, rank on {program ? `${program.name} v${program.version}'s` : "the default"} ladder, weekly streak and badges earned.</CardDescription>
        </CardHeader>
        <CardContent>
          {gamification.error && <Alert variant="destructive" className="mb-3"><AlertDescription>Streaks and badges could not be loaded: {gamification.error.message}</AlertDescription></Alert>}
          <Table>
            <TableHeader>
              <TableRow className="[&>th]:text-[11px] [&>th]:font-medium [&>th]:tracking-wide [&>th]:text-muted-foreground [&>th]:uppercase">
                <TableHead>Member</TableHead><TableHead>Rank</TableHead><TableHead className="text-right">RP</TableHead><TableHead className="text-right">Streak</TableHead><TableHead className="text-right">Badges</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byPoints.map((member) => {
                const rank = rankFor(member.stats.points)
                const extra = gamification.data?.get(member.id)
                return <TableRow key={member.id}>
                  <TableCell className="max-w-40 truncate font-medium">{member.profile.displayName}</TableCell>
                  <TableCell className="whitespace-nowrap">{rank.emoji} {rank.name}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{member.stats.points}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{extra ? `${extra.streakWeeks}w` : gamification.isPending ? <Skeleton className="ml-auto h-4 w-6" /> : "—"}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{extra ? `${extra.badgesEarned}/${badgeTotal}` : gamification.isPending ? <Skeleton className="ml-auto h-4 w-8" /> : "—"}</TableCell>
                </TableRow>
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>}
  </div>
}
