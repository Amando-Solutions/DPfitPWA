import { type FormEvent, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { useMutation } from "@tanstack/react-query"
import { createColumnHelper } from "@tanstack/react-table"
import {
  AlertCircleIcon,
  ArchiveIcon,
  ArchiveRestoreIcon,
  CalendarRangeIcon,
  CheckCircle2Icon,
  Clock3Icon,
  DumbbellIcon,
  FlagIcon,
  PlusIcon,
  PlayCircleIcon,
  Settings2Icon,
  UsersIcon,
} from "lucide-react"
import { toast } from "sonner"

import { CohortCoachFields, CohortSalesFields } from "@/components/cohort-fields"
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
import { Switch } from "@/components/ui/switch"
import { useAdminAuth } from "@/hooks/use-admin-auth"
import {
  useAccessCodesQuery,
  useCohortsQuery,
  useLiveCallsQuery,
  useMembersQuery,
  usePlatformSettingsQuery,
  useProgramsQuery,
} from "@/hooks/use-admin-queries"
import { effectiveCodeStatus, revokeAccessCodes } from "@/lib/access-codes"
import {
  cohortOver,
  cohortZone,
  dayIn,
  DEFAULT_TIMEZONE,
  formatDayIn,
  formatDayKey,
  isDayKey,
  lastDayOf,
  lastDayOfCohort,
  zoneLabel,
} from "@/lib/cohort-calendar"
import { callEnd } from "@/lib/live-calls"
import {
  assignProgramToCohort,
  cohortInProgress,
  cohortProgramEditable,
  cohortStartEditable,
  createCohort,
  registrationInputOf,
  reopenCohort,
  saveCohortExperience,
  setCohortStatus,
  type CohortCoachInput,
  type CohortExperienceInput,
  type CohortRecord,
  type CohortRegistrationInput,
} from "@/lib/cohorts"
import type { ProgramRecord } from "@/lib/programs"

const cohortColumnHelper = createColumnHelper<DataTableFeatures, CohortRecord>()

const statusItems = [
  { label: "Active", value: "active" },
  { label: "Draft", value: "draft" },
]

const visibilityItems = [
  { label: "Visible", value: "visible" },
  { label: "Hidden", value: "hidden" },
]

/** Today on a new cohort's calendar: the create form's default start. */
const todayInLagos = () => dayIn(new Date(), DEFAULT_TIMEZONE)

/** A cohort's date as the day it names on the cohort's own calendar. */
const formatCohortDay = (cohort: CohortRecord, value: Date | null) => formatDayIn(value, cohortZone(cohort.timezone))

type EffectiveStatus = "draft" | "active" | "ended"

/** What a cohort is to its members now: a cohort past its last day is over, whatever `status` says. */
const effectiveStatusOf = (cohort: CohortRecord, now: Date): EffectiveStatus =>
  cohortOver(cohort, now) ? "ended" : cohort.status === "active" ? "active" : "draft"

const coachInputOf = (cohort: CohortRecord | undefined): CohortCoachInput => ({
  name: cohort?.coach?.name || "DP Fit Coach",
  title: cohort?.coach?.title || "Coach",
  avatarUrl: cohort?.coach?.avatarUrl || "",
})

/** A new cohort's price and code lifetime start as the newest cohort's; its pre-order is its own. */
function newOfferFrom(latest: CohortRecord | undefined): CohortRegistrationInput {
  const offer = latest ? registrationInputOf(latest.registration, cohortZone(latest.timezone)) : null
  return {
    price: offer?.price ?? "",
    currency: offer?.currency || "NGN",
    codeTtlDays: offer?.codeTtlDays ?? "",
    preorderStartsAt: "",
    preorderEndsAt: "",
  }
}

function experienceFormOf(cohort: CohortRecord): CohortExperienceInput {
  const zone = cohortZone(cohort.timezone)
  return {
    coach: coachInputOf(cohort),
    registration: registrationInputOf(cohort.registration, zone),
    leaderboardVisible: cohort.leaderboardVisible,
    leaderboardRevealWeek: cohort.leaderboardRevealWeek,
    startDay: dayIn(cohort.startDate, zone),
    lastDay: lastDayOfCohort(cohort) ?? "",
    program: null,
  }
}

/** "3 members and 1 unused code", or empty when there are neither. */
function membersAndCodes(members: number, codes: number) {
  return [
    members ? `${members} member${members === 1 ? "" : "s"}` : "",
    codes ? `${codes} unused code${codes === 1 ? "" : "s"}` : "",
  ].filter(Boolean).join(" and ")
}

/** "Ended" covers both ways a cohort closes; the stored `status` stays visible beside it. */
function statusBadge(cohort: CohortRecord, now: Date) {
  if (cohort.status === "archived" || cohortOver(cohort, now)) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Badge variant="outline">
          {cohort.status === "archived" ? <ArchiveIcon data-icon="inline-start" /> : <FlagIcon data-icon="inline-start" />} Ended
        </Badge>
        <span className="text-xs text-muted-foreground">
          {cohort.status === "archived" ? "archived" : `last day passed · ${cohort.status}`}
        </span>
      </span>
    )
  }
  if (cohort.status === "active") {
    return (
      <Badge variant="secondary">
        <CheckCircle2Icon data-icon="inline-start" /> Active
      </Badge>
    )
  }
  return (
    <Badge variant="outline">
      <Clock3Icon data-icon="inline-start" /> Draft
    </Badge>
  )
}

