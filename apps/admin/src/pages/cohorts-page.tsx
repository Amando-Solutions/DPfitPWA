import { type FormEvent, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { useMutation } from "@tanstack/react-query"
import { createColumnHelper } from "@tanstack/react-table"
import {
  AlertCircleIcon,
  ArchiveIcon,
  CalendarRangeIcon,
  CheckCircle2Icon,
  Clock3Icon,
  DumbbellIcon,
  PlusIcon,
  PlayCircleIcon,
  Settings2Icon,
  UsersIcon,
} from "lucide-react"
import { toast } from "sonner"

import { DataTable } from "@/components/data-table/data-table"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import type { DataTableFeatures } from "@/components/data-table/data-table-features"
import { DataTableRowActions, type DataTableRowAction } from "@/components/data-table/data-table-row-actions"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useAdminAuth } from "@/hooks/use-admin-auth"
import { useCohortsQuery, useLiveCallsQuery, usePlatformSettingsQuery, useProgramsQuery } from "@/hooks/use-admin-queries"
import { callEnd } from "@/lib/live-calls"
import {
  assignProgramToCohort,
  createCohort,
  saveCohortExperience,
  setCohortStatus,
  type CohortExperienceInput,
  type CohortRecord,
  type CohortStatus,
} from "@/lib/cohorts"
import type { ProgramRecord } from "@/lib/programs"

const cohortColumnHelper = createColumnHelper<DataTableFeatures, CohortRecord>()

const dateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

const statusItems = [
  { label: "Active", value: "active" },
  { label: "Draft", value: "draft" },
]

const visibilityItems = [
  { label: "Visible", value: "visible" },
  { label: "Hidden", value: "hidden" },
]

function inputDate(value = new Date()) {
  const offset = value.getTimezoneOffset() * 60_000
  return new Date(value.getTime() - offset).toISOString().slice(0, 10)
}

function formatDate(value: Date) {
  return value.getTime() > 0 ? dateFormatter.format(value) : "—"
}

function experienceFormOf(cohort: CohortRecord): CohortExperienceInput {
  return {
    coachName: cohort.coach?.name || "DP Fit Coach",
    coachTitle: cohort.coach?.title || "Coach",
    coachAvatarUrl: cohort.coach?.avatarUrl || "",
    leaderboardVisible: cohort.leaderboardVisible,
    leaderboardRevealWeek: cohort.leaderboardRevealWeek,
  }
}

function statusBadge(status: CohortStatus) {
  if (status === "active") {
    return (
      <Badge variant="secondary">
        <CheckCircle2Icon data-icon="inline-start" /> Active
      </Badge>
    )
  }
  if (status === "archived") {
    return (
      <Badge variant="outline">
        <ArchiveIcon data-icon="inline-start" /> Archived
      </Badge>
    )
  }
  return (
    <Badge variant="outline">
      <Clock3Icon data-icon="inline-start" /> Draft
    </Badge>
  )
}

