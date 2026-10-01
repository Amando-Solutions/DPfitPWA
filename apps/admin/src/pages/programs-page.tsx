import { type FormEvent, useMemo, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { createColumnHelper } from "@tanstack/react-table"
import { useNavigate } from "react-router-dom"
import {
  AlertCircleIcon,
  CalendarDaysIcon,
  DumbbellIcon,
  LibraryIcon,
  PlusIcon,
} from "lucide-react"
import { toast } from "sonner"

import { DataTable } from "@/components/data-table/data-table"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import type { DataTableFeatures } from "@/components/data-table/data-table-features"
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
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useAdminAuth } from "@/hooks/use-admin-auth"
import { useCohortsQuery, useProgramsQuery } from "@/hooks/use-admin-queries"
import type { CohortRecord } from "@/lib/cohorts"
import {
  createProgram,
  type ProgramRecord,
} from "@/lib/programs"

const programColumnHelper = createColumnHelper<DataTableFeatures, ProgramRecord>()

function ProgramCohorts({ cohorts }: { cohorts: CohortRecord[] }) {
  if (!cohorts.length) return <span className="text-muted-foreground">—</span>
  const shown = cohorts.slice(0, 2)
  return (
    <div className="flex flex-wrap items-center gap-1" title={cohorts.map((cohort) => `${cohort.name} (${cohort.status})`).join(", ")}>
      {shown.map((cohort) => (
        <Badge key={cohort.id} variant={cohort.status === "active" ? "secondary" : "outline"} className="max-w-36">
          {cohort.status === "active" && <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />}
          <span className="truncate">{cohort.name}</span>
        </Badge>
      ))}
      {cohorts.length > shown.length && <span className="text-xs text-muted-foreground">+{cohorts.length - shown.length}</span>}
    </div>
  )
}

function ProgramStatusBadge({ status }: { status: ProgramRecord["status"] }) {
  return (
    <Badge variant={status === "published" ? "secondary" : "outline"}>
      {status === "published" ? "Published" : status === "archived" ? "Archived" : "Draft"}
    </Badge>
  )
}