function CohortNextCall({ cohort }: { cohort: CohortRecord }) {
  const callsQuery = useLiveCallsQuery()
  const [now] = useState(() => Date.now())
  const next = (callsQuery.data ?? []).find((call) => call.cohortId === cohort.id && callEnd(call).getTime() >= now)
  if (callsQuery.isPending) return <>Loading calls…</>
  return next
    ? <>Next: {next.title} · {next.startsAt.toLocaleString("en", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: cohortZone(cohort.timezone), timeZoneName: "short" })}</>
    : <>No upcoming calls for this cohort.</>
}

export function CohortsPage() {
  const { user } = useAdminAuth()
  const cohortsQuery = useCohortsQuery()
  const programsQuery = useProgramsQuery()
  const settingsQuery = usePlatformSettingsQuery()
  const codesQuery = useAccessCodesQuery()
  const membersQuery = useMembersQuery()
  const cohorts = useMemo(() => cohortsQuery.data ?? [], [cohortsQuery.data])
  const programs = useMemo(
    () => (programsQuery.data ?? []).filter((program) => program.status === "published"),
    [programsQuery.data],
  )
  const isLoading = cohortsQuery.isPending
  const [now] = useState(() => new Date())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState("")
  const [startDate, setStartDate] = useState(todayInLagos)
  const [durationWeeks, setDurationWeeks] = useState("6")
  const [status, setStatus] = useState("active")
  const [selectedProgramId, setSelectedProgramId] = useState("")
  // `null` until edited: the form shows the newest cohort's coach and offer, as they load.
  const [coach, setCoach] = useState<CohortCoachInput | null>(null)
  const [offer, setOffer] = useState<CohortRegistrationInput | null>(null)
  const [assignmentTarget, setAssignmentTarget] = useState<CohortRecord | null>(null)
  const [assignmentProgramId, setAssignmentProgramId] = useState("")
  const [archiveTarget, setArchiveTarget] = useState<CohortRecord | null>(null)
  const [revokeUnusedCodes, setRevokeUnusedCodes] = useState(true)
  const [reopenTarget, setReopenTarget] = useState<CohortRecord | null>(null)
  const [reopenLastDay, setReopenLastDay] = useState("")
  const [experienceTarget, setExperienceTarget] = useState<CohortRecord | null>(null)
  const [experienceForm, setExperienceForm] = useState<CohortExperienceInput | null>(null)
  const coachValue = coach ?? coachInputOf(cohorts[0])
  const offerValue = offer ?? newOfferFrom(cohorts[0])
  const effectiveProgramId = programs.some((program) => program.id === selectedProgramId)
    ? selectedProgramId
    : (programs[0]?.id ?? "")

  const createMutation = useMutation({
    mutationFn: createCohort,
    onSuccess: () => {
      setDialogOpen(false)
      setName("")
      setStartDate(todayInLagos())
      setDurationWeeks("6")
      setStatus("active")
      setSelectedProgramId(programs[0]?.id ?? "")
      setCoach(null)
      setOffer(null)
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
    mutationFn: ({ cohort, currentUser }: { cohort: CohortRecord; currentUser: NonNullable<typeof user> }) =>
      setCohortStatus(cohort, "active", currentUser),
    onSuccess: (_, variables) => toast.success(`${variables.cohort.name} activated`),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Cohort status could not be updated."),
  })
  // Archiving closes the cohort for its members the moment it lands. Its unused
  // codes would still redeem, onto the ended screen, so they can go with it.
  const archiveMutation = useMutation({
    mutationFn: async ({ cohort, codeIds, currentUser }: { cohort: CohortRecord; codeIds: string[]; currentUser: NonNullable<typeof user> }) => {
      await setCohortStatus(cohort, "archived", currentUser)
      await revokeAccessCodes(codeIds, currentUser)
    },
    onSuccess: (_, variables) => {
      const revoked = variables.codeIds.length
      toast.success(`${variables.cohort.name} archived${revoked ? `, and ${revoked} unused code${revoked === 1 ? "" : "s"} revoked` : ""}`)
      setArchiveTarget(null)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "The cohort could not be archived."),
  })
  const reopenMutation = useMutation({
    mutationFn: ({ cohort, lastDay, currentUser }: { cohort: CohortRecord; lastDay: string; currentUser: NonNullable<typeof user> }) =>
      reopenCohort(cohort, currentUser, lastDay || undefined),
    onSuccess: (_, variables) => {
      toast.success(`${variables.cohort.name} reopened`)
      setReopenTarget(null)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "The cohort could not be reopened."),
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
    || archiveMutation.isPending || reopenMutation.isPending

  // Active and not past its last day. One that ended by date isn't running, so it doesn't block the next.
  const activeCount = useMemo(
    () => cohorts.filter((cohort) => cohortInProgress(cohort, now)).length,
    [cohorts, now],
  )
  // Settings → "Multiple simultaneous challenges" off: one active cohort at a time.
  const singleCohortBlock = settingsQuery.data?.multipleCohorts === false && activeCount > 0
    ? "Only one cohort can run at a time. Wait for the running cohort's last day to pass, archive it, or allow multiple simultaneous challenges in Settings."
    : null
  const memberCount = useMemo(
    () => cohorts.reduce((total, cohort) => total + cohort.memberCount, 0),
    [cohorts],
  )

  // What archiving the target touches: its members, and the codes that could still be redeemed.
  const archiveMembers = archiveTarget
    ? (membersQuery.data ?? []).filter((member) => member.cohortId === archiveTarget.id).length
    : 0
  const archiveCodeIds = archiveTarget
    ? (codesQuery.data ?? [])
        .filter((code) => code.cohortId === archiveTarget.id && effectiveCodeStatus(code) === "unused")
        .map((code) => code.id)
    : []
  const archiveTargetOver = archiveTarget ? cohortOver(archiveTarget, now) : false

  // Reopening un-archives; a cohort whose last day has also passed needs a later one to let members back in.
  const reopenZone = cohortZone(reopenTarget?.timezone)
  const reopenToday = dayIn(now, reopenZone)
  const reopenSavedLastDay = reopenTarget ? lastDayOfCohort(reopenTarget) : null
  const reopenPastLastDay = !!reopenSavedLastDay && reopenSavedLastDay < reopenToday
  const reopenStartDay = reopenTarget ? dayIn(reopenTarget.startDate, reopenZone) : ""
  const reopenStillOver = reopenPastLastDay && !(reopenLastDay && reopenLastDay >= reopenToday)

  // The settings dialog's dates. The start moves only on a draft that hasn't
  // started; the last day moves at any time, and one already past ends the cohort.
  const experienceZone = cohortZone(experienceTarget?.timezone)
  const experienceToday = dayIn(now, experienceZone)
  const experienceStartEditable = experienceTarget ? cohortStartEditable(experienceTarget, now) : false
  const experienceSavedLastDay = experienceTarget ? lastDayOfCohort(experienceTarget) ?? "" : ""
  const experienceLastDay = experienceForm?.lastDay ?? ""
  const experienceEndedNow = experienceTarget ? cohortOver(experienceTarget, now) : false
  const experienceLastDayMoved = experienceLastDay !== experienceSavedLastDay
  const experienceEndsOnSave = experienceLastDayMoved && !experienceEndedNow && isDayKey(experienceLastDay) && experienceLastDay < experienceToday
  const experienceLastDayNote = !experienceLastDay ? "No last day is set, so the cohort only ends when it's archived."
    : experienceEndsOnSave ? <strong className="font-medium text-destructive">That day has passed, so saving ends {experienceTarget?.name} for its members straight away.</strong>
    : experienceLastDay < experienceToday ? <>That day has passed, so the cohort is over for its members.</>
    : experienceEndedNow && experienceLastDayMoved ? <>Saving reopens it: members go back in until the end of {formatDayKey(experienceLastDay)}.</>
    : <>Members are in until the end of {formatDayKey(experienceLastDay)}. The program's weeks don't move.</>

  // The settings dialog's program. Moving it moves the cohort only: members
  // already in, and codes already issued, keep the program their code carries.
  const experienceProgramEditable = experienceTarget ? cohortProgramEditable(experienceTarget) : false
  const experienceProgram = experienceForm?.program ?? null
  const experienceProgramItems = [
    // A pin to a program that's no longer published still shows as itself.
    ...(experienceTarget?.programId && !programs.some((program) => program.id === experienceTarget.programId)
      ? [{ label: `${experienceTarget.programName ?? experienceTarget.programId} · v${experienceTarget.programVersion ?? 1}`, value: experienceTarget.programId }]
      : []),
    ...programs.map((program) => ({ label: `${program.name} · v${program.version}`, value: program.id })),
  ]
  const experienceProgramLeftBehind = experienceTarget && experienceProgram
    ? membersAndCodes(
        (membersQuery.data ?? []).filter((member) => member.cohortId === experienceTarget.id && member.programId && member.programId !== experienceProgram.id).length,
        (codesQuery.data ?? []).filter((code) => code.cohortId === experienceTarget.id && effectiveCodeStatus(code) === "unused" && code.programId && code.programId !== experienceProgram.id).length,
      )
    : ""
  const experienceProgramNote = !experienceTarget ? null
    : !experienceProgramEditable ? <>Locked: {experienceTarget.name} is active.</>
    : experienceProgram && experienceProgramLeftBehind ? <><strong className="font-medium text-destructive">Saving leaves {experienceProgramLeftBehind} on the program they were issued with.</strong> Only codes issued after it get {experienceProgram.name}.</>
    : experienceProgram ? <>Codes issued after saving get {experienceProgram.name}.</>
    : !experienceTarget.programId ? <>Codes can’t be issued until it has one.</>
    : <>It can change until {experienceTarget.name} is activated.</>

  const lastDayPreview = isDayKey(startDate) && Number.parseInt(durationWeeks, 10) >= 1
    ? formatDayKey(lastDayOf(startDate, Number.parseInt(durationWeeks, 10)))
    : null

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

    const selectedProgram = programs.find((program) => program.id === effectiveProgramId)
    if (!selectedProgram) {
      toast.error("Choose a published program.")
      return
    }
    createMutation.mutate({
      name,
      startDay: startDate,
      durationWeeks: Number.parseInt(durationWeeks, 10),
      status: status as "active" | "draft",
      program: selectedProgram,
      coach: coachValue,
      registration: offerValue,
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
    statusMutation.mutate({ cohort, currentUser: user })
  }

  function openArchive(cohort: CohortRecord) {
    setArchiveTarget(cohort)
    setRevokeUnusedCodes(true)
  }

  function handleArchive() {
    if (!user || !archiveTarget) return
    archiveMutation.mutate({
      cohort: archiveTarget,
      codeIds: revokeUnusedCodes ? archiveCodeIds : [],
      currentUser: user,
    })
  }

  function openReopen(cohort: CohortRecord) {
    setReopenTarget(cohort)
    setReopenLastDay("")
  }

  function handleReopen() {
    if (!user || !reopenTarget) return
    reopenMutation.mutate({ cohort: reopenTarget, lastDay: reopenLastDay, currentUser: user })
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
    cohortColumnHelper.accessor((cohort) => effectiveStatusOf(cohort, now), {
      id: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => statusBadge(row.original, now),
    }),
    cohortColumnHelper.accessor((cohort) => cohort.startDate.getTime(), {
      id: "startDate",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Start date" />
      ),
      cell: ({ row }) => formatCohortDay(row.original, row.original.startDate),
    }),
    cohortColumnHelper.accessor((cohort) => cohort.endDate?.getTime() ?? 0, {
      id: "lastDay",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Last day" />
      ),
      cell: ({ row }) => formatCohortDay(row.original, row.original.endDate),
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
        if (cohortProgramEditable(cohort)) {
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
            onSelect: () => openArchive(cohort),
          })
        }
        if (cohort.status === "archived") {
          actions.push({
            label: "Reopen cohort",
            icon: ArchiveRestoreIcon,
            disabled: isUpdating || !!singleCohortBlock,
            onSelect: () => openReopen(cohort),
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
          <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
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
                <div className="grid gap-4 sm:grid-cols-2">
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
                    <FieldDescription>
                      {zoneLabel(DEFAULT_TIMEZONE)}.{lastDayPreview && <> Its last day is {lastDayPreview}; members are in until the end of it.</>}
                    </FieldDescription>
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
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
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
                </div>
                <Card size="sm">
                  <CardHeader><CardTitle>Sales</CardTitle><CardDescription>What the landing page sells this cohort for, and when.</CardDescription></CardHeader>
                  <CardContent><CohortSalesFields id="cohort-sales" value={offerValue} onChange={setOffer} zone={DEFAULT_TIMEZONE} disabled={isCreating} required /></CardContent>
                </Card>
                <Card size="sm">
                  <CardHeader><CardTitle>Coach identity</CardTitle><CardDescription>Shown in the member’s private coach conversation.</CardDescription></CardHeader>
                  <CardContent><CohortCoachFields id="cohort-coach" value={coachValue} onChange={setCoach} disabled={isCreating} /></CardContent>
                </Card>
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
                [cohort.name, cohort.status, effectiveStatusOf(cohort, now), cohort.programName ?? ""].join(" ")
              }
              columnLabels={{
                name: "Name",
                status: "Status",
                startDate: "Start date",
                lastDay: "Last day",
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
                  <CardHeader><CardTitle>Dates</CardTitle><CardDescription>Days on the cohort’s calendar, {zoneLabel(experienceZone)}. The start can move only while the cohort is a draft that hasn’t started; the last day can move at any time.</CardDescription></CardHeader>
                  <CardContent><div className="grid gap-4 sm:grid-cols-2">
                    <Field data-disabled={isUpdating || !experienceStartEditable || undefined}>
                      <FieldLabel htmlFor="settings-start-date">Start date</FieldLabel>
                      <Input
                        id="settings-start-date"
                        type="date"
                        min={experienceToday}
                        value={experienceForm.startDay}
                        disabled={isUpdating || !experienceStartEditable}
                        required
                        className="h-11 sm:h-8"
                        onChange={(event) => {
                          const startDay = event.target.value
                          // Like Settings → Challenge timing: the last day follows, to the end of the final week.
                          setExperienceForm((current) => current ? { ...current, startDay, lastDay: isDayKey(startDay) ? lastDayOf(startDay, experienceTarget.durationWeeks) : current.lastDay } : current)
                        }}
                      />
                      <FieldDescription>
                        {experienceStartEditable
                          ? <>Moving it moves the last day to the end of week {experienceTarget.durationWeeks}.</>
                          : experienceTarget.startDate.getTime() <= now.getTime() ? <>Locked: {experienceTarget.name} has started.</> : <>Locked: only a draft cohort’s start can move.</>}
                      </FieldDescription>
                    </Field>
                    <Field data-disabled={isUpdating || undefined}>
                      <FieldLabel htmlFor="settings-last-day">Last day</FieldLabel>
                      <Input
                        id="settings-last-day"
                        type="date"
                        min={experienceForm.startDay}
                        value={experienceForm.lastDay}
                        disabled={isUpdating}
                        required={!!experienceSavedLastDay || experienceForm.startDay !== dayIn(experienceTarget.startDate, experienceZone)}
                        className="h-11 sm:h-8"
                        onChange={(event) => setExperienceForm((current) => current ? { ...current, lastDay: event.target.value } : current)}
                      />
                      <FieldDescription>{experienceLastDayNote}</FieldDescription>
                    </Field>
                  </div></CardContent>
                </Card>

                <Card size="sm">
                  <CardHeader><CardTitle>Program</CardTitle><CardDescription>The plan members train on. It can change while the cohort is a draft, and locks once it’s active.</CardDescription></CardHeader>
                  <CardContent>
                    <Field data-disabled={isUpdating || !experienceProgramEditable || undefined}>
                      <FieldLabel htmlFor="settings-program">Assigned program</FieldLabel>
                      <Select
                        items={experienceProgramItems}
                        value={experienceProgram?.id ?? experienceTarget.programId ?? ""}
                        disabled={isUpdating || !experienceProgramEditable}
                        onValueChange={(value) => value && setExperienceForm((current) => current ? { ...current, program: value === experienceTarget.programId ? null : programs.find((program) => program.id === value) ?? null } : current)}
                      >
                        <SelectTrigger id="settings-program" className="h-11 w-full sm:h-8">
                          <SelectValue placeholder="Select a published program" />
                        </SelectTrigger>
                        <SelectContent><SelectGroup>{experienceProgramItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
                      </Select>
                      <FieldDescription>{experienceProgramNote}</FieldDescription>
                    </Field>
                  </CardContent>
                </Card>

                <Card size="sm">
                  <CardHeader><CardTitle>Coach identity</CardTitle><CardDescription>Shown in the member’s private coach conversation.</CardDescription></CardHeader>
                  <CardContent><CohortCoachFields id="coach" value={experienceForm.coach} disabled={isUpdating} onChange={(value) => setExperienceForm((current) => current ? { ...current, coach: value } : current)} /></CardContent>
                </Card>

                <Card size="sm">
                  <CardHeader><CardTitle>Sales</CardTitle><CardDescription>What the landing page sells this cohort for, and when. Either pre-order date can move at any time.</CardDescription></CardHeader>
                  <CardContent><CohortSalesFields id="sales" value={experienceForm.registration} zone={cohortZone(experienceTarget.timezone)} disabled={isUpdating} onChange={(value) => setExperienceForm((current) => current ? { ...current, registration: value } : current)} /></CardContent>
                </Card>

                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Live call</CardTitle>
                    <CardDescription><CohortNextCall cohort={experienceTarget} /></CardDescription>
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
              <DialogFooter><Button type="button" variant="outline" disabled={isUpdating} onClick={() => { setExperienceTarget(null); setExperienceForm(null) }}>Cancel</Button><Button type="submit" variant={experienceEndsOnSave ? "destructive" : "default"} disabled={isUpdating}>{isUpdating && <Spinner data-icon="inline-start" />} {experienceEndsOnSave ? "Save and end cohort" : "Save settings"}</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(archiveTarget)} onOpenChange={(open) => !isUpdating && !open && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia><ArchiveIcon /></AlertDialogMedia>
            <AlertDialogTitle>{archiveTargetOver ? `Archive ${archiveTarget?.name}?` : `End ${archiveTarget?.name} now?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {archiveTargetOver
                ? <>Its last day has passed, so its members already see "Your cohort has ended". Archiving keeps it that way whatever its dates say, hides it from the cohort picker, and stops new codes being issued for it.</>
                : <>Archiving ends the cohort for {membersQuery.isPending ? "its members" : `its ${archiveMembers} member${archiveMembers === 1 ? "" : "s"}`} straight away. Their app moves to "Your cohort has ended", with their totals, and they can no longer train, check in or chat. No new codes can be issued for it. You can reopen it later.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {codesQuery.isPending ? (
            <Skeleton className="h-10 w-full" />
          ) : archiveCodeIds.length > 0 ? (
            <Field orientation="horizontal" className="gap-2" data-disabled={isUpdating || undefined}>
              <Switch id="archive-revoke-codes" checked={revokeUnusedCodes} disabled={isUpdating} onCheckedChange={setRevokeUnusedCodes} />
              <div className="grid gap-0.5">
                <FieldLabel htmlFor="archive-revoke-codes">
                  Also revoke its {archiveCodeIds.length} unused code{archiveCodeIds.length === 1 ? "" : "s"}
                </FieldLabel>
                <FieldDescription className="text-xs">
                  Codes already issued still redeem after archiving, but the new member lands straight on the ended screen.
                </FieldDescription>
              </div>
            </Field>
          ) : (
            <p className="text-sm text-muted-foreground">It has no unused codes waiting to be redeemed.</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUpdating}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={isUpdating || codesQuery.isPending} onClick={() => void handleArchive()}>
              {archiveMutation.isPending && <Spinner data-icon="inline-start" />} {archiveTargetOver ? "Archive cohort" : "End and archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(reopenTarget)} onOpenChange={(open) => !isUpdating && !open && setReopenTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia><ArchiveRestoreIcon /></AlertDialogMedia>
            <AlertDialogTitle>Reopen {reopenTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {reopenPastLastDay
                ? <>Its last day, {reopenSavedLastDay && formatDayKey(reopenSavedLastDay)}, has passed too, so reopening alone leaves members on "Your cohort has ended". Set a later last day to let them back in.</>
                : <>Its members go back into the app straight away and can train, check in and chat again{reopenSavedLastDay ? <>, until the end of {formatDayKey(reopenSavedLastDay)}</> : null}.</>}
              {reopenTarget && !reopenTarget.programId && <> It has no program, so it reopens as a draft.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {reopenPastLastDay && (
            <Field data-disabled={isUpdating || undefined}>
              <FieldLabel htmlFor="reopen-last-day">New last day <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel>
              <Input
                id="reopen-last-day"
                type="date"
                min={reopenStartDay}
                value={reopenLastDay}
                disabled={isUpdating}
                onChange={(event) => setReopenLastDay(event.target.value)}
              />
              <FieldDescription>
                {reopenStillOver
                  ? <>Leave it empty, or pick a day before today, and the cohort stays over.</>
                  : <>Members are in until the end of {formatDayKey(reopenLastDay)}, {zoneLabel(reopenZone)}.</>}
              </FieldDescription>
            </Field>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUpdating}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={isUpdating || (!!reopenLastDay && reopenLastDay < reopenStartDay)} onClick={() => void handleReopen()}>
              {reopenMutation.isPending && <Spinner data-icon="inline-start" />} Reopen cohort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