function CohortNextCall({ cohortId }: { cohortId: string }) {
  const callsQuery = useLiveCallsQuery()
  const [now] = useState(() => Date.now())
  const next = (callsQuery.data ?? []).find((call) => call.cohortId === cohortId && callEnd(call).getTime() >= now)
  if (callsQuery.isPending) return <>Loading calls…</>
  return next
    ? <>Next: {next.title} · {next.startsAt.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</>
    : <>No upcoming calls for this cohort.</>
}

export function CohortsPage() {
  const { user } = useAdminAuth()
  const cohortsQuery = useCohortsQuery()
  const programsQuery = useProgramsQuery()
  const settingsQuery = usePlatformSettingsQuery()
  const cohorts = useMemo(() => cohortsQuery.data ?? [], [cohortsQuery.data])
  const programs = useMemo(
    () => (programsQuery.data ?? []).filter((program) => program.status === "published"),
    [programsQuery.data],
  )
  const isLoading = cohortsQuery.isPending
  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState("")
  const [startDate, setStartDate] = useState(inputDate())
  const [durationWeeks, setDurationWeeks] = useState("6")
  const [status, setStatus] = useState("active")
  const [selectedProgramId, setSelectedProgramId] = useState("")
  const [assignmentTarget, setAssignmentTarget] = useState<CohortRecord | null>(null)
  const [assignmentProgramId, setAssignmentProgramId] = useState("")
  const [archiveTarget, setArchiveTarget] = useState<CohortRecord | null>(null)
  const [experienceTarget, setExperienceTarget] = useState<CohortRecord | null>(null)
  const [experienceForm, setExperienceForm] = useState<CohortExperienceInput | null>(null)
  const effectiveProgramId = programs.some((program) => program.id === selectedProgramId)
    ? selectedProgramId
    : (programs[0]?.id ?? "")

  const createMutation = useMutation({
    mutationFn: createCohort,
    onSuccess: () => {
      setDialogOpen(false)
      setName("")
      setStartDate(inputDate())
      setDurationWeeks("6")
      setStatus("active")
      setSelectedProgramId(programs[0]?.id ?? "")
      toast.success("Cohort created")
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Cohort could not be created."),
  })
  const assignmentMutation = useMutation({
    mutationFn: ({ cohort, program, currentUser }: { cohort: CohortRecord; program: ProgramRecord; currentUser: NonNullable<typeof user> }) =>
      assignProgramToCohort(cohort, program, currentUser),
    onSuccess: (_, variables) => {
      toast.success(`${variables.program.name} assigned to ${variables.cohort.name}`)
      setAssignmentTarget(null)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Program could not be assigned."),
  })
  const statusMutation = useMutation({
    mutationFn: ({ cohort, nextStatus, currentUser }: { cohort: CohortRecord; nextStatus: "active" | "archived"; currentUser: NonNullable<typeof user> }) =>
      setCohortStatus(cohort, nextStatus, currentUser),
    onSuccess: (_, variables) => {
      toast.success(`${variables.cohort.name} ${variables.nextStatus === "active" ? "activated" : "archived"}`)
      if (variables.nextStatus === "archived") setArchiveTarget(null)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Cohort status could not be updated."),
  })
  const experienceMutation = useMutation({
    mutationFn: ({ cohort, experience, currentUser }: { cohort: CohortRecord; experience: CohortExperienceInput; currentUser: NonNullable<typeof user> }) =>
      saveCohortExperience(cohort, experience, currentUser),
    onSuccess: (_, variables) => {
      toast.success(`${variables.cohort.name} settings saved`)
      setExperienceTarget(null)
      setExperienceForm(null)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Cohort settings could not be saved."),
  })
  const isCreating = createMutation.isPending
  const isUpdating = assignmentMutation.isPending || statusMutation.isPending || experienceMutation.isPending

  const activeCount = useMemo(
    () => cohorts.filter((cohort) => cohort.status === "active").length,
    [cohorts],
  )
  // Settings → "Multiple simultaneous challenges" off: one active cohort at a time.
  const singleCohortBlock = settingsQuery.data?.multipleCohorts === false && activeCount > 0
    ? "Only one cohort can run at a time. Archive the active cohort first, or allow multiple simultaneous challenges in Settings."
    : null
  const memberCount = useMemo(
    () => cohorts.reduce((total, cohort) => total + cohort.memberCount, 0),
    [cohorts],
  )

  function openProgramAssignment(cohort: CohortRecord) {
    setAssignmentTarget(cohort)
    setAssignmentProgramId(cohort.programId ?? programs[0]?.id ?? "")
  }

  function openExperienceSettings(cohort: CohortRecord) {
    setExperienceTarget(cohort)
    setExperienceForm(experienceFormOf(cohort))
  }

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) {
      toast.error("Your admin session has expired. Sign in again.")
      return
    }

    const parsedStartDate = new Date(`${startDate}T00:00:00+01:00`)
    const selectedProgram = programs.find((program) => program.id === effectiveProgramId)
    if (!selectedProgram) {
      toast.error("Choose a published program.")
      return
    }
    createMutation.mutate({
      name,
      startDate: parsedStartDate,
      durationWeeks: Number.parseInt(durationWeeks, 10),
      status: status as "active" | "draft",
      program: selectedProgram,
      user,
    })
  }

  function handleProgramAssignment() {
    if (!user || !assignmentTarget) return
    const selectedProgram = programs.find((program) => program.id === assignmentProgramId)
    if (!selectedProgram) {
      toast.error("Choose a published program.")
      return
    }

    assignmentMutation.mutate({ cohort: assignmentTarget, program: selectedProgram, currentUser: user })
  }

  function handleActivate(cohort: CohortRecord) {
    if (!user) return
    statusMutation.mutate({ cohort, nextStatus: "active", currentUser: user })
  }

  function handleArchive() {
    if (!user || !archiveTarget) return
    statusMutation.mutate({ cohort: archiveTarget, nextStatus: "archived", currentUser: user })
  }

  function handleExperienceSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || !experienceTarget || !experienceForm) return
    experienceMutation.mutate({ cohort: experienceTarget, experience: experienceForm, currentUser: user })
  }

  const cohortColumns = cohortColumnHelper.columns([
    cohortColumnHelper.accessor("name", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
      cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
    }),
    cohortColumnHelper.accessor("status", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ getValue }) => statusBadge(getValue()),
    }),
    cohortColumnHelper.accessor((cohort) => cohort.startDate.getTime(), {
      id: "startDate",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Start date" />
      ),
      cell: ({ row }) => formatDate(row.original.startDate),
    }),
    cohortColumnHelper.accessor("durationWeeks", {
      id: "duration",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Duration" />
      ),
      cell: ({ getValue }) => `${getValue()} weeks`,
    }),
    cohortColumnHelper.accessor((cohort) => cohort.programName ?? "", {
      id: "program",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Program" />
      ),
      cell: ({ row }) =>
        row.original.programName ? (
          <span>
            {row.original.programName}{" "}
            <span className="font-mono text-xs text-muted-foreground">
              v{row.original.programVersion}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">Unassigned</span>
        ),
    }),
    cohortColumnHelper.accessor("memberCount", {
      id: "members",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Members" />
      ),
    }),
    cohortColumnHelper.display({
      id: "actions",
      enableHiding: false,
      cell: ({ row }) => {
        const cohort = row.original
        const actions: DataTableRowAction[] = []

        if (cohort.status !== "archived") {
          actions.push({
            label: "Cohort settings",
            icon: Settings2Icon,
            disabled: isUpdating,
            onSelect: () => openExperienceSettings(cohort),
          })
        }
        if (cohort.status === "draft" || (cohort.status === "active" && !cohort.programId)) {
          actions.push({
            label: cohort.programId ? "Change program" : "Assign program",
            icon: DumbbellIcon,
            disabled: isUpdating,
            onSelect: () => openProgramAssignment(cohort),
          })
        }
        if (cohort.status === "draft") {
          actions.push({
            label: "Activate cohort",
            icon: PlayCircleIcon,
            disabled: isUpdating || !!singleCohortBlock,
            onSelect: () => void handleActivate(cohort),
          })
        }
        if (cohort.status !== "archived") {
          actions.push({
            label: "Archive cohort",
            icon: ArchiveIcon,
            variant: "destructive",
            separatorBefore: true,
            disabled: isUpdating,
            onSelect: () => setArchiveTarget(cohort),
          })
        }

        return actions.length > 0 ? (
          <DataTableRowActions label={`Actions for ${cohort.name}`} actions={actions} />
        ) : null
      },
    }),
  ])

  return (
    <div className="flex flex-1 flex-col gap-6">
      <section className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Cohorts</h1>
          {singleCohortBlock && <p className="mt-1 max-w-xl text-sm text-muted-foreground">{singleCohortBlock}</p>}
        </div>

        <Dialog open={dialogOpen} onOpenChange={(open) => !isCreating && setDialogOpen(open)}>
          <DialogTrigger render={<Button className="min-h-11 sm:min-h-8" disabled={!!singleCohortBlock} title={singleCohortBlock ?? undefined} />}>
            <PlusIcon data-icon="inline-start" /> Create cohort
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleCreate} className="contents">
              <DialogHeader>
                <DialogTitle>Create cohort</DialogTitle>
              </DialogHeader>
              <FieldGroup>
                <Field data-disabled={isCreating || undefined}>
                  <FieldLabel htmlFor="cohort-name">Name</FieldLabel>
                  <Input
                    id="cohort-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    minLength={2}
                    maxLength={80}
                    disabled={isCreating}
                    autoFocus
                    required
                    className="h-11 sm:h-8"
                  />
                </Field>
                <Field data-disabled={isCreating || undefined}>
                  <FieldLabel htmlFor="cohort-start-date">Start date</FieldLabel>
                  <Input
                    id="cohort-start-date"
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    disabled={isCreating}
                    required
                    className="h-11 sm:h-8"
                  />
                  <FieldDescription>Africa/Lagos timezone</FieldDescription>
                </Field>
                <Field data-disabled={isCreating || undefined}>
                  <FieldLabel htmlFor="cohort-duration">Duration in weeks</FieldLabel>
                  <Input
                    id="cohort-duration"
                    type="number"
                    min="1"
                    max="52"
                    inputMode="numeric"
                    value={durationWeeks}
                    onChange={(event) => setDurationWeeks(event.target.value)}
                    disabled={isCreating}
                    required
                    className="h-11 sm:h-8"
                  />
                </Field>
                <Field data-disabled={isCreating || undefined}>
                  <FieldLabel htmlFor="cohort-program">Program</FieldLabel>
                  <Select
                    items={programs.map((program) => ({
                      label: `${program.name} · v${program.version}`,
                      value: program.id,
                    }))}
                    value={effectiveProgramId}
                    onValueChange={(value) => value && setSelectedProgramId(value)}
                    disabled={isCreating || programs.length === 0}
                  >
                    <SelectTrigger id="cohort-program" className="h-11 w-full sm:h-8">
                      <SelectValue placeholder="Select a published program" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {programs.map((program) => (
                          <SelectItem key={program.id} value={program.id}>
                            {program.name} · v{program.version}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field data-disabled={isCreating || undefined}>
                  <FieldLabel htmlFor="cohort-status">Status</FieldLabel>
                  <Select
                    items={statusItems}
                    value={status}
                    onValueChange={(value) => value && setStatus(value)}
                    disabled={isCreating}
                  >
                    <SelectTrigger id="cohort-status" className="h-11 w-full sm:h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {statusItems.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGroup>
              <DialogFooter>
                <DialogClose render={<Button type="button" variant="outline" disabled={isCreating} />}>
                  Cancel
                </DialogClose>
                <Button type="submit" disabled={isCreating || !effectiveProgramId}>
                  {isCreating && <Spinner data-icon="inline-start" />}
                  Create cohort
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </section>

      {cohortsQuery.error && (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Cohorts unavailable</AlertTitle>
          <AlertDescription>{cohortsQuery.error.message}</AlertDescription>
        </Alert>
      )}

      {programsQuery.error && (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Programs unavailable</AlertTitle>
          <AlertDescription>{programsQuery.error.message}</AlertDescription>
        </Alert>
      )}

      <section className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Total cohorts</CardDescription>
            <CardTitle className="font-mono text-3xl tabular-nums">
              {isLoading ? <Skeleton className="h-9 w-12" /> : cohorts.length}
            </CardTitle>
            <CardAction><CalendarRangeIcon className="size-4 text-muted-foreground" /></CardAction>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Active</CardDescription>
            <CardTitle className="font-mono text-3xl tabular-nums">
              {isLoading ? <Skeleton className="h-9 w-12" /> : activeCount}
            </CardTitle>
            <CardAction><CheckCircle2Icon className="size-4 text-muted-foreground" /></CardAction>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Members</CardDescription>
            <CardTitle className="font-mono text-3xl tabular-nums">
              {isLoading ? <Skeleton className="h-9 w-12" /> : memberCount}
            </CardTitle>
            <CardAction><UsersIcon className="size-4 text-muted-foreground" /></CardAction>
          </CardHeader>
        </Card>
      </section>

      <Card className="flex-1">
        <CardHeader className="border-b">
          <CardTitle>Cohort directory</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading && (
            <div className="flex flex-col gap-3 p-4" role="status">
              <span className="sr-only">Loading cohorts</span>
              {Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-12 w-full" />)}
            </div>
          )}

          {!isLoading && cohorts.length > 0 && (
            <DataTable
              columns={cohortColumns}
              data={cohorts}
              searchPlaceholder="Filter cohorts..."
              searchAccessor={(cohort) =>
                [cohort.name, cohort.status, cohort.programName ?? ""].join(" ")
              }
              columnLabels={{
                name: "Name",
                status: "Status",
                startDate: "Start date",
                duration: "Duration",
                program: "Program",
                members: "Members",
              }}
              onRowClick={openExperienceSettings}
              isRowClickable={(cohort) => cohort.status !== "archived"}
              getRowLabel={(cohort) => `Open settings for ${cohort.name}`}
            />
          )}

          {!isLoading && cohorts.length === 0 && (
            <Empty className="min-h-80">
              <EmptyHeader>
                <EmptyMedia variant="icon"><CalendarRangeIcon /></EmptyMedia>
                <EmptyTitle>No cohorts yet</EmptyTitle>
              </EmptyHeader>
              <EmptyContent>
                <Button type="button" onClick={() => setDialogOpen(true)}>
                  <PlusIcon data-icon="inline-start" /> Create cohort
                </Button>
              </EmptyContent>
            </Empty>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(assignmentTarget)}
        onOpenChange={(open) => !isUpdating && !open && setAssignmentTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {assignmentTarget?.programId ? "Change" : "Assign"} program for {assignmentTarget?.name}
            </DialogTitle>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="assignment-program">Program</FieldLabel>
            <Select
              items={programs.map((program) => ({
                label: `${program.name} · v${program.version}`,
                value: program.id,
              }))}
              value={assignmentProgramId}
              onValueChange={(value) => value && setAssignmentProgramId(value)}
              disabled={isUpdating}
            >
              <SelectTrigger id="assignment-program" className="h-11 w-full sm:h-8">
                <SelectValue placeholder="Select a published program" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {programs.map((program) => (
                    <SelectItem key={program.id} value={program.id}>
                      {program.name} · v{program.version}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={isUpdating} onClick={() => setAssignmentTarget(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={isUpdating || !assignmentProgramId} onClick={() => void handleProgramAssignment()}>
              {isUpdating && <Spinner data-icon="inline-start" />} Assign program
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(experienceTarget && experienceForm)}
        onOpenChange={(open) => {
          if (!isUpdating && !open) {
            setExperienceTarget(null)
            setExperienceForm(null)
          }
        }}
      >
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
          {experienceTarget && experienceForm && (
            <form onSubmit={handleExperienceSave} className="contents">
              <DialogHeader><DialogTitle>Settings for {experienceTarget.name}</DialogTitle></DialogHeader>
              <FieldGroup>
                <Card size="sm">
                  <CardHeader><CardTitle>Coach identity</CardTitle><CardDescription>Shown in the member’s private coach conversation.</CardDescription></CardHeader>
                  <CardContent><FieldGroup>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field data-disabled={isUpdating || undefined}><FieldLabel htmlFor="coach-name">Name</FieldLabel><Input id="coach-name" value={experienceForm.coachName} maxLength={80} disabled={isUpdating} required onChange={(event) => setExperienceForm((current) => current ? { ...current, coachName: event.target.value } : current)} /></Field>
                      <Field data-disabled={isUpdating || undefined}><FieldLabel htmlFor="coach-title">Title</FieldLabel><Input id="coach-title" value={experienceForm.coachTitle} maxLength={80} disabled={isUpdating} required onChange={(event) => setExperienceForm((current) => current ? { ...current, coachTitle: event.target.value } : current)} /></Field>
                    </div>
                    <Field data-disabled={isUpdating || undefined}><FieldLabel htmlFor="coach-avatar">Avatar URL</FieldLabel><Input id="coach-avatar" type="url" value={experienceForm.coachAvatarUrl} maxLength={2048} disabled={isUpdating} placeholder="https://…" onChange={(event) => setExperienceForm((current) => current ? { ...current, coachAvatarUrl: event.target.value } : current)} /></Field>
                  </FieldGroup></CardContent>
                </Card>

                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Live call</CardTitle>
                    <CardDescription><CohortNextCall cohortId={experienceTarget.id} /></CardDescription>
                    <CardAction><Button type="button" size="sm" variant="outline" render={<Link to="/live-calls" />}>Manage live calls</Button></CardAction>
                  </CardHeader>
                </Card>

                <Card size="sm">
                  <CardHeader><CardTitle>Leaderboard</CardTitle><CardDescription>The ranking keeps accumulating while hidden.</CardDescription></CardHeader>
                  <CardContent><FieldGroup>
                    <Field data-disabled={isUpdating || undefined}>
                      <FieldLabel htmlFor="leaderboard-visibility">Member visibility</FieldLabel>
                      <Select items={visibilityItems} value={experienceForm.leaderboardVisible ? "visible" : "hidden"} disabled={isUpdating} onValueChange={(value) => value && setExperienceForm((current) => current ? { ...current, leaderboardVisible: value === "visible" } : current)}>
                        <SelectTrigger id="leaderboard-visibility" className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectGroup>{visibilityItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
                      </Select>
                    </Field>
                    <Field data-disabled={isUpdating || undefined}><FieldLabel htmlFor="leaderboard-week">Reveal week</FieldLabel><Input id="leaderboard-week" type="number" min="1" max={experienceTarget.durationWeeks} value={experienceForm.leaderboardRevealWeek} disabled={isUpdating} required onChange={(event) => setExperienceForm((current) => current ? { ...current, leaderboardRevealWeek: Number(event.target.value) } : current)} /><FieldDescription>Used by the PWA’s reveal notice; it does not automatically change visibility.</FieldDescription></Field>
                  </FieldGroup></CardContent>
                </Card>
              </FieldGroup>
              <DialogFooter><Button type="button" variant="outline" disabled={isUpdating} onClick={() => { setExperienceTarget(null); setExperienceForm(null) }}>Cancel</Button><Button type="submit" disabled={isUpdating}>{isUpdating && <Spinner data-icon="inline-start" />} Save settings</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(archiveTarget)} onOpenChange={(open) => !isUpdating && !open && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia><ArchiveIcon /></AlertDialogMedia>
            <AlertDialogTitle>Archive {archiveTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Existing members and access codes remain available. New codes cannot be generated for this cohort.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUpdating}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={isUpdating} onClick={() => void handleArchive()}>
              {isUpdating && <Spinner data-icon="inline-start" />} Archive cohort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