export function ProgramsPage() {
  const navigate = useNavigate()
  const { user } = useAdminAuth()
  const programsQuery = useProgramsQuery()
  const programs = useMemo(() => programsQuery.data ?? [], [programsQuery.data])
  const cohortsQuery = useCohortsQuery()
  // Cohorts pin one program version; archived cohorts no longer run anything.
  const cohortsByProgram = useMemo(() => {
    const map = new Map<string, CohortRecord[]>()
    for (const cohort of cohortsQuery.data ?? []) {
      if (!cohort.programId || cohort.status === "archived") continue
      map.set(cohort.programId, [...(map.get(cohort.programId) ?? []), cohort])
    }
    return map
  }, [cohortsQuery.data])
  const isLoading = programsQuery.isPending
  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState("")
  const [totalWeeks, setTotalWeeks] = useState("6")
  const [sessionsPerWeek, setSessionsPerWeek] = useState("4")
  const createMutation = useMutation({
    mutationFn: createProgram,
    onSuccess: (programId) => {
      setDialogOpen(false)
      toast.success("Program draft created")
      void navigate(`/programs/${programId}`)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Program could not be created.")
    },
  })
  const isCreating = createMutation.isPending

  const publishedCount = useMemo(
    () => programs.filter((program) => program.status === "published").length,
    [programs],
  )
  const workoutDayCount = useMemo(
    () => programs.reduce((total, program) => total + program.workoutDayCount, 0),
    [programs],
  )
  const programColumns = useMemo(
    () =>
      programColumnHelper.columns([
        programColumnHelper.accessor("name", {
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Program" />
          ),
          cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
        }),
        programColumnHelper.accessor("status", {
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Status" />
          ),
          cell: ({ getValue }) => <ProgramStatusBadge status={getValue()} />,
        }),
        programColumnHelper.accessor("totalWeeks", {
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Duration" />
          ),
          cell: ({ row }) => `${row.original.totalWeeks} weeks · ${row.original.totalDays} days`,
        }),
        programColumnHelper.accessor("sessionsPerWeek", {
          id: "schedule",
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Schedule" />
          ),
          cell: ({ getValue }) => `${getValue()} sessions/week`,
        }),
        programColumnHelper.accessor((program) => cohortsByProgram.get(program.id)?.length ?? 0, {
          id: "cohorts",
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Cohorts" />
          ),
          cell: ({ row }) => <ProgramCohorts cohorts={cohortsByProgram.get(row.original.id) ?? []} />,
        }),
        programColumnHelper.accessor("version", {
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Version" />
          ),
          cell: ({ getValue }) => <span className="font-mono">v{getValue()}</span>,
        }),
      ]),
    [cohortsByProgram],
  )

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) {
      toast.error("Your admin session has expired. Sign in again.")
      return
    }

    createMutation.mutate({
      name,
      totalWeeks: Number.parseInt(totalWeeks, 10),
      sessionsPerWeek: Number.parseInt(sessionsPerWeek, 10),
      user,
    })
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <section className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Programs</h1>
        <Dialog open={dialogOpen} onOpenChange={(open) => !isCreating && setDialogOpen(open)}>
          <DialogTrigger render={<Button className="min-h-11 sm:min-h-8" />}>
            <PlusIcon data-icon="inline-start" /> Create program
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleCreate} className="contents">
              <DialogHeader>
                <DialogTitle>Create program</DialogTitle>
              </DialogHeader>
              <FieldGroup>
                <Field data-disabled={isCreating || undefined}>
                  <FieldLabel htmlFor="program-name">Name</FieldLabel>
                  <Input
                    id="program-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    minLength={2}
                    maxLength={100}
                    disabled={isCreating}
                    autoFocus
                    required
                    className="h-11 sm:h-8"
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field data-disabled={isCreating || undefined}>
                    <FieldLabel htmlFor="program-weeks">Duration in weeks</FieldLabel>
                    <Input
                      id="program-weeks"
                      type="number"
                      min="1"
                      max="52"
                      value={totalWeeks}
                      onChange={(event) => setTotalWeeks(event.target.value)}
                      disabled={isCreating}
                      required
                      className="h-11 sm:h-8"
                    />
                  </Field>
                  <Field data-disabled={isCreating || undefined}>
                    <FieldLabel htmlFor="program-sessions">Sessions per week</FieldLabel>
                    <Input
                      id="program-sessions"
                      type="number"
                      min="1"
                      max="7"
                      value={sessionsPerWeek}
                      onChange={(event) => setSessionsPerWeek(event.target.value)}
                      disabled={isCreating}
                      required
                      className="h-11 sm:h-8"
                    />
                  </Field>
                </div>
              </FieldGroup>
              <DialogFooter>
                <DialogClose render={<Button type="button" variant="outline" disabled={isCreating} />}>
                  Cancel
                </DialogClose>
                <Button type="submit" disabled={isCreating}>
                  {isCreating && <Spinner data-icon="inline-start" />}
                  Continue
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </section>

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
            <CardDescription>Programs</CardDescription>
            <CardTitle className="font-mono text-3xl tabular-nums">
              {isLoading ? <Skeleton className="h-9 w-12" /> : programs.length}
            </CardTitle>
            <CardAction><LibraryIcon className="size-4 text-muted-foreground" /></CardAction>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Published</CardDescription>
            <CardTitle className="font-mono text-3xl tabular-nums">
              {isLoading ? <Skeleton className="h-9 w-12" /> : publishedCount}
            </CardTitle>
            <CardAction><CalendarDaysIcon className="size-4 text-muted-foreground" /></CardAction>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Workout days</CardDescription>
            <CardTitle className="font-mono text-3xl tabular-nums">
              {isLoading ? <Skeleton className="h-9 w-12" /> : workoutDayCount}
            </CardTitle>
            <CardAction><DumbbellIcon className="size-4 text-muted-foreground" /></CardAction>
          </CardHeader>
        </Card>
      </section>

      <Card className="flex-1">
        <CardHeader className="border-b">
          <CardTitle>Program library</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading && (
            <div className="flex flex-col gap-3 p-4" role="status">
              <span className="sr-only">Loading programs</span>
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          )}

          {!isLoading && programs.length > 0 && (
            <DataTable
              columns={programColumns}
              data={programs}
              searchPlaceholder="Filter programs..."
              searchAccessor={(program) =>
                [program.name, program.status, `v${program.version}`, `${program.totalWeeks} weeks`, ...(cohortsByProgram.get(program.id) ?? []).map((cohort) => cohort.name)].join(" ")
              }
              columnLabels={{
                name: "Program",
                status: "Status",
                totalWeeks: "Duration",
                schedule: "Schedule",
                cohorts: "Cohorts",
                version: "Version",
              }}
              onRowClick={(program) => navigate(`/programs/${encodeURIComponent(program.id)}`)}
              getRowLabel={(program) => `Open ${program.name}`}
            />
          )}

          {!isLoading && programs.length === 0 && (
            <Empty className="min-h-80">
              <EmptyHeader>
                <EmptyMedia variant="icon"><LibraryIcon /></EmptyMedia>
                <EmptyTitle>No programs yet</EmptyTitle>
              </EmptyHeader>
              <Button type="button" onClick={() => setDialogOpen(true)}>
                <PlusIcon data-icon="inline-start" /> Create program
              </Button>
            </Empty>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
