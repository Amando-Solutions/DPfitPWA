import { Fragment, type FormEvent, useMemo, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  DumbbellIcon,
  HistoryIcon,
  ImageIcon,
  PauseCircleIcon,
  PlayCircleIcon,
} from "lucide-react"
import { useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useAdminAuth } from "@/hooks/use-admin-auth"
import { CheckInReviewForm } from "@/components/check-in-review-form"
import { ImageLightbox } from "@/components/image-lightbox"
import {
  useMemberOperationsQuery,
  useMemberQuery,
} from "@/hooks/use-admin-queries"
import {
  attentionDetails,
  humanizeMemberValue,
  memberAdherence,
  memberBadgeDefinitions,
  memberGoalLabel,
  memberRank,
  nutritionTargets,
} from "@/lib/member-dashboard"
import {
  resumeMember,
  reviewMemberSession,
  setMemberPaused,
  type MemberLoggedSet,
  type MemberRecord,
  type MemberWorkoutSummary,
} from "@/lib/members"

const dateFormatter = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

const dateTimeFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

function formatDate(value: Date | null) {
  return !value || value.getTime() <= 0 ? "Not yet" : dateFormatter.format(value)
}

function formatDateTime(value: Date | null) {
  return !value || value.getTime() <= 0 ? "Not yet" : dateTimeFormatter.format(value)
}

function formatDuration(seconds: number) {
  const total = Math.max(0, Math.round(seconds))
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, "0")}s`
}

function completionPercent(session: MemberWorkoutSummary) {
  if (session.setsTotal <= 0) return session.qualifies ? 100 : 0
  return Math.min(100, Math.round((session.setsDone / session.setsTotal) * 100))
}

function workoutLabel(session: MemberWorkoutSummary) {
  if (session.dayNumber <= 0 || /^day\s+\d+/i.test(session.label)) return session.label
  return `Day ${session.dayNumber} - ${session.label}`
}

function setLabel(set: MemberLoggedSet, index: number) {
  const load = set.weightKg > 0 ? ` x ${set.weightKg.toLocaleString()}kg` : ""
  const type = set.setType === "normal" ? "" : ` - ${humanizeMemberValue(set.setType)}`
  return `Set ${index + 1}: ${set.reps}${load}${type}`
}

function WeekBadge({ week }: { week: number }) {
  return <Badge variant={week >= 5 ? "destructive" : "secondary"}>W{week || "-"}</Badge>
}

function Metric({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex min-h-20 flex-col items-center justify-center bg-muted px-3 py-3 text-center">
      <strong className="text-base font-semibold tabular-nums">{value}</strong>
      <span className="mt-1 text-[0.68rem] font-medium text-muted-foreground uppercase">{label}</span>
    </div>
  )
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <dt className="text-xs font-medium text-muted-foreground uppercase">{label}</dt>
      <dd className="break-words text-sm">{value}</dd>
    </div>
  )
}

function PageSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-6" role="status">
      <span className="sr-only">Loading member</span>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-9 w-36" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-10 w-96" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
    </div>
  )
}

function SessionReviewForm({ memberId, session }: { memberId: string; session: MemberWorkoutSummary }) {
  const { user } = useAdminAuth()
  const [status, setStatus] = useState(session.reviewStatus)
  const [note, setNote] = useState(session.reviewNote)
  const mutation = useMutation({
    mutationFn: reviewMemberSession,
    onSuccess: () => toast.success("Session review saved"),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Session review failed."),
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) return toast.error("Your admin session has expired.")
    mutation.mutate({ memberId, sessionId: session.id, status, note, user })
  }

  return (
    <form onSubmit={submit} className="grid gap-2">
      <p className="text-xs font-semibold uppercase">Coach review</p>
      <div className="grid gap-2 md:grid-cols-[12rem_1fr_auto]">
        <Select value={status} onValueChange={(value) => value && setStatus(value)}>
          <SelectTrigger className="w-full" aria-label="Session review status"><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="needs-attention">Needs attention</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectGroup></SelectContent>
        </Select>
        <Input value={note} maxLength={500} placeholder="Optional session review note" onChange={(event) => setNote(event.target.value)} />
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending && <Spinner data-icon="inline-start" />} Save review
        </Button>
      </div>
      {session.reviewedByEmail && (
        <p className="text-xs text-muted-foreground">Last reviewed by {session.reviewedByEmail} on {formatDateTime(session.reviewedAt)}.</p>
      )}
    </form>
  )
}

function WorkoutDetails({ memberId, session }: { memberId: string; session: MemberWorkoutSummary }) {
  const [proofOpen, setProofOpen] = useState<number | null>(null)
  return (
    <div className="grid gap-5 py-2">
      {session.exercises.length > 0 ? (
        <div className="grid gap-4">
          {session.exercises.map((exercise) => (
            <div key={exercise.id} className="grid gap-2">
              <div>
                <p className="font-semibold">{exercise.name}</p>
                {(exercise.muscleGroup || exercise.note) && (
                  <p className="text-xs text-muted-foreground">
                    {[humanizeMemberValue(exercise.muscleGroup, ""), exercise.note].filter(Boolean).join(" - ")}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {exercise.sets.map((set, index) => (
                  <Badge key={`${exercise.id}-${index}`} variant={set.done ? "outline" : "secondary"}>
                    {setLabel(set, index)}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">This older session contains totals but no exercise-level log.</p>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <ProfileField label="Session note" value={session.note || "No note provided"} />
        <ProfileField label="Volume" value={`${session.volumeKg.toLocaleString()} kg`} />
        <ProfileField label="Reward" value={`${session.rewardPoints} RP`} />
      </div>
      {session.proofPhotoUrl && (
        <div className="grid gap-2">
          <p className="text-xs font-medium text-muted-foreground uppercase">Workout proof</p>
          <button type="button" className="w-fit overflow-hidden rounded-md border focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none" aria-label="View workout proof larger" onClick={() => setProofOpen(0)}>
            <img src={session.proofPhotoUrl} alt="Workout proof" className="max-h-72 max-w-md cursor-zoom-in object-cover" />
          </button>
          <ImageLightbox images={[{ url: session.proofPhotoUrl, alt: "Workout proof", caption: `Workout proof · ${workoutLabel(session)}` }]} index={proofOpen} onIndexChange={setProofOpen} />
        </div>
      )}
      <Separator />
      <SessionReviewForm
        key={`${session.id}:${session.reviewStatus}:${session.reviewNote}:${session.reviewedAt?.getTime() ?? 0}`}
        memberId={memberId}
        session={session}
      />
    </div>
  )
}

export function MemberOperationsPage() {
  const { memberId } = useParams()
  const navigate = useNavigate()
  const { user } = useAdminAuth()
  const resolvedMemberId = memberId ?? ""
  const memberQuery = useMemberQuery(resolvedMemberId)
  const operationsQuery = useMemberOperationsQuery(resolvedMemberId)
  const member = memberQuery.data ?? null
  const operations = operationsQuery.data ?? null
  const [pauseDialogOpen, setPauseDialogOpen] = useState(false)
  const [pauseReason, setPauseReason] = useState("")
  const [dayFilter, setDayFilter] = useState("all")
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null)
  const [expandedFeedbackId, setExpandedFeedbackId] = useState<string | null>(null)
  const [photoIndex, setPhotoIndex] = useState<number | null>(null)

  const pauseMutation = useMutation({
    mutationFn: setMemberPaused,
    onSuccess: (_, variables) => {
      setPauseDialogOpen(false)
      setPauseReason("")
      toast.success(`${variables.member.profile.displayName} was deactivated`)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Member could not be deactivated."),
  })
  const resumeMutation = useMutation({
    mutationFn: ({ currentMember, currentUser }: { currentMember: MemberRecord; currentUser: NonNullable<typeof user> }) =>
      resumeMember(currentMember, currentUser),
    onSuccess: (_, variables) => toast.success(`${variables.currentMember.profile.displayName} was reactivated`),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Member could not be reactivated."),
  })

  const dayOptions = useMemo(() => {
    const days = new Map<number, string>()
    for (const session of operations?.sessions ?? []) {
      if (session.dayNumber > 0) days.set(session.dayNumber, session.label)
    }
    return [...days.entries()].sort(([left], [right]) => left - right)
  }, [operations?.sessions])
  const filteredSessions = useMemo(
    () => (operations?.sessions ?? []).filter(
      (session) => dayFilter === "all" || String(session.dayNumber) === dayFilter,
    ),
    [dayFilter, operations?.sessions],
  )

  if (!memberId) {
    return <Alert variant="destructive"><AlertTriangleIcon /><AlertTitle>Member link is incomplete</AlertTitle><AlertDescription>Return to the member directory and choose a member.</AlertDescription></Alert>
  }
  if (memberQuery.isPending) return <PageSkeleton />
  if (memberQuery.error) {
    return (
      <div className="flex flex-1 flex-col gap-6">
        <Button type="button" variant="ghost" className="self-start" onClick={() => navigate("/members")}><ArrowLeftIcon data-icon="inline-start" /> Back to members</Button>
        <Alert variant="destructive"><AlertTriangleIcon /><AlertTitle>Member unavailable</AlertTitle><AlertDescription>{memberQuery.error.message}</AlertDescription></Alert>
      </div>
    )
  }
  if (!member) {
    return (
      <Empty className="min-h-[32rem]">
        <EmptyHeader><EmptyMedia variant="icon"><DumbbellIcon /></EmptyMedia><EmptyTitle>Member not found</EmptyTitle><EmptyDescription>The member may have been removed or the link may be incorrect.</EmptyDescription></EmptyHeader>
        <EmptyContent><Button type="button" variant="outline" onClick={() => navigate("/members")}><ArrowLeftIcon data-icon="inline-start" /> Back to members</Button></EmptyContent>
      </Empty>
    )
  }

  const nutrition = nutritionTargets(member.profile)
  const rank = memberRank(member.stats.points)
  const adherence = memberAdherence(member)
  const attention = attentionDetails(member)
  const earnedBadgeIds = new Set((operations?.badges ?? []).map((badge) => badge.id))
  const isUpdatingStatus = pauseMutation.isPending || resumeMutation.isPending
  const lightboxPhotos = (operations?.photos ?? []).filter((photo) => photo.url).map((photo) => ({
    url: photo.url,
    alt: photo.label || "Progress photo",
    caption: `${photo.weekNumber ? `Week ${photo.weekNumber}` : photo.label} - ${formatDate(photo.createdAt)}`,
  }))

  function handlePause(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (user) pauseMutation.mutate({ member, reason: pauseReason, user })
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <section className="grid gap-4">
        <Button type="button" variant="ghost" className="w-fit px-0" onClick={() => navigate("/members")}><ArrowLeftIcon data-icon="inline-start" /> Back to Members</Button>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">{member.profile.displayName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {member.profile.age ?? "-"} - {humanizeMemberValue(member.profile.sex, "Not provided")} - {humanizeMemberValue(member.profile.callSlot)} - {humanizeMemberValue(member.status)}
            </p>
          </div>
          {member.status === "paused" ? (
            <Button type="button" disabled={isUpdatingStatus} onClick={() => user && resumeMutation.mutate({ currentMember: member, currentUser: user })}>
              {isUpdatingStatus ? <Spinner data-icon="inline-start" /> : <PlayCircleIcon data-icon="inline-start" />} Reactivate member
            </Button>
          ) : member.status === "completed" ? null : (
            <Button type="button" variant="outline" className="border-destructive text-destructive hover:text-destructive" disabled={isUpdatingStatus} onClick={() => setPauseDialogOpen(true)}>
              <PauseCircleIcon data-icon="inline-start" /> Deactivate member
            </Button>
          )}
        </div>
      </section>

      {attention.length > 0 && <Alert variant="destructive"><AlertTriangleIcon /><AlertDescription>{attention.join(" - ")}</AlertDescription></Alert>}
      {member.status === "paused" && (
        <Alert><PauseCircleIcon /><AlertTitle>Member access is paused</AlertTitle><AlertDescription>{member.pauseReason || "No pause reason was recorded."} Paused {formatDate(member.pausedAt)}.</AlertDescription></Alert>
      )}
      {operationsQuery.error && <Alert variant="destructive"><AlertTriangleIcon /><AlertTitle>Activity unavailable</AlertTitle><AlertDescription>{operationsQuery.error.message}</AlertDescription></Alert>}
      {!operations && !operationsQuery.error && <Skeleton className="h-96 w-full" aria-label="Loading member activity" />}

      {operations && (
        <Tabs defaultValue="overview" className="gap-5">
          <TabsList className="flex h-auto w-full justify-start gap-5 overflow-x-auto border-b" variant="line">
            <TabsTrigger value="overview" className="flex-none px-0 pb-3">Overview</TabsTrigger>
            <TabsTrigger value="workout-logbook" className="flex-none px-0 pb-3">Workout Logbook</TabsTrigger>
            <TabsTrigger value="check-ins" className="flex-none px-0 pb-3">Check-ins</TabsTrigger>
            <TabsTrigger value="feedback" className="flex-none px-0 pb-3">Feedback</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="grid gap-6">
            <div className="grid items-start gap-4 lg:grid-cols-[1.25fr_0.9fr]">
              <Card>
                <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
                <CardContent><dl className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
                  <ProfileField label="Weight / height" value={`${member.profile.weightKg ?? "-"} kg - ${member.profile.heightCm ?? "-"} cm`} />
                  <ProfileField label="Activity level" value={humanizeMemberValue(member.profile.activity, "Not provided")} />
                  <ProfileField label="Goal" value={memberGoalLabel(member.profile.goal)} />
                  <ProfileField label="Adherence" value={adherence === null ? "Not yet" : `${adherence}%`} />
                  <ProfileField label="Allergies / restrictions" value={member.profile.allergies || "None on file"} />
                  <ProfileField label="Injuries / limitations" value={member.profile.injuries || "None on file"} />
                  <ProfileField label="Training days" value={`${member.profile.trainingDaysPerWeek || "-"} per week`} />
                  <ProfileField label="Call slot" value={humanizeMemberValue(member.profile.callSlot)} />
                </dl></CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Gamification</CardTitle></CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Metric value={member.stats.points} label="RP" />
                    <Metric value={`${rank.emoji} ${rank.name}`} label="Rank" />
                    <Metric value={member.stats.streakWeeks} label="Week streak" />
                    <Metric value={`${operations.badges.length}/${memberBadgeDefinitions.length}`} label="Badges" />
                  </div>
                  <div className="flex flex-wrap gap-2" aria-label="Badge progress">
                    {memberBadgeDefinitions.map((badge) => (
                      <span key={badge.id} className={earnedBadgeIds.has(badge.id) ? "text-xl" : "text-xl opacity-25 grayscale"} title={`${badge.name}${earnedBadgeIds.has(badge.id) ? " - earned" : " - locked"}`}>{badge.emoji}</span>
                    ))}
                  </div>
                  <Separator />
                  <h2 className="font-semibold">Food plan preview</h2>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Metric value={nutrition.calories} label="Calories" />
                    <Metric value={`${nutrition.protein}g`} label="Protein" />
                    <Metric value={`${nutrition.carbs}g`} label="Carbs" />
                    <Metric value={`${nutrition.fat}g`} label="Fat" />
                  </div>
                  <p className="bg-muted px-3 py-2 text-xs text-muted-foreground">{member.profile.allergies ? `Restrictions on file: ${member.profile.allergies}` : nutrition.plateStructure}</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid items-start gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader><CardTitle><ImageIcon /> Progress photos</CardTitle></CardHeader>
                <CardContent>
                  {operations.photos.length === 0 ? <p className="text-sm text-muted-foreground">No progress photos uploaded.</p> : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {operations.photos.slice(0, 6).map((photo) => (
                        <figure key={photo.id} className="grid gap-1">
                          {photo.url ? (
                            <button type="button" className="group/photo overflow-hidden rounded-md border focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none" aria-label={`View ${photo.label} larger`} onClick={() => setPhotoIndex(lightboxPhotos.findIndex((item) => item.url === photo.url))}>
                              <img src={photo.url} alt={photo.label} className="aspect-square w-full cursor-zoom-in object-cover transition-transform group-hover/photo:scale-[1.03]" />
                            </button>
                          ) : <div className="flex aspect-square items-center justify-center rounded-md border bg-muted"><ImageIcon className="size-6 text-muted-foreground" /></div>}
                          <figcaption className="truncate text-xs text-muted-foreground">{photo.weekNumber ? `Week ${photo.weekNumber}` : photo.label} - {formatDate(photo.createdAt)}</figcaption>
                        </figure>
                      ))}
                    </div>
                  )}
                  {operations.photos.length > 6 && <p className="mt-2 text-xs text-muted-foreground">Showing the latest 6 of {operations.photos.length}; open one to browse them all.</p>}
                  <ImageLightbox images={lightboxPhotos} index={photoIndex} onIndexChange={setPhotoIndex} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle><HistoryIcon /> Lifecycle history</CardTitle></CardHeader>
                <CardContent className="grid gap-3">
                  {operations.lifecycleEvents.length === 0 && <p className="text-sm text-muted-foreground">No lifecycle events recorded.</p>}
                  {operations.lifecycleEvents.slice(0, 8).map((event) => (
                    <div key={event.id} className="grid gap-1 border-b pb-3 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between gap-2"><p className="font-medium">{humanizeMemberValue(event.type)}</p><Badge variant="outline">{humanizeMemberValue(event.toStatus)}</Badge></div>
                      {event.reason && <p className="text-sm text-muted-foreground">{event.reason}</p>}
                      <p className="text-xs text-muted-foreground">{formatDateTime(event.createdAt)} - {event.createdByEmail || "system"}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="workout-logbook" className="grid gap-4">
            <Select value={dayFilter} onValueChange={(value) => value && setDayFilter(value)}>
              <SelectTrigger className="w-40" aria-label="Filter workout logbook by day"><SelectValue /></SelectTrigger>
              <SelectContent align="start"><SelectGroup>
                <SelectItem value="all">All days</SelectItem>
                {dayOptions.map(([dayNumber, label]) => (
                  <SelectItem key={dayNumber} value={String(dayNumber)}>
                    {/\bday\s+\d+/i.test(label) ? label : `Day ${dayNumber} - ${label}`}
                  </SelectItem>
                ))}
              </SelectGroup></SelectContent>
            </Select>
            <div className="overflow-hidden rounded-md border bg-background">
              <Table><TableHeader><TableRow>
                <TableHead className="min-w-64">Day</TableHead><TableHead>Week</TableHead><TableHead>Date</TableHead><TableHead>Duration</TableHead><TableHead>Completion</TableHead><TableHead>Qualifies</TableHead><TableHead><span className="sr-only">Workout details</span></TableHead>
              </TableRow></TableHeader><TableBody>
                {filteredSessions.length === 0 && <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground">No workouts logged for this filter.</TableCell></TableRow>}
                {filteredSessions.map((session) => {
                  const expanded = expandedSessionId === session.id
                  return <Fragment key={session.id}>
                    <TableRow aria-expanded={expanded}>
                      <TableCell className="font-semibold">{workoutLabel(session)}</TableCell>
                      <TableCell><WeekBadge week={session.weekNumber} /></TableCell>
                      <TableCell className="font-mono tabular-nums">{formatDate(session.completedAt)}</TableCell>
                      <TableCell className="font-mono tabular-nums">{formatDuration(session.durationSeconds)}</TableCell>
                      <TableCell className="font-mono tabular-nums">{completionPercent(session)}%</TableCell>
                      <TableCell><Badge variant={session.qualifies ? "secondary" : "outline"}>{session.qualifies ? "Qualifies" : "Below target"}</Badge></TableCell>
                      <TableCell className="text-right"><Button type="button" variant="ghost" size="sm" aria-expanded={expanded} onClick={() => setExpandedSessionId(expanded ? null : session.id)}>
                        {expanded ? <ChevronDownIcon data-icon="inline-start" /> : <ChevronRightIcon data-icon="inline-start" />}{expanded ? "Hide sets" : "View sets"}
                      </Button></TableCell>
                    </TableRow>
                    {expanded && <TableRow><TableCell colSpan={7} className="whitespace-normal bg-muted/40 px-5 py-4"><WorkoutDetails memberId={member.id} session={session} /></TableCell></TableRow>}
                  </Fragment>
                })}
              </TableBody></Table>
            </div>
          </TabsContent>

          <TabsContent value="check-ins">
            <div className="overflow-hidden rounded-md border bg-background"><Table><TableHeader><TableRow>
              <TableHead>Week</TableHead><TableHead>Workouts</TableHead><TableHead>Adherence</TableHead><TableHead>Energy</TableHead><TableHead className="min-w-72">Notes</TableHead>
            </TableRow></TableHeader><TableBody>
              {operations.checkIns.length === 0 && <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground">No check-ins submitted.</TableCell></TableRow>}
              {operations.checkIns.map((checkIn) => <TableRow key={checkIn.id}>
                <TableCell><WeekBadge week={checkIn.weekNumber} /></TableCell><TableCell>{checkIn.workoutsDone}</TableCell><TableCell>{checkIn.nutritionPct}%</TableCell><TableCell>{checkIn.energy === null ? "-" : `${checkIn.energy}/10`}</TableCell><TableCell className="whitespace-normal text-muted-foreground">{checkIn.note || "-"}</TableCell>
              </TableRow>)}
            </TableBody></Table></div>
          </TabsContent>

          <TabsContent value="feedback">
            <div className="overflow-hidden rounded-md border bg-background"><Table><TableHeader><TableRow>
              <TableHead>Week</TableHead><TableHead>Training felt</TableHead><TableHead>Pain</TableHead><TableHead className="min-w-72">Nutrition / member notes</TableHead><TableHead><span className="sr-only">Review</span></TableHead>
            </TableRow></TableHeader><TableBody>
              {operations.checkIns.length === 0 && <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground">No feedback submitted.</TableCell></TableRow>}
              {operations.checkIns.map((checkIn) => {
                const expanded = expandedFeedbackId === checkIn.id
                return <Fragment key={checkIn.id}>
                  <TableRow aria-expanded={expanded}>
                    <TableCell><WeekBadge week={checkIn.weekNumber} /></TableCell><TableCell>{humanizeMemberValue(checkIn.trainingFeel, "-")}</TableCell><TableCell className="whitespace-normal">{checkIn.pain || "None reported"}</TableCell><TableCell className="whitespace-normal text-muted-foreground">{checkIn.note || "-"}</TableCell>
                    <TableCell className="text-right"><Button type="button" variant="ghost" size="sm" aria-expanded={expanded} onClick={() => setExpandedFeedbackId(expanded ? null : checkIn.id)}>
                      {expanded ? <ChevronDownIcon data-icon="inline-start" /> : <ChevronRightIcon data-icon="inline-start" />}{expanded ? "Hide review" : "Review"}
                    </Button></TableCell>
                  </TableRow>
                  {expanded && <TableRow><TableCell colSpan={5} className="whitespace-normal bg-muted/40 px-5 py-4"><CheckInReviewForm key={`${checkIn.id}:${checkIn.reviewStatus}:${checkIn.reviewNote}:${checkIn.reviewedAt?.getTime() ?? 0}`} memberId={member.id} checkIn={checkIn} /></TableCell></TableRow>}
                </Fragment>
              })}
            </TableBody></Table></div>
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={pauseDialogOpen} onOpenChange={(open) => !isUpdatingStatus && setPauseDialogOpen(open)}>
        <DialogContent><form onSubmit={handlePause} className="contents">
          <DialogHeader><DialogTitle>Deactivate {member.profile.displayName}</DialogTitle><DialogDescription>This pauses member access without deleting their profile, logs, photos, or lifecycle history.</DialogDescription></DialogHeader>
          <FieldGroup><Field data-disabled={isUpdatingStatus || undefined}><FieldLabel htmlFor="pause-reason">Reason</FieldLabel><Textarea id="pause-reason" value={pauseReason} onChange={(event) => setPauseReason(event.target.value)} minLength={3} maxLength={240} disabled={isUpdatingStatus} autoFocus required /><FieldDescription>For example: membership hold requested by member.</FieldDescription></Field></FieldGroup>
          <DialogFooter><Button type="button" variant="outline" disabled={isUpdatingStatus} onClick={() => setPauseDialogOpen(false)}>Cancel</Button><Button type="submit" variant="destructive" disabled={isUpdatingStatus || pauseReason.trim().length < 3}>{isUpdatingStatus && <Spinner data-icon="inline-start" />} Deactivate member</Button></DialogFooter>
        </form></DialogContent>
      </Dialog>
    </div>
  )
}
